// ============================================================================
// Edge Function — send-notification-email  (Beta 2, Phase 3A)
//
// One protected server-side worker that drains the public.email_jobs outbox
// created in migration 019 and delivers transactional notification emails via
// Resend. It is intended to be triggered by a future Cron request using a
// dedicated worker secret — NOT by a browser user. (The Cron schedule is NOT
// created in this phase.)
//
// Per invocation it:
//   1. authenticates via x-notification-worker-secret (timing-safe)
//   2. claims up to 10 due jobs via claim_email_jobs()
//   3. for each job: rate-limit → source re-read → preferences →
//      confirmed-email resolution → sender/content → render → Resend send
//   4. marks every claimed job sent / skipped / retryable / failed
//
// Security model
// ──────────────
// • Only the service-role client is used; the key never leaves this runtime.
// • The invocation body NEVER controls job content. Actor/recipient ids,
//   sender names, recipient emails, titles, and templates are all resolved
//   server-side from the database keyed by the claimed job's source_id.
// • Recipient email is resolved from auth.users (confirmed only) and is never
//   stored in email_jobs, never logged, never returned.
// • No recipient preference value or delivery status is exposed to clients.
//
// Required Edge Function secrets (set with `supabase secrets set …`):
//   SUPABASE_URL               — project URL
//   SUPABASE_SERVICE_ROLE_KEY  — service-role key (admin actions only)
//   RESEND_API_KEY             — Resend API key
//   APP_URL                    — e.g. "https://streaminghelper.net"
//   NOTIFICATION_FROM_EMAIL    — e.g. "Streaming Helper <notifications@streaminghelper.net>"
//   NOTIFICATION_WORKER_SECRET — shared secret the future Cron request sends
//
// Conventions mirror supabase/functions/send-invitation/index.ts
// (createClient import, Deno env access, Resend request shape, escapeHtml,
// plain-text fallbacks, sanitized logging, JSON responses). send-invitation
// itself is NOT modified.
//
// Deploy (later, NOT in this phase):
//   supabase functions deploy send-notification-email --no-verify-jwt
// ============================================================================

import { createClient } from "supabase";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve: (handler: (req: Request) => Promise<Response> | Response) => void;
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const CLAIM_LIMIT = 10;
const RESEND_TIMEOUT_MS = 10_000;
const RETRY_MIN_SECONDS = 60; // migration 019 clamp floor
const RETRY_MAX_SECONDS = 21_600; // migration 019 clamp ceiling (6h)
const WORKER_ID_MAX = 128; // migration 019 locked_by bound

// Narrow allowlist for poster images — matches src/lib/tmdb.ts hosts.
const POSTER_HOST_ALLOWLIST = new Set<string>(["image.tmdb.org"]);

// ── Minimal JSON response (no permissive browser CORS) ──────────────────────
// This endpoint is for a server-to-server Cron call, so we intentionally do
// NOT advertise Access-Control-Allow-Origin or handle preflight for browsers.
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Timing-safe string comparison ───────────────────────────────────────────
// Constant-time within equal-length inputs; length mismatch returns false but
// still runs a dummy compare to reduce trivial timing differences.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) {
    let dummy = 1;
    const len = Math.max(ab.length, 1);
    for (let i = 0; i < len; i++) {
      dummy |= (ab[i % ab.length] ?? 0) ^ (bb[i % Math.max(bb.length, 1)] ?? 0);
    }
    return dummy === 0; // always false here, but computed in ~constant time
  }
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

// ── HTML escaping (mirrors send-invitation) ─────────────────────────────────
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Type guards for claimed-job payload ─────────────────────────────────────
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

interface ClaimedJob {
  id: string;
  event_type: "recommendation_received" | "friend_request_received";
  source_id: string;
  actor_user_id: string;
  recipient_user_id: string;
  attempt_count: number;
  created_at: string;
}

