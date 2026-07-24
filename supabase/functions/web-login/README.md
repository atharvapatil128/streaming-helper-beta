# Web password login

Public Edge Function used by the Streaming Helper web app to sign in with
either an email address or a username. Username-to-email resolution remains
server-side and the response never exposes the resolved email.

The function accepts `POST application/json` with exactly:

```json
{ "identifier": "@movie_fan", "password": "..." }
```

Browser requests must come from the exact `APP_URL` origin. No wildcard CORS
origin is permitted. Direct clients without an `Origin` header remain subject
to strict input validation and the shared identifier/IP login rate limit.

Required secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EXTENSION_LOGIN_HASH_PEPPER`
- `APP_URL`

The function intentionally shares the reviewed input, credential timing,
private username-resolution, and minimal-session helpers used by
`extension-login`. Gateway JWT verification is disabled because this endpoint
creates the user session and validates credentials itself.
