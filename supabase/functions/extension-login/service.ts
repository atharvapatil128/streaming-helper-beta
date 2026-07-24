export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export type UsernameResolution = {
  email: string;
  infrastructureFailure: boolean;
};

export type AuthFailure = "INVALID_CREDENTIALS" | "RATE_LIMITED" | "SERVICE_UNAVAILABLE";

export const USERNAME_INVALID_MIN_DURATION_MS = 900;
export const USERNAME_INVALID_MAX_DURATION_MS = 1_100;

function serviceHeaders(key: string): HeadersInit {
  return {
    "apikey": key,
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function syntheticUserId(identifierHash: string): string {
  return `${identifierHash.slice(0, 8)}-${identifierHash.slice(8, 12)}-4${
    identifierHash.slice(13, 16)
  }-8${identifierHash.slice(17, 20)}-${identifierHash.slice(20, 32)}`;
}

function syntheticEmail(identifierHash: string): string {
  return `${identifierHash.slice(0, 32)}@invalid.invalid`;
}

export function classifyAuthFailure(status: number): AuthFailure {
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500 || status < 400 || status > 499) return "SERVICE_UNAVAILABLE";
  return "INVALID_CREDENTIALS";
}

export function calculateUsernameCredentialDelayMs(
  startedAtMs: number,
  nowMs: number,
  randomUint32: number,
): number {
  const jitterRange = USERNAME_INVALID_MAX_DURATION_MS -
    USERNAME_INVALID_MIN_DURATION_MS + 1;
  const jitterMs = (randomUint32 >>> 0) % jitterRange;
  const targetDurationMs = USERNAME_INVALID_MIN_DURATION_MS + jitterMs;
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  return Math.max(0, targetDurationMs - elapsedMs);
}

/**
 * Always performs one profile request and one Admin Auth request.
 *
 * Unknown usernames use deterministic, non-routable synthetic values so their
 * request sequence remains comparable to an existing username without exposing
 * whether a profile exists. The caller must perform the Auth token request even
 * when `infrastructureFailure` is true, then fail closed.
 */
export async function resolveUsernameForAuth(
  fetcher: Fetcher,
  url: string,
  serviceKey: string,
  username: string,
  identifierHash: string,
  signal: AbortSignal,
): Promise<UsernameResolution> {
  const fallbackId = syntheticUserId(identifierHash);
  const fallbackEmail = syntheticEmail(identifierHash);
  let userId = fallbackId;
  let profileFound = false;
  let infrastructureFailure = false;

  try {
    const query = new URLSearchParams({
      select: "id",
      username: `eq.${username}`,
      limit: "1",
    });
    const response = await fetcher(`${url}/rest/v1/profiles?${query}`, {
      headers: serviceHeaders(serviceKey),
      signal,
    });
    if (response.ok) {
      const profiles = await response.json();
      const id = Array.isArray(profiles) && typeof profiles[0]?.id === "string"
        ? profiles[0].id
        : null;
      if (id) {
        userId = id;
        profileFound = true;
      }
    } else {
      infrastructureFailure = true;
    }
  } catch {
    infrastructureFailure = true;
  }

  let email = fallbackEmail;
  try {
    const response = await fetcher(
      `${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        headers: serviceHeaders(serviceKey),
        signal,
      },
    );
    if (response.ok) {
      const user = await response.json();
      if (profileFound && user && typeof user === "object" && typeof user.email === "string") {
        email = user.email;
      } else if (profileFound) {
        infrastructureFailure = true;
      }
    } else if (profileFound || response.status >= 500) {
      infrastructureFailure = true;
    }
  } catch {
    infrastructureFailure = true;
  }

  return { email, infrastructureFailure };
}
