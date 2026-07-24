import {
  allowedCorsOrigin,
  chooseCandidate,
  MAX_REQUEST_BODY_BYTES,
  MAX_TMDB_BODY_BYTES,
  parseAllowedOrigins,
  parseResolveInput,
  readJsonBody,
  RequestValidationError,
  resolutionResult,
  TmdbCandidate,
} from "./core.ts";
import { consumeTitleResolutionRateLimit, validateUserJwt } from "./service.ts";

const AUTH_TIMEOUT_MS = 3_500;
const TMDB_TIMEOUT_MS = 4_500;
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
    result.set(
      "Access-Control-Allow-Headers",
      "authorization, apikey, x-client-info, content-type",
    );
    result.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    result.set("Access-Control-Max-Age", "600");
  }
  return result;
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}

function bearerToken(req: Request): string | null {
  const authorization = req.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  return match?.[1] ?? null;
}

async function searchTmdb(apiKey: string, query: string): Promise<TmdbCandidate[]> {
  const params = new URLSearchParams({
    api_key: apiKey,
    query,
    include_adult: "false",
    language: "en-US",
    page: "1",
  });
  const response = await fetch(`https://api.themoviedb.org/3/search/multi?${params}`, {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(TMDB_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("TMDB_UNAVAILABLE");

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_TMDB_BODY_BYTES) throw new Error("TMDB_RESPONSE_TOO_LARGE");
  const body = await readJsonBody(
    new Request("https://internal.invalid", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: response.body,
    }),
    MAX_TMDB_BODY_BYTES,
    false,
  );
  if (!body || typeof body !== "object" || !("results" in body) || !Array.isArray(body.results)) {
    throw new Error("TMDB_INVALID_RESPONSE");
  }
  return body.results.slice(0, 20) as TmdbCandidate[];
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
  const tmdbApiKey = Deno.env.get("TMDB_API_KEY");
  if (!supabaseUrl || !anonKey || !tmdbApiKey || allowedOrigins.size === 0) {
    return json({ error: "SERVICE_UNAVAILABLE" }, 503, origin);
  }

  const jwt = bearerToken(req);
  if (!jwt) return json({ error: "UNAUTHENTICATED" }, 401, origin);
  try {
    const authStatus = await validateUserJwt(
      fetch,
      supabaseUrl,
      anonKey,
      jwt,
      AbortSignal.timeout(AUTH_TIMEOUT_MS),
    );
    if (authStatus === "RATE_LIMITED") {
      return json({ error: "RATE_LIMITED" }, 429, origin);
    }
    if (authStatus === "SERVICE_UNAVAILABLE") {
      return json({ error: "SERVICE_UNAVAILABLE" }, 503, origin);
    }
    if (authStatus !== "VALID") {
      return json({ error: "UNAUTHENTICATED" }, 401, origin);
    }
  } catch {
    return json({ error: "SERVICE_UNAVAILABLE" }, 503, origin);
  }

  let input;
  try {
    input = parseResolveInput(await readJsonBody(req, MAX_REQUEST_BODY_BYTES));
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

  let rateStatus;
  try {
    rateStatus = await consumeTitleResolutionRateLimit(
      fetch,
      supabaseUrl,
      anonKey,
      jwt,
      AbortSignal.timeout(AUTH_TIMEOUT_MS),
    );
    if (rateStatus === "RATE_LIMITED") {
      return json({ error: "RATE_LIMITED" }, 429, origin);
    }
    if (rateStatus !== "ALLOWED") {
      return json({ error: "SERVICE_UNAVAILABLE" }, 503, origin);
    }
  } catch {
    return json({ error: "SERVICE_UNAVAILABLE" }, 503, origin);
  }

  try {
    const match = chooseCandidate(input, await searchTmdb(tmdbApiKey, input.detectedTitle));
    const result = resolutionResult(match);
    return json(result.body, result.status, origin);
  } catch {
    return json({ error: "TITLE_RESOLUTION_UNAVAILABLE" }, 502, origin);
  }
});
