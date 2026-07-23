import { consumeTitleResolutionRateLimit, validateUserJwt } from "./service.ts";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.test("title rate-limit RPC uses the caller JWT and no service role", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const status = await consumeTitleResolutionRateLimit(
    (url, init) => {
      requestUrl = url;
      requestInit = init;
      return Promise.resolve(jsonResponse(200, "ALLOWED"));
    },
    "https://project.example",
    "anon-key",
    "caller-jwt",
    new AbortController().signal,
  );

  const headers = new Headers(requestInit?.headers);
  if (
    status !== "ALLOWED" ||
    !requestUrl.endsWith("/rest/v1/rpc/consume_title_resolution_rate_limit") ||
    headers.get("authorization") !== "Bearer caller-jwt" ||
    headers.get("apikey") !== "anon-key" ||
    requestInit?.method !== "POST" ||
    requestInit?.body !== "{}"
  ) throw new Error("authenticated RPC request contract was not preserved");
});

Deno.test("title rate-limit RPC parses scalar limit responses and fails closed", async () => {
  for (
    const [httpStatus, body, expected] of [
      [200, "RATE_LIMITED", "RATE_LIMITED"],
      [429, { message: "throttled" }, "RATE_LIMITED"],
      [500, "ALLOWED", null],
      [200, { status: "ALLOWED" }, null],
    ] as const
  ) {
    const actual = await consumeTitleResolutionRateLimit(
      () => Promise.resolve(jsonResponse(httpStatus, body)),
      "https://project.example",
      "anon-key",
      "caller-jwt",
      new AbortController().signal,
    );
    if (actual !== expected) throw new Error(`unexpected status for HTTP ${httpStatus}`);
  }
});

Deno.test("user JWT validation distinguishes Auth throttling and outages", async () => {
  for (
    const [httpStatus, body, expected] of [
      [200, { id: "user-id" }, "VALID"],
      [401, { message: "invalid" }, "INVALID"],
      [429, { message: "throttled" }, "RATE_LIMITED"],
      [503, { message: "down" }, "SERVICE_UNAVAILABLE"],
      [200, {}, "SERVICE_UNAVAILABLE"],
    ] as const
  ) {
    const actual = await validateUserJwt(
      () => Promise.resolve(jsonResponse(httpStatus, body)),
      "https://project.example",
      "anon-key",
      "caller-jwt",
      new AbortController().signal,
    );
    if (actual !== expected) throw new Error(`unexpected Auth mapping for HTTP ${httpStatus}`);
  }
});