function validateClaimedJob(row: unknown): ClaimedJob | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (!isNonEmptyString(r.id)) return null;
  if (
    r.event_type !== "recommendation_received" &&
    r.event_type !== "friend_request_received"
  ) return null;
  if (!isNonEmptyString(r.source_id)) return null;
  if (!isNonEmptyString(r.actor_user_id)) return null;
  if (!isNonEmptyString(r.recipient_user_id)) return null;
  if (!isFiniteNumber(r.attempt_count)) return null;
  if (!isNonEmptyString(r.created_at)) return null;
  return {
    id: r.id,
    event_type: r.event_type,
    source_id: r.source_id,
    actor_user_id: r.actor_user_id,
    recipient_user_id: r.recipient_user_id,
    attempt_count: r.attempt_count,
    created_at: r.created_at,
  };
}

// ── URL helpers ─────────────────────────────────────────────────────────────
function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

// Poster safety: https only, host on allowlist, no embedded credentials.
function safePosterUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username !== "" || parsed.password !== "") return null;
  if (!POSTER_HOST_ALLOWLIST.has(parsed.hostname)) return null;
  return parsed.toString();
}

// ── Backoff schedule (based on the post-claim attempt number) ───────────────
// attempt 1 → 300s, 2 → 600s, 3 → 1200s, 4 → 2400s. Attempt 5 is converted to
// failed by the mark_email_job_retryable RPC regardless of the delay passed.
function backoffSeconds(attempt: number): number {
  const base = 300 * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(
    Math.max(Math.round(base), RETRY_MIN_SECONDS),
    RETRY_MAX_SECONDS,
  );
}

