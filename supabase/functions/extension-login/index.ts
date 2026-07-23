import {
  allowedCorsOrigin,
  clientIp,
  MAX_LOGIN_BODY_BYTES,
  parseAllowedOrigins,
  parseLoginInput,
  publicSession,
  rateLimitStatus,
  readJsonBody,
  RequestValidationError,
  sha256Hex,
} from "./core.ts";
import {
  calculateUsernameCredentialDelayMs,
  classifyAuthFailure,
  resolveUsernameForAuth,
} from "./service.ts";

const REQUEST_TIMEOUT_MS = 5_000;
const allowedOrigins = parseAllowedOrigins(Deno.env.get("EXTENSION_ALLOWED_ORIGINS"));

function headers(origin: string | null): Headers {
  const result = new Headers({
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  });
  if (origin) {
    result.set("Access-Control-Allow-Origin", origin);
    result.set("Access-Control-Allow-Headers", "apikey, content-type");
    result.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    result.set("Access-Control-Max-Age", "600");
  }
  return result;
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

function serviceHeaders(key: string): HeadersInit {
  return {
    "apikey": key,
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function timedFetch(input: string, init: RequestInit): Promise<Response> {
  return await fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

async function delayUsernameInvalidCredentials(startedAtMs: number | null): Promise<void> {
  if (startedAtMs === null) return;
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const delayMs = calculateUsernameCredentialDelayMs(
    startedAtMs,
    performance.now(),
    random[0],
  );
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function consumeRateLimit(
  url: string,
  serviceKey: string,
  identifierHash: string,
  ipHash: string,
): Promise<"ALLOWED" | "RATE_LIMITED" | null> {
  const response = await timedFetch(
    `${url}/rest/v1/rpc/consume_extension_login_rate_limit`,
    {
      method: "POST",
      headers: serviceHeaders(serviceKey),
      body: JSON.stringify({
        p_identifier_hash: identifierHash,
        p_ip_hash: ipHash,
      }),
    },
  );
  if (!response.ok) return null;
  return rateLimitStatus(await response.json());
}

Deno.serve(async (req: Request): Promise<Response> => {
  const requestOrigin = req.headers.get("origin");
  const origin = allowedCorsOrigin(requestOrigin, allowedOrigins);

  if (requestOrigin && !origin) {
    return json({ error: "ORIGIN_NOT_ALLOWED" }, 403, null);
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: headers(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const hashPepper = Deno.env.get("EXTENSION_LOGIN_HASH_PEPPER");
  if (
    !supabaseUrl || !anonKey || !serviceKey || !hashPepper ||
    allowedOrigins.size === 0
  ) {
    return json({ error: "SERVICE_UNAVAILABLE" }, 503, origin);
  }

  let input;
  try {
    input = parseLoginInput(await readJsonBody(req, MAX_LOGIN_BODY_BYTES));
  } catch (error) {
    if (error instanceof RequestValidationError) {
      const status = error.code === "PAYLOAD_TOO_LARGE"
        ? 413
        : error.code === "INVALID_CONTENT_TYPE"
        ? 415
        : 400;
      return json({ error: error.code }, status, origin);
    }
    return json({ error: "INVALID_REQUEST" }, 400, origin);
  }

  try {
    const [identifierHash, ipHash] = await Promise.all([
      sha256Hex(`identifier:v1:${hashPepper}:${input.normalizedIdentifier}`),
      sha256Hex(`ip:v1:${hashPepper}:${clientIp(req)}`),
    ]);
    const rateStatus = await consumeRateLimit(
      supabaseUrl,
      serviceKey,
      identifierHash,
      ipHash,
    );
    if (rateStatus === "RATE_LIMITED") {
      return json({ error: "RATE_LIMITED" }, 429, origin);
    }
    if (rateStatus !== "ALLOWED") {
      return json({ error: "SERVICE_UNAVAILABLE" }, 503, origin);
    }

    let email = input.normalizedIdentifier;
    let usernameInfrastructureFailure = false;
    const usernameStartedAtMs = input.kind === "username" ? performance.now() : null;
    if (input.kind === "username") {
      const resolution = await resolveUsernameForAuth(
        fetch,
        supabaseUrl,
        serviceKey,
        input.normalizedIdentifier,
        identifierHash,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      );
      email = resolution.email;
      usernameInfrastructureFailure = resolution.infrastructureFailure;
    }

    const authResponse = await timedFetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "apikey": anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: input.password }),
    });
    if (!authResponse.ok) {
      const failure = classifyAuthFailure(authResponse.status);
      if (failure === "RATE_LIMITED") return json({ error: failure }, 429, origin);
      if (failure === "SERVICE_UNAVAILABLE" || usernameInfrastructureFailure) {
        return json({ error: "SERVICE_UNAVAILABLE" }, 503, origin);
      }
      await delayUsernameInvalidCredentials(usernameStartedAtMs);
      return json({ error: failure }, 401, origin);
    }
    if (usernameInfrastructureFailure) {
      return json({ error: "SERVICE_UNAVAILABLE" }, 503, origin);
    }
    const session = publicSession(await authResponse.json());
    if (!session) {
      await delayUsernameInvalidCredentials(usernameStartedAtMs);
      return json({ error: "INVALID_CREDENTIALS" }, 401, origin);
    }
    return json(session, 200, origin);
  } catch {
    return json({ error: "SERVICE_UNAVAILABLE" }, 503, origin);
  }
});
