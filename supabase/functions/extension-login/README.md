# extension-login

Public Supabase Edge Function for Chrome-extension password sign-in using either an email address or
an exact `@username`/`username`. It returns only:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_in": 3600,
  "expires_at": 1780000000,
  "user": { "id": "uuid" }
}
```

The request is `POST application/json` with exactly:

```json
{ "identifier": "@movie_fan", "password": "..." }
```

All responses use `Cache-Control: no-store`. Browser requests are accepted only when `Origin`
exactly matches a configured `chrome-extension://<32-char-id>` origin. Email, password, raw IP, and
raw identifiers are neither logged nor returned. Unknown users, wrong passwords, unconfirmed users,
and social-only users all receive `401 {"error":"INVALID_CREDENTIALS"}`.

The Origin allowlist is browser hardening, not authentication. Non-browser/direct clients commonly
send no `Origin` header and are allowed to reach this public login endpoint; strict request
validation and the identifier/IP rate-limit RPC remain the security boundary for those calls.

For username attempts, both known and unknown usernames perform a comparable profile lookup, Admin
Auth lookup, and password-token request. Unknown usernames use deterministic, non-routable synthetic
identifiers internally. No synthetic or real email is returned or logged. Auth throttling returns
`429 {"error":"RATE_LIMITED"}`; Auth 5xx and network failures return
`503 {"error":"SERVICE_UNAVAILABLE"}` rather than being mislabeled as a bad password.

Username `INVALID_CREDENTIALS` responses, including a rejected/malformed public session, are padded
to a cryptographically jittered 900–1100 ms total measured from immediately before username
resolution. The deterministic calculation subtracts work already completed and never adds delay once
the sampled target has elapsed. Successful login, `RATE_LIMITED`, and `SERVICE_UNAVAILABLE`
responses are not delayed.

## Required secrets

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EXTENSION_ALLOWED_ORIGINS` — comma-separated exact Chrome-extension origins
- `EXTENSION_LOGIN_HASH_PEPPER` — random server-only secret, at least 32 bytes

The Supabase-provided URL and keys may already exist in hosted functions. Keep the service-role key
and hash pepper server-side.

## Required database RPC contract

The service role must be the only role allowed to execute:

```text
consume_extension_login_rate_limit(
  p_identifier_hash text,
  p_ip_hash text
) -> "ALLOWED" | "RATE_LIMITED"
```

Both arguments are lowercase SHA-256 hex digests, domain-separated and peppered before hashing. The
RPC must atomically consume both identifier and IP buckets, return `RATE_LIMITED` when either bucket
is exhausted, and grant no execution to `PUBLIC`, `anon`, or `authenticated`. An RPC error or
unexpected result fails closed with `SERVICE_UNAVAILABLE`.

## Function auth configuration

This one function must be deployed/served with gateway JWT verification disabled because it is the
endpoint that obtains a user JWT:

```toml
[functions.extension-login]
verify_jwt = false
```

This is explicitly set in `supabase/config.toml`. Do not disable JWT verification for other
functions.

## Local checks and manual verification

```bash
deno task --config supabase/functions/extension-login/deno.json check
deno task --config supabase/functions/extension-login/deno.json test
```

Serve locally with non-production secrets and `--no-verify-jwt`. Verify:

1. Valid email and username credentials return only the documented fields.
2. Unknown, wrong, unconfirmed, and social-only credentials are indistinguishable.
3. Known and unknown username attempts each make profile, Admin Auth, and token calls.
4. Username `INVALID_CREDENTIALS` completes in at least the sampled 900–1100 ms target window.
5. Success, Auth/RPC `RATE_LIMITED`, and infrastructure failures receive no artificial delay.
6. Auth 429 maps to `RATE_LIMITED`; Auth 5xx/network failures map to `SERVICE_UNAVAILABLE`.
7. An unlisted browser `Origin` gets 403, while a no-Origin direct request reaches rate limiting.
8. Non-POST, non-JSON, extra fields, and bodies over 4096 bytes are rejected.
9. RPC exhaustion returns `RATE_LIMITED`; RPC failure prevents an auth attempt.

Do not paste real passwords or tokens into shared terminal history.