// Parse a numeric Retry-After (seconds). HTTP-date form is ignored (returns null).
function parseRetryAfterSeconds(header: string | null): number | null {
  if (!header) return null;
  const n = Number(header.trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(
    Math.max(Math.round(n), RETRY_MIN_SECONDS),
    RETRY_MAX_SECONDS,
  );
}

// ── Shared email design ─────────────────────────────────────────────────────
function emailShell(innerHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#0a0a0f;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="max-width:480px;background:#0f0f14;border:1px solid #1f1f28;border-radius:16px;">
            <tr>
              <td style="padding:28px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e4e4e7;">
                <div style="font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#7c7ce8;margin:0 0 20px;">
                  Streaming Helper
                </div>
                ${innerHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function ctaButton(url: string, label: string): string {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="border-radius:10px;background:#5b5bd6;">
      <a href="${safeUrl}"
         style="display:inline-block;padding:12px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
        ${safeLabel}
      </a>
    </td>
  </tr>
</table>`;
}

function emailFooter(settingsUrl: string, explanationHtml: string): string {
  const safeSettings = escapeHtml(settingsUrl);
  return `<p style="font-size:13px;line-height:1.6;color:#8b8b9e;margin:20px 0 0;">
  ${explanationHtml}
</p>
<p style="font-size:12px;line-height:1.6;color:#6a6a7e;margin:16px 0 0;">
  <a href="${safeSettings}" style="color:#7c7ce8;text-decoration:underline;">Manage email notifications</a>
</p>`;
}

// ── Recommendation template ─────────────────────────────────────────────────
function renderRecommendationEmail(opts: {
  senderName: string;
  title: string;
  mediaType: "movie" | "series";
  year: string | null;
  posterUrl: string | null;
  ctaUrl: string;
  settingsUrl: string;
}): { subject: string; html: string; text: string } {
  const safeName = escapeHtml(opts.senderName);
  const safeTitle = escapeHtml(opts.title);
  const typeLabel = opts.mediaType === "series" ? "Series" : "Movie";
  const yearText = opts.year && opts.year.trim() ? opts.year.trim() : null;
  const safeYear = yearText ? escapeHtml(yearText) : null;

  const subject = `${opts.senderName} recommended ${opts.title}`;

  const posterHtml = opts.posterUrl
    ? `<img src="${
      escapeHtml(opts.posterUrl)
    }" alt="${safeTitle} poster" width="160"
           style="display:block;width:160px;max-width:100%;height:auto;border-radius:10px;margin:0 0 16px;" />`
    : "";

  const metaLine = safeYear ? `${typeLabel} &middot; ${safeYear}` : typeLabel;

  const inner = `
<p style="font-size:15px;line-height:1.6;color:#c5c5d8;margin:0 0 16px;">
  ${safeName} thinks you&rsquo;d enjoy this
</p>
${posterHtml}
<h1 style="font-size:20px;font-weight:600;line-height:1.3;color:#ffffff;margin:0 0 6px;">
  ${safeTitle}
</h1>
<p style="font-size:13px;color:#8b8b9e;margin:0;">
  ${metaLine}
</p>
${ctaButton(opts.ctaUrl, "View recommendation")}
${
    emailFooter(
      opts.settingsUrl,
      `You&rsquo;re receiving this because ${safeName} is your friend on Streaming Helper.`,
    )
  }`;

  const textLines = [
    "Streaming Helper",
    "",
    `${opts.senderName} thinks you'd enjoy this:`,
    "",
    yearText
      ? `${opts.title} (${typeLabel}, ${yearText})`
      : `${opts.title} (${typeLabel})`,
    "",
    `View recommendation: ${opts.ctaUrl}`,
    "",
    `You're receiving this because ${opts.senderName} is your friend on Streaming Helper.`,
    `Manage email notifications: ${opts.settingsUrl}`,
  ];

  return { subject, html: emailShell(inner), text: textLines.join("\n") };
}

// ── Friend-request template ─────────────────────────────────────────────────
function renderFriendRequestEmail(opts: {
  senderName: string;
  ctaUrl: string;
  settingsUrl: string;
}): { subject: string; html: string; text: string } {
  const safeName = escapeHtml(opts.senderName);
  const subject = `${opts.senderName} sent you a friend request`;

  const inner = `
<h1 style="font-size:20px;font-weight:600;line-height:1.3;color:#ffffff;margin:0 0 12px;">
  ${safeName} wants to connect with you on Streaming Helper.
</h1>
<p style="font-size:15px;line-height:1.6;color:#c5c5d8;margin:0;">
  Friends can share movie and show recommendations with each other.
</p>
${ctaButton(opts.ctaUrl, "Review friend request")}
${
    emailFooter(
      opts.settingsUrl,
      "If you weren&rsquo;t expecting this, you can ignore this email.",
    )
  }`;

  const textLines = [
    "Streaming Helper",
    "",
    `${opts.senderName} wants to connect with you on Streaming Helper.`,
    "Friends can share movie and show recommendations with each other.",
    "",
    `Review friend request: ${opts.ctaUrl}`,
    "",
    "If you weren't expecting this, you can ignore this email.",
    `Manage email notifications: ${opts.settingsUrl}`,
  ];

  return { subject, html: emailShell(inner), text: textLines.join("\n") };
}

// ── Resend send with timeout ────────────────────────────────────────────────
type SendOutcome =
  | { kind: "sent"; providerId: string | null }
  | { kind: "retryable"; code: string; retryAfter: number | null }
  | { kind: "failed"; code: string };

async function sendViaResend(
  apiKey: string,
  idempotencyKey: string,
  payload: {
    from: string;
    to: string[];
    subject: string;
    html: string;
    text: string;
  },
): Promise<SendOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "AbortError") {
      return { kind: "retryable", code: "RESEND_TIMEOUT", retryAfter: null };
    }
    return { kind: "retryable", code: "NETWORK_ERROR", retryAfter: null };
  } finally {
    clearTimeout(timer);
  }

  const status = resp.status;

  if (status >= 200 && status < 300) {
    let providerId: string | null = null;
    try {
      const body = await resp.json();
      const id = (body as { id?: unknown })?.id;
      providerId = typeof id === "string" && id.trim() ? id.trim() : null;
    } catch {
      providerId = null; // migration 019 allows a null/blank provider id
    }
    return { kind: "sent", providerId };
  }

  if (status === 429) {
    return {
      kind: "retryable",
      code: "RESEND_RATE_LIMITED",
      retryAfter: parseRetryAfterSeconds(resp.headers.get("Retry-After")),
    };
  }
  if (status >= 500) {
    return { kind: "retryable", code: "RESEND_SERVER_ERROR", retryAfter: null };
  }
  if (status >= 400) {
    // Non-rate-limit 4xx — will not succeed on retry. Do NOT read the body
    // (it may contain the address or rendered content).
    return { kind: "failed", code: "RESEND_CLIENT_ERROR" };
  }
  return { kind: "failed", code: "RESEND_INVALID_RESPONSE" };
}

