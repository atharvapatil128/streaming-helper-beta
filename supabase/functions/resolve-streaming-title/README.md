# resolve-streaming-title

Authenticated Supabase Edge Function that resolves a bounded, detected streaming title against TMDB
multi-search. It performs no writes and logs no title, user, platform, or viewing-history data.

Request:

```json
{
  "detectedTitle": "The Bear (2022)",
  "platform": "Hulu",
  "mediaTypeHint": "series"
}
```

`platform` and `mediaTypeHint` are optional (`mediaTypeHint` is `movie`, `series`, or the `tv`
alias). `platform` is accepted as bounded context but is not sent to TMDB and does not influence the
match because TMDB multi-search does not establish the source platform's catalog identity.

Successful response:

```json
{
  "tmdbId": 136315,
  "mediaType": "series",
  "title": "The Bear",
  "year": "2022",
  "posterPath": "/...",
  "backdropPath": "/...",
  "thumbnailUrl": "https://image.tmdb.org/t/p/w500/..."
}
```

An uncertain or ambiguous result is `404 {"error":"TITLE_NOT_RESOLVED"}`. The function returns only
allowlisted canonical fields and a fixed-host TMDB thumbnail URL, rejects adult candidates,
validates image paths, considers at most 20 results, and applies conservative title/type/year
matching. Every response is `no-store`.

Before contacting TMDB, the function calls `consume_title_resolution_rate_limit()` with the verified
caller JWT. The authenticated RPC returns the scalar `ALLOWED` or `RATE_LIMITED` and enforces 60
attempts per user per hour. `RATE_LIMITED` maps to HTTP 429. RPC errors, malformed results, and
network failures fail closed with `SERVICE_UNAVAILABLE`; TMDB is not called.

## Required secrets

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `TMDB_API_KEY` — TMDB v3 API key, server-side only
- `EXTENSION_ALLOWED_ORIGINS` — comma-separated exact Chrome-extension origins

Gateway JWT verification is explicitly disabled in `supabase/config.toml` because the handler
validates the bearer token through Supabase Auth and must allow unauthenticated CORS preflight
requests to reach the handler. The handler never trusts claims from an unverified JWT. Auth 429
returns `RATE_LIMITED`; Auth 5xx/network failures return `SERVICE_UNAVAILABLE`.

The exact Chrome-extension Origin allowlist is browser hardening, not user authentication. No-Origin
direct clients are accepted only with a valid user JWT and remain subject to the authenticated
60/hour RPC limit.

## Local checks and manual verification

```bash
deno task --config supabase/functions/resolve-streaming-title/deno.json check
deno task --config supabase/functions/resolve-streaming-title/deno.json test
```

With local non-production secrets, verify:

1. Missing, malformed, and expired user JWTs receive `UNAUTHENTICATED`.
2. Exact movie/series examples return only the documented metadata.
3. Ambiguous remakes without a year return `TITLE_NOT_RESOLVED`.
4. RPC `RATE_LIMITED` returns 429 and no TMDB request; RPC failure returns `SERVICE_UNAVAILABLE`.
5. Unlisted origins, non-POST/non-JSON requests, extra keys, control characters, and bodies over
   2048 bytes are rejected.
6. A delayed/unavailable TMDB call ends within the timeout and returns
   `TITLE_RESOLUTION_UNAVAILABLE`.

No deploy or production verification is part of this implementation.
