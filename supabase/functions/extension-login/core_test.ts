import {
  allowedCorsOrigin,
  isConfirmedPasswordUser,
  isJsonContentType,
  parseAllowedOrigins,
  parseLoginInput,
  publicSession,
  rateLimitStatus,
  sha256Hex,
} from "./core.ts";

Deno.test("allows only exact configured Chrome extension origins", () => {
  const allowed = parseAllowedOrigins(
    "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, https://evil.example",
  );
  if (
    allowedCorsOrigin("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", allowed) === null
  ) throw new Error("configured extension origin should be allowed");
  if (allowedCorsOrigin("https://evil.example", allowed) !== null) {
    throw new Error("non-extension origin must not be allowed");
  }
});

Deno.test("parses email and username identifiers without changing passwords", () => {
  const email = parseLoginInput({ identifier: " Person@Example.com ", password: "  secret  " });
  if (email.kind !== "email" || email.normalizedIdentifier !== "person@example.com") {
    throw new Error("email was not normalized");
  }
  if (email.password !== "  secret  ") throw new Error("password was modified");

  const username = parseLoginInput({ identifier: "@Movie_Fan", password: "secret" });
  if (username.kind !== "username" || username.normalizedIdentifier !== "movie_fan") {
    throw new Error("username was not normalized");
  }
});

Deno.test("rejects ambiguous bodies and invalid usernames", () => {
  for (
    const value of [
      { identifier: "ab", password: "x" },
      { identifier: "_name", password: "x" },
      { identifier: "1234", password: "x" },
      { identifier: "valid_name", password: "x", extra: true },
    ]
  ) {
    let rejected = false;
    try {
      parseLoginInput(value);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("invalid input was accepted");
  }
});

Deno.test("content type and rate result parsing are strict", () => {
  if (!isJsonContentType("application/json; charset=utf-8")) throw new Error("JSON rejected");
  if (isJsonContentType("text/plain")) throw new Error("non-JSON accepted");
  if (rateLimitStatus([{ status: "RATE_LIMITED" }]) !== "RATE_LIMITED") {
    throw new Error("rate status not parsed");
  }
  if (rateLimitStatus(true) !== null) throw new Error("unknown result accepted");
});

Deno.test("SHA-256 output is deterministic hex", async () => {
  const hash = await sha256Hex("abc");
  if (hash !== "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") {
    throw new Error("unexpected hash");
  }
});

Deno.test("session output is minimal and password users must be confirmed", () => {
  const user = {
    id: "user-id",
    email: "private@example.com",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: { providers: ["email"] },
    identities: [{ provider: "email" }],
  };
  if (!isConfirmedPasswordUser(user)) throw new Error("confirmed email user rejected");
  const result = publicSession({
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 3600,
    expires_at: 123,
    token_type: "bearer",
    user,
  });
  if (!result || JSON.stringify(result).includes("private@example.com")) {
    throw new Error("private auth data leaked");
  }
  if (isConfirmedPasswordUser({ ...user, email_confirmed_at: null })) {
    throw new Error("unconfirmed user accepted");
  }
  if (
    isConfirmedPasswordUser({
      ...user,
      app_metadata: { providers: ["google"] },
      identities: [{ provider: "google" }],
    })
  ) throw new Error("social-only user accepted");
});
