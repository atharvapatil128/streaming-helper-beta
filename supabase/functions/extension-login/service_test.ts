import {
  calculateUsernameCredentialDelayMs,
  classifyAuthFailure,
  resolveUsernameForAuth,
  USERNAME_INVALID_MAX_DURATION_MS,
  USERNAME_INVALID_MIN_DURATION_MS,
} from "./service.ts";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.test("known and unknown usernames perform comparable profile and admin calls", async () => {
  for (const known of [true, false]) {
    const calls: string[] = [];
    const fetcher = (url: string): Promise<Response> => {
      calls.push(url);
      if (url.includes("/rest/v1/profiles?")) {
        return Promise.resolve(jsonResponse(200, known ? [{ id: "known-user-id" }] : []));
      }
      if (url.includes("/auth/v1/admin/users/")) {
        return Promise.resolve(
          known
            ? jsonResponse(200, { id: "known-user-id", email: "private@example.com" })
            : jsonResponse(404, { message: "not found" }),
        );
      }
      return Promise.reject(new Error("unexpected request"));
    };

    const result = await resolveUsernameForAuth(
      fetcher,
      "https://project.example",
      "service-key",
      "movie_fan",
      "a".repeat(64),
      new AbortController().signal,
    );
    if (calls.length !== 2 || !calls[0].includes("/profiles?") || !calls[1].includes("/admin/")) {
      throw new Error("username paths must perform profile then admin calls");
    }
    if (known && result.email !== "private@example.com") {
      throw new Error("known user's internal email was not resolved");
    }
    if (!known && (!result.email.endsWith("@invalid.invalid") || result.infrastructureFailure)) {
      throw new Error("unknown username did not use a non-routable synthetic identity");
    }
  }
});

Deno.test("username infrastructure errors still complete the admin stage and fail closed", async () => {
  const calls: string[] = [];
  const result = await resolveUsernameForAuth(
    (url: string) => {
      calls.push(url);
      if (calls.length === 1) return Promise.reject(new TypeError("network"));
      return Promise.resolve(jsonResponse(404, {}));
    },
    "https://project.example",
    "service-key",
    "movie_fan",
    "b".repeat(64),
    new AbortController().signal,
  );
  if (calls.length !== 2 || !result.infrastructureFailure) {
    throw new Error("infrastructure failure did not preserve call shape or fail closed");
  }
});

Deno.test("Auth status classification separates throttling and infrastructure failures", () => {
  if (classifyAuthFailure(400) !== "INVALID_CREDENTIALS") throw new Error("400 mapping");
  if (classifyAuthFailure(401) !== "INVALID_CREDENTIALS") throw new Error("401 mapping");
  if (classifyAuthFailure(429) !== "RATE_LIMITED") throw new Error("429 mapping");
  if (classifyAuthFailure(500) !== "SERVICE_UNAVAILABLE") throw new Error("500 mapping");
  if (classifyAuthFailure(503) !== "SERVICE_UNAVAILABLE") throw new Error("503 mapping");
});

Deno.test("username credential delay targets a deterministic 900-1100ms total", () => {
  const minimumDelay = calculateUsernameCredentialDelayMs(1_000, 1_100, 0);
  const maximumDelay = calculateUsernameCredentialDelayMs(1_000, 1_100, 200);
  if (minimumDelay !== USERNAME_INVALID_MIN_DURATION_MS - 100) {
    throw new Error("minimum target calculation changed");
  }
  if (maximumDelay !== USERNAME_INVALID_MAX_DURATION_MS - 100) {
    throw new Error("maximum target calculation changed");
  }
});

Deno.test("username credential delay wraps jitter and never adds negative delay", () => {
  const wrapped = calculateUsernameCredentialDelayMs(1_000, 1_000, 201);
  const alreadySlow = calculateUsernameCredentialDelayMs(1_000, 2_500, 200);
  const backwardClock = calculateUsernameCredentialDelayMs(1_000, 900, 0);
  if (wrapped !== USERNAME_INVALID_MIN_DURATION_MS) {
    throw new Error("jitter range did not wrap deterministically");
  }
  if (alreadySlow !== 0) throw new Error("slow requests must not receive more delay");
  if (backwardClock !== USERNAME_INVALID_MIN_DURATION_MS) {
    throw new Error("negative elapsed time was not clamped");
  }
});
