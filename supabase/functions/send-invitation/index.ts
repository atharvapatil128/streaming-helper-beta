// ============================================================================
// Edge Function — send-invitation  (Beta 2, Phase 2)
//
// An authenticated Streaming Helper user invites someone who does NOT yet have
// an account. The function creates a secure pending invitation and emails a
// tokenized join link via Resend.
//
// Security model (mirrors delete-account/index.ts)
// ────────────────────────────────────────────────
// • The caller's JWT is read from `Authorization: Bearer …`.
// • A "user client" (anon key + caller JWT) verifies identity via getUser().
//   inviter_id is ALWAYS derived from that verified user — never the body.
// • An "admin client" (service_role key) performs the invitation insert/update
//   and profile lookups. The service_role key never leaves the Edge runtime.
//
// Token model
// ───────────
// • A 32-byte random token is generated with Web Crypto and base64url-encoded
//   (no padding). The RAW token appears only in the email link + in memory.
// • Only the SHA-256 hex hash is stored in invitations.token_hash, matching the
//   database's  encode(extensions.digest(p_token,'sha256'),'hex').
// • The raw token is never stored or logged.
//
// Required Edge Function secrets (set with `supabase secrets set …`):
//   SUPABASE_URL                — project URL
//   SUPABASE_ANON_KEY           — anon/public key (used to verify the JWT)
//   SUPABASE_SERVICE_ROLE_KEY   — service-role key (admin actions only)
//   RESEND_API_KEY              — Resend API key
//   INVITE_FROM_EMAIL           — e.g. "Streaming Helper <invite@streaminghelper.net>"
//   APP_URL                     — e.g. "https://streaminghelper.net"
//
// Deploy:  supabase functions deploy send-invitation
// Invoke:  await supabase.functions.invoke('send-invitation', { body: { email } })
// ============================================================================

import { createClient } from "supabase";

declare const Deno: { env: { get(name: string): string | undefined } };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const MAX_EMAIL_LENGTH = 254; // RFC 5321 practical max
const MAX_TOKEN_BYTES = 32; // ≥ 32 bytes of entropy
const RATE_LIMIT_MAX = 10; // new invitations per inviter…
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // …per rolling 24h
const EXPLAINER =
  "Streaming Helper is a friend-powered way to exchange movie and show " +
  "recommendations and get a few useful picks when deciding what to watch.";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Basic, conservative email shape check. Pairs with length limits below.
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// base64url (no padding) of a byte array.
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // btoa is available in the Deno/Edge runtime.
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/,
    "",
  );
}