// ── Tally of per-invocation outcomes ────────────────────────────────────────
interface Tally {
  claimed: number;
  sent: number;
  skipped: number;
  retryable: number;
  failed: number;
}

// ============================================================================
// Entry point
// ============================================================================
Deno.serve(async (req: Request): Promise<Response> => {
  // ── 1. Method ─────────────────────────────────────────────────────────────
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ── 2. Environment ────────────────────────────────────────────────────────
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const APP_URL_RAW = Deno.env.get("APP_URL");
  const NOTIFICATION_FROM_EMAIL = Deno.env.get("NOTIFICATION_FROM_EMAIL");
  const NOTIFICATION_WORKER_SECRET = Deno.env.get("NOTIFICATION_WORKER_SECRET");

  if (
    !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY ||
    !APP_URL_RAW || !NOTIFICATION_FROM_EMAIL || !NOTIFICATION_WORKER_SECRET
  ) {
    console.error("send-notification-email: missing required env vars");
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }
  const APP_URL = stripTrailingSlash(APP_URL_RAW);

  // ── 3. Worker authentication (dedicated secret; no user JWT) ──────────────
  const providedSecret = req.headers.get("x-notification-worker-secret");
  if (
    !providedSecret ||
    !timingSafeEqual(providedSecret, NOTIFICATION_WORKER_SECRET)
  ) {
    // Generic 401 — never reveal which part failed.
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // ── 4. Admin (service-role) client — only inside this runtime ─────────────
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 5. Worker identity (bounded < 128 chars) ──────────────────────────────
  const execId = Deno.env.get("SB_EXECUTION_ID");
  const workerId = `notification-worker:${
    execId && execId.trim() ? execId.trim() : crypto.randomUUID()
  }`
    .slice(0, WORKER_ID_MAX);

  const tally: Tally = {
    claimed: 0,
    sent: 0,
    skipped: 0,
    retryable: 0,
    failed: 0,
  };

  // ── Mark helpers (count only on a confirmed RPC transition) ───────────────
  async function markSent(
    jobId: string,
    providerId: string | null,
  ): Promise<void> {
    const { error } = await admin.rpc("mark_email_job_sent", {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_provider_message_id: providerId,
    });
    if (error) {
      logJob(jobId, null, "MARK_SENT_FAILED");
      return;
    }
    tally.sent++;
  }
  async function markSkipped(jobId: string, reason: string): Promise<void> {
    const { error } = await admin.rpc("mark_email_job_skipped", {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_reason: reason,
    });
    if (error) {
      logJob(jobId, null, "MARK_SKIPPED_FAILED");
      return;
    }
    tally.skipped++;
  }
  async function markFailed(jobId: string, code: string): Promise<void> {
    const { error } = await admin.rpc("mark_email_job_failed", {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_error_code: code,
    });
    if (error) {
      logJob(jobId, null, "MARK_FAILED_FAILED");
      return;
    }
    tally.failed++;
  }
  async function markRetryable(
    jobId: string,
    code: string,
    seconds: number,
  ): Promise<void> {
    const { data, error } = await admin.rpc("mark_email_job_retryable", {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_error_code: code,
      p_retry_after_seconds: seconds,
    });
    if (error) {
      logJob(jobId, null, "MARK_RETRYABLE_FAILED");
      return;
    }
    // The RPC may convert a final-attempt job to 'failed'.
    if (data === "failed") tally.failed++;
    else tally.retryable++;
  }

  // ── Sanitized per-job logging (no PII / content / secrets) ────────────────
  function logJob(
    jobId: string,
    eventType: string | null,
    category: string,
  ): void {
    console.error("send-notification-email: job event", {
      jobId,
      eventType,
      category,
    });
  }

  // ── 6. Claim jobs ─────────────────────────────────────────────────────────
  let claimedRows: unknown[];
  try {
    const { data, error } = await admin.rpc("claim_email_jobs", {
      p_worker_id: workerId,
      p_limit: CLAIM_LIMIT,
    });
    if (error) {
      console.error("send-notification-email: claim failed", {
        category: "CLAIM_RPC_ERROR",
      });
      return jsonResponse({ error: "Claim failed" }, 500);
    }
    claimedRows = Array.isArray(data) ? data : [];
  } catch {
    console.error("send-notification-email: claim threw", {
      category: "CLAIM_THREW",
    });
    return jsonResponse({ error: "Claim failed" }, 500);
  }

  tally.claimed = claimedRows.length;

  // ── 7. Process each claimed job independently ─────────────────────────────
  for (const raw of claimedRows) {
    const job = validateClaimedJob(raw);

    // Malformed claimed row — mark failed when we at least have an id.
    if (!job) {
      const maybeId = (raw && typeof raw === "object")
        ? (raw as Record<string, unknown>).id
        : undefined;
      if (isNonEmptyString(maybeId)) {
        await markFailed(maybeId, "INVALID_JOB_PAYLOAD");
      } else {
        console.error("send-notification-email: unclaimable malformed row", {
          category: "INVALID_JOB_PAYLOAD_NO_ID",
        });
      }
      continue;
    }

    try {
      await processJob(job);
    } catch {
      // Unexpected error after claim → try to make it retryable so stale-lock
      // recovery is not the only safety net.
      await markRetryable(
        job.id,
        "UNEXPECTED_WORKER_ERROR",
        backoffSeconds(job.attempt_count),
      );
      logJob(job.id, job.event_type, "UNEXPECTED_WORKER_ERROR");
    }
  }

  // ── 8. Sanitized response ─────────────────────────────────────────────────
  return jsonResponse({
    status: "completed",
    claimed: tally.claimed,
    sent: tally.sent,
    skipped: tally.skipped,
    retryable: tally.retryable,
    failed: tally.failed,
  }, 200);

  // ==========================================================================
  // Per-job pipeline
  // ==========================================================================
  async function processJob(job: ClaimedJob): Promise<void> {
    // A. Rate limit ──────────────────────────────────────────────────────────
    const { data: rl, error: rlErr } = await admin.rpc(
      "evaluate_email_job_rate_limit",
      {
        p_job_id: job.id,
      },
    );
    if (rlErr) {
      await markRetryable(
        job.id,
        "RATE_LIMIT_EVAL_ERROR",
        backoffSeconds(job.attempt_count),
      );
      return;
    }
    // B. Validate the rate-limit result.
    switch (rl) {
      case "allowed":
        break;
      case "actor_daily_limit":
      case "actor_recipient_daily_limit":
        await markSkipped(job.id, "RATE_LIMITED");
        return;
      case "job_not_found":
        await markFailed(job.id, "JOB_NOT_FOUND");
        return;
      case "unsupported_event":
        await markFailed(job.id, "UNSUPPORTED_EVENT");
        return;
      default:
        await markFailed(job.id, "INVALID_RATE_LIMIT_RESULT");
        return;
    }

    // C/D/E/F/G/H are event-specific.
    if (job.event_type === "recommendation_received") {
      await processRecommendation(job);
    } else if (job.event_type === "friend_request_received") {
      await processFriendRequest(job);
    } else {
      await markFailed(job.id, "UNSUPPORTED_EVENT");
    }
  }

  // ── Preferences (shared) ──────────────────────────────────────────────────
  // Returns: 'enabled' | 'disabled' | 'error'. Missing row → enabled (Beta 2).
  async function checkPreference(
    recipientId: string,
    column: "recommendation_emails_enabled" | "friend_request_emails_enabled",
  ): Promise<"enabled" | "disabled" | "error"> {
    const { data, error } = await admin
      .from("notification_preferences")
      .select(column)
      .eq("user_id", recipientId)
      .maybeSingle();
    if (error) return "error";
    if (!data) return "enabled"; // no row → default enabled
    const value = (data as Record<string, unknown>)[column];
    if (value === false) return "disabled";
    if (value === true) return "enabled";
    return "error"; // malformed → retryable, never silently enabled
  }

  // ── Confirmed recipient email (shared) ────────────────────────────────────
  // Returns the address, or a stable skip code.
  async function resolveRecipientEmail(
    recipientId: string,
  ): Promise<{ email: string } | { skip: string }> {
    const { data, error } = await admin.auth.admin.getUserById(recipientId);
    if (error || !data?.user) return { skip: "RECIPIENT_NOT_FOUND" };
    const user = data.user as {
      email?: string | null;
      email_confirmed_at?: string | null;
      confirmed_at?: string | null;
    };
    const email = (user.email ?? "").trim();
    if (!email) return { skip: "RECIPIENT_EMAIL_MISSING" };
    const confirmed = Boolean(user.email_confirmed_at || user.confirmed_at);
    if (!confirmed) return { skip: "RECIPIENT_NOT_CONFIRMED" };
    return { email };
  }

  // ── Actor display name (shared) ───────────────────────────────────────────
  async function fetchActorDisplayName(
    actorId: string,
  ): Promise<string | null> {
    const { data, error } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", actorId)
      .maybeSingle();
    if (error || !data) return null;
    const dn = (data as { display_name?: string | null }).display_name;
    return dn && dn.trim() ? dn.trim() : null;
  }

  // ── Recommendation pipeline ───────────────────────────────────────────────
  async function processRecommendation(job: ClaimedJob): Promise<void> {
    // C. Re-read + validate source.
    const { data: rec, error } = await admin
      .from("recommendations")
      .select(
        "id, from_user_id, to_user_id, title, media_type, thumbnail_url, year, source_name, dismissed, created_at",
      )
      .eq("id", job.source_id)
      .maybeSingle();

    if (error) {
      await markRetryable(
        job.id,
        "SOURCE_READ_ERROR",
        backoffSeconds(job.attempt_count),
      );
      return;
    }
    if (!rec) {
      await markSkipped(job.id, "SOURCE_NOT_FOUND");
      return;
    }

    const r = rec as {
      from_user_id: string;
      to_user_id: string;
      title: string | null;
      media_type: "movie" | "series";
      thumbnail_url: string | null;
      year: string | null;
      source_name: string | null;
      dismissed: boolean;
    };

    if (r.dismissed === true) {
      await markSkipped(job.id, "SOURCE_NOT_ACTIVE");
      return;
    }
    if (r.from_user_id !== job.actor_user_id) {
      await markSkipped(job.id, "ACTOR_MISMATCH");
      return;
    }
    if (r.to_user_id !== job.recipient_user_id) {
      await markSkipped(job.id, "RECIPIENT_MISMATCH");
      return;
    }
    if (r.from_user_id === r.to_user_id) {
      await markSkipped(job.id, "ACTOR_MISMATCH");
      return;
    }

    // Friendship: directed row (user_id = actor, friend_id = recipient).
    // Migration 006 writes BOTH directions on accept, so one row is sufficient
    // proof of a current friendship.
    const { data: friendship, error: friErr } = await admin
      .from("friendships")
      .select("id")
      .eq("user_id", r.from_user_id)
      .eq("friend_id", r.to_user_id)
      .maybeSingle();
    if (friErr) {
      await markRetryable(
        job.id,
        "FRIENDSHIP_READ_ERROR",
        backoffSeconds(job.attempt_count),
      );
      return;
    }
    if (!friendship) {
      await markSkipped(job.id, "NOT_FRIENDS");
      return;
    }

    // D. Preferences.
    const pref = await checkPreference(
      job.recipient_user_id,
      "recommendation_emails_enabled",
    );
    if (pref === "error") {
      await markRetryable(
        job.id,
        "PREFERENCE_READ_ERROR",
        backoffSeconds(job.attempt_count),
      );
      return;
    }
    if (pref === "disabled") {
      await markSkipped(job.id, "PREFERENCE_DISABLED");
      return;
    }

    // E. Confirmed recipient email.
    const recip = await resolveRecipientEmail(job.recipient_user_id);
    if ("skip" in recip) {
      await markSkipped(job.id, recip.skip);
      return;
    }

    // F. Sender/content.
    const displayName = await fetchActorDisplayName(r.from_user_id);
    const senderName = displayName ??
      (r.source_name && r.source_name.trim() ? r.source_name.trim() : null) ??
      "A friend";
    const title = r.title && r.title.trim() ? r.title.trim() : "a title";
    const posterUrl = safePosterUrl(r.thumbnail_url);

    // G. Render + send.
    const ctaUrl = `${APP_URL}/?highlight=rec:${
      encodeURIComponent(job.source_id)
    }`;
    const settingsUrl = `${APP_URL}/?action=notification-settings`;
    const email = renderRecommendationEmail({
      senderName,
      title,
      mediaType: r.media_type,
      year: r.year,
      posterUrl,
      ctaUrl,
      settingsUrl,
    });

    const outcome = await sendViaResend(
      RESEND_API_KEY!,
      `recommendation-received/${job.source_id}`,
      {
        from: NOTIFICATION_FROM_EMAIL!,
        to: [recip.email],
        subject: email.subject,
        html: email.html,
        text: email.text,
      },
    );

    // H. Mark.
    await applySendOutcome(job, outcome);
  }

  // ── Friend-request pipeline ───────────────────────────────────────────────
  async function processFriendRequest(job: ClaimedJob): Promise<void> {
    const { data: fr, error } = await admin
      .from("friend_requests")
      .select("id, requester_id, recipient_id, status, created_at")
      .eq("id", job.source_id)
      .maybeSingle();

    if (error) {
      await markRetryable(
        job.id,
        "SOURCE_READ_ERROR",
        backoffSeconds(job.attempt_count),
      );
      return;
    }
    if (!fr) {
      await markSkipped(job.id, "SOURCE_NOT_FOUND");
      return;
    } // includes hard-deleted cancels

    const f = fr as {
      requester_id: string;
      recipient_id: string | null;
      status: string;
    };

    if (f.status !== "pending") {
      await markSkipped(job.id, "SOURCE_NOT_ACTIVE");
      return;
    }
    if (f.requester_id !== job.actor_user_id) {
      await markSkipped(job.id, "ACTOR_MISMATCH");
      return;
    }
    if (f.recipient_id !== job.recipient_user_id) {
      await markSkipped(job.id, "RECIPIENT_MISMATCH");
      return;
    }
    if (f.requester_id === f.recipient_id) {
      await markSkipped(job.id, "ACTOR_MISMATCH");
      return;
    }

    const pref = await checkPreference(
      job.recipient_user_id,
      "friend_request_emails_enabled",
    );
    if (pref === "error") {
      await markRetryable(
        job.id,
        "PREFERENCE_READ_ERROR",
        backoffSeconds(job.attempt_count),
      );
      return;
    }
    if (pref === "disabled") {
      await markSkipped(job.id, "PREFERENCE_DISABLED");
      return;
    }

    const recip = await resolveRecipientEmail(job.recipient_user_id);
    if ("skip" in recip) {
      await markSkipped(job.id, recip.skip);
      return;
    }

    const displayName = await fetchActorDisplayName(f.requester_id);
    const senderName = displayName ?? "A Streaming Helper user";

    const ctaUrl = `${APP_URL}/?action=friend-requests`;
    const settingsUrl = `${APP_URL}/?action=notification-settings`;
    const email = renderFriendRequestEmail({ senderName, ctaUrl, settingsUrl });

    const outcome = await sendViaResend(
      RESEND_API_KEY!,
      `friend-request-received/${job.source_id}`,
      {
        from: NOTIFICATION_FROM_EMAIL!,
        to: [recip.email],
        subject: email.subject,
        html: email.html,
        text: email.text,
      },
    );

    await applySendOutcome(job, outcome);
  }

  // ── Apply a Resend outcome to the job's final state ───────────────────────
  async function applySendOutcome(
    job: ClaimedJob,
    outcome: SendOutcome,
  ): Promise<void> {
    if (outcome.kind === "sent") {
      await markSent(job.id, outcome.providerId);
      return;
    }
    if (outcome.kind === "retryable") {
      const delay = outcome.retryAfter ?? backoffSeconds(job.attempt_count);
      await markRetryable(job.id, outcome.code, delay);
      return;
    }
    // failed
    await markFailed(job.id, outcome.code);
  }
});
