export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
export type ResolutionRateLimitStatus = "ALLOWED" | "RATE_LIMITED" | null;
export type UserJwtStatus =
  | "VALID"
  | "INVALID"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE";

export async function validateUserJwt(
  fetcher: Fetcher,
  supabaseUrl: string,
  anonKey: string,
  jwt: string,
  signal: AbortSignal,
): Promise<UserJwtStatus> {
  const response = await fetcher(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      "apikey": anonKey,
      "Authorization": `Bearer ${jwt}`,
    },
    signal,
  });
  if (response.status === 429) return "RATE_LIMITED";
  if (response.status >= 500) return "SERVICE_UNAVAILABLE";
  if (!response.ok) return "INVALID";
  const value: unknown = await response.json();
  return value && typeof value === "object" && "id" in value &&
      typeof value.id === "string" && value.id.length > 0
    ? "VALID"
    : "SERVICE_UNAVAILABLE";
}

export async function consumeTitleResolutionRateLimit(
  fetcher: Fetcher,
  supabaseUrl: string,
  anonKey: string,
  jwt: string,
  signal: AbortSignal,
): Promise<ResolutionRateLimitStatus> {
  const response = await fetcher(
    `${supabaseUrl}/rest/v1/rpc/consume_title_resolution_rate_limit`,
    {
      method: "POST",
      headers: {
        "apikey": anonKey,
        "Authorization": `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal,
    },
  );
  if (response.status === 429) return "RATE_LIMITED";
  if (!response.ok) return null;

  const value: unknown = await response.json();
  return value === "ALLOWED" || value === "RATE_LIMITED" ? value : null;
}