// SHA-256 → lowercase hex. Matches Postgres encode(digest(t,'sha256'),'hex').
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildEmail(opts: {
  inviterName: string;
  inviteUrl: string;
}): { subject: string; html: string; text: string } {
  const safeName = escapeHtml(opts.inviterName);
  const safeUrl = escapeHtml(opts.inviteUrl);
  const subject = `${opts.inviterName} invited you to Streaming Helper`;

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e4e4e7;">
    <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
      <h1 style="font-size:20px;font-weight:600;margin:0 0 16px;color:#ffffff;">
        ${safeName} invited you to Streaming Helper
      </h1>
      <p style="font-size:14px;line-height:1.6;color:#c5c5d8;margin:0 0 20px;">
        ${escapeHtml(EXPLAINER)}
      </p>
      <a href="${safeUrl}"
         style="display:inline-block;background:#5b5bd6;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:10px;">
        Join Streaming Helper
      </a>
      <p style="font-size:12px;line-height:1.6;color:#8b8b9e;margin:24px 0 0;">
        Or paste this link into your browser:<br />
        <span style="color:#7c7ce8;word-break:break-all;">${safeUrl}</span>
      </p>
      <p style="font-size:12px;line-height:1.6;color:#6a6a7e;margin:24px 0 0;">
        This invitation expires in 14 days. If you weren't expecting it, you can
        safely ignore this email.
      </p>
    </div>
  </body>
</html>`;

  const text = [
    `${opts.inviterName} invited you to Streaming Helper`,
    "",
    EXPLAINER,
    "",
    "Join Streaming Helper:",
    opts.inviteUrl,
    "",
    "This invitation expires in 14 days.",
    "If you weren't expecting it, you can safely ignore this email.",
  ].join("\n");

  return { subject, html, text };
}

// @ts-expect-error — Deno.serve is the Edge runtime entry point
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({
      code: "METHOD_NOT_ALLOWED",
      message: "Method not allowed",
    }, 405);
  }

  // ── 1. Read environment ────────────────────────────────────────────────────
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const INVITE_FROM_EMAIL = Deno.env.get("INVITE_FROM_EMAIL");
  const APP_URL_RAW = Deno.env.get("APP_URL");

  if (
    !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY ||
    !RESEND_API_KEY || !INVITE_FROM_EMAIL || !APP_URL_RAW
  ) {
    console.error("send-invitation: missing required env vars");
    return jsonResponse({
      code: "SERVER_MISCONFIGURED",
      message: "Server misconfigured",
    }, 500);
  }
  const APP_URL = APP_URL_RAW.replace(/\/+$/, ""); // strip trailing slash(es)

  // ── 2. Verify caller via Authorization header ─────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({
      code: "UNAUTHENTICATED",
      message: "Missing Authorization header",
    }, 401);
  }
  const jwt = authHeader.slice("Bearer ".length).trim();
  if (!jwt) {
    return jsonResponse({
      code: "UNAUTHENTICATED",
      message: "Empty bearer token",
    }, 401);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(
    jwt,
  );
  if (userError || !userData?.user) {
    return jsonResponse({
      code: "UNAUTHENTICATED",
      message: "Invalid or expired session",
    }, 401);
  }
  const inviterId = userData.user.id;
  const inviterEmail = (userData.user.email ?? "").trim().toLowerCase();

  // ── 3. Parse + validate request body ──────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({
      code: "INVALID_JSON",
      message: "Request body must be valid JSON",
    }, 400);
  }

  const rawEmail = (body as { email?: unknown })?.email;
  if (typeof rawEmail !== "string") {
    return jsonResponse({
      code: "INVALID_EMAIL",
      message: "An email address is required.",
    }, 400);
  }
  const email = rawEmail.trim().toLowerCase();
  if (
    email.length === 0 || email.length > MAX_EMAIL_LENGTH ||
    !isValidEmail(email)
  ) {
    return jsonResponse({
      code: "INVALID_EMAIL",
      message: "Enter a valid email address.",
    }, 400);
  }
  if (inviterEmail && email === inviterEmail) {
    return jsonResponse({
      code: "CANNOT_INVITE_SELF",
      message: "You can't invite yourself.",
    }, 400);
  }

  // ── 4. Admin client (service-role) ────────────────────────────────────────
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 5. Load inviter display name (safe fallback) ──────────────────────────
  let inviterName = "A friend";
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", inviterId)
      .maybeSingle();
    const dn = (profile?.display_name ?? "").trim();
    if (dn) inviterName = dn;
  } catch (err) {
    // Non-fatal: fall back to "A friend".
    console.error(
      "send-invitation: profile lookup failed",
      (err as { message?: string })?.message,
    );
  }

  // ── 6. Reject if the recipient already has an account ─────────────────────
  try {
    const { data: existingProfile, error: profErr } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email) // case-insensitive exact match (no wildcards)
      .maybeSingle();
    if (profErr) throw profErr;
    if (existingProfile) {
      return jsonResponse(
        {
          code: "ACCOUNT_EXISTS",
          message: "This person already has a Streaming Helper account.",
        },
        409,
      );
    }
  } catch (err) {
    console.error(
      "send-invitation: account-exists check failed",
      (err as { message?: string })?.message,
    );
    return jsonResponse({
      code: "LOOKUP_FAILED",
      message: "Could not process the invitation.",
    }, 500);
  }

  // ── 7. Existing pending invitation? (reuse / revoke-expired) ──────────────
  try {
    const { data: pending, error: pendErr } = await admin
      .from("invitations")
      .select("id, expires_at")
      .eq("inviter_id", inviterId)
      .eq("invitee_email", email)
      .eq("status", "pending")
      .maybeSingle();
    if (pendErr) throw pendErr;

    if (pending) {
      const expired = new Date(pending.expires_at).getTime() <= Date.now();
      if (!expired) {
        // Reuse: do not create or send again.
        return jsonResponse({
          status: "already_pending",
          expiresAt: pending.expires_at,
        }, 200);
      }
      // Expired pending → revoke so the partial unique index frees up.
      const { error: revErr } = await admin
        .from("invitations")
        .update({ status: "revoked", responded_at: new Date().toISOString() })
        .eq("id", pending.id)
        .eq("status", "pending");
      if (revErr) throw revErr;
    }
  } catch (err) {
    console.error(
      "send-invitation: pending lookup/revoke failed",
      (err as { message?: string })?.message,
    );
    return jsonResponse({
      code: "LOOKUP_FAILED",
      message: "Could not process the invitation.",
    }, 500);
  }

  // ── 8. Rate limit (only reached on the create path) ───────────────────────
  try {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count, error: cntErr } = await admin
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("inviter_id", inviterId)
      .gte("created_at", since);
    if (cntErr) throw cntErr;
    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      return jsonResponse(
        {
          code: "RATE_LIMITED",
          message:
            "You have sent too many invitations. Please try again later.",
        },
        429,
      );
    }
  } catch (err) {
    console.error(
      "send-invitation: rate-limit count failed",
      (err as { message?: string })?.message,
    );
    return jsonResponse({
      code: "LOOKUP_FAILED",
      message: "Could not process the invitation.",
    }, 500);
  }

  // ── 9. Generate token + hash ──────────────────────────────────────────────
  const tokenBytes = new Uint8Array(MAX_TOKEN_BYTES);
  crypto.getRandomValues(tokenBytes);
  const rawToken = toBase64Url(tokenBytes);
  const tokenHash = await sha256Hex(rawToken);

  // ── 10. Insert invitation (handle concurrent unique conflict) ─────────────
  let invitationId: string;
  let expiresAt: string;
  try {
    const { data: inserted, error: insErr } = await admin
      .from("invitations")
      .insert({
        inviter_id: inviterId,
        invitee_email: email,
        token_hash: tokenHash,
        status: "pending",
      })
      .select("id, expires_at")
      .single();

    if (insErr) {
      // 23505 = unique violation → a concurrent request already created a
      // pending invitation. Return its state instead of a raw DB error.
      if ((insErr as { code?: string }).code === "23505") {
        const { data: race } = await admin
          .from("invitations")
          .select("id, expires_at")
          .eq("inviter_id", inviterId)
          .eq("invitee_email", email)
          .eq("status", "pending")
          .maybeSingle();
        if (race) {
          return jsonResponse({
            status: "already_pending",
            expiresAt: race.expires_at,
          }, 200);
        }
      }
      throw insErr;
    }
    invitationId = inserted.id;
    expiresAt = inserted.expires_at;
  } catch (err) {
    console.error(
      "send-invitation: insert failed",
      (err as { message?: string })?.message,
    );
    return jsonResponse({
      code: "INSERT_FAILED",
      message: "Could not create the invitation.",
    }, 500);
  }

  // ── 11. Send email via Resend ─────────────────────────────────────────────
  const inviteUrl = `${APP_URL}/invite/${rawToken}`;
  const { subject, html, text } = buildEmail({ inviterName, inviteUrl });

  let emailOk = false;
  let providerStatus: number | null = null;
  let providerCode: string | null = null;
  try {
    const resp = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `invite-${invitationId}`,
      },
      body: JSON.stringify({
        from: INVITE_FROM_EMAIL,
        to: [email],
        subject,
        html,
        text,
      }),
    });
    providerStatus = resp.status;
    emailOk = resp.ok;
    if (!resp.ok) {
      // Capture only a sanitized provider code, never the full body to client.
      try {
        const errBody = await resp.json();
        providerCode = (errBody as { name?: string })?.name ?? null;
      } catch { /* ignore parse errors */ }
    }
  } catch (err) {
    emailOk = false;
    console.error(
      "send-invitation: Resend request threw",
      (err as { message?: string })?.message,
    );
  }

  // ── 12. Email failure cleanup ─────────────────────────────────────────────
  if (!emailOk) {
    console.error("send-invitation: email send failed", {
      providerStatus,
      providerCode,
    });
    await admin
      .from("invitations")
      .update({ status: "revoked", responded_at: new Date().toISOString() })
      .eq("id", invitationId)
      .eq("status", "pending");
    return jsonResponse(
      {
        code: "EMAIL_SEND_FAILED",
        message: "We could not send the invitation email. Please try again.",
      },
      502,
    );
  }

  // ── 13. Success ───────────────────────────────────────────────────────────
  return jsonResponse({ status: "sent", invitationId, expiresAt }, 200);
});
