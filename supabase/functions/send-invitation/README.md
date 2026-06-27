# send-invitation — Supabase Edge Function

Creates a secure pending invitation for someone who does **not** yet have a
Streaming Helper account, and emails them a tokenized join link via Resend.
Part of Beta 2 (Phase 2). Pairs with migration `015_invitations.sql`.

## Why an Edge Function?

Invitation tokens must be generated server-side and stored only as a SHA-256
hash; invitation rows are write-protected by RLS (only the secure functions /
service-role may write). Sending email also requires the Resend API key, which
must never appear in browser/Vite code. An Edge Function runs on Supabase's
servers, reads secrets from the environment, and exposes only the narrow
capability we need.

## Security model

```
  Browser                 Edge Function (Deno)               Database / Resend
  ───────────────         ───────────────────────            ─────────────────
  signed-in user
  └─ JWT in
     Authorization:
     Bearer …  ─────►      1. anon-key client
                             verifies JWT via getUser()
                             → inviter_id from verified user
                           2. service-role client
                             • profile display_name
                             • profiles email exists?  ─────► public.profiles
                             • pending invite reuse/revoke
                             • rate-limit count
                             • insert invitation        ────► public.invitations
                           3. generate raw token (32B,
                             base64url); store only its
                             SHA-256 hex hash
                           4. POST email                 ───► Resend API
                           5. returns { status: 'sent' }
```

- `inviter_id` is **always** derived from the verified JWT — never the body.
- The raw token appears only in the email link and in function memory. Only its
  SHA-256 hex hash is stored, matching the DB's
  `encode(extensions.digest(token,'sha256'),'hex')`.

## Required secrets

```bash
supabase secrets set SUPABASE_URL=https://<project-ref>.supabase.co
supabase secrets set SUPABASE_ANON_KEY=<anon-public-key>
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
supabase secrets set RESEND_API_KEY=<resend-api-key>
supabase secrets set INVITE_FROM_EMAIL="Streaming Helper <invite@streaminghelper.net>"
supabase secrets set APP_URL=https://streaminghelper.net
```

## JWT verification / config.toml

JWT verification stays **enabled**. This project has no `supabase/config.toml`,
so the platform default (`verify_jwt = true`) applies — **no config change is
needed**. Do not add `verify_jwt = false`. The function additionally verifies
the caller with `getUser()`.

## Deploy (do NOT deploy as part of Phase 2)

```bash
supabase functions deploy send-invitation
```

## Local testing (with placeholder secrets)

```bash
# ./supabase/.env.local (used only by `serve`; do not commit):
#   SUPABASE_URL=...
#   SUPABASE_ANON_KEY=...
#   SUPABASE_SERVICE_ROLE_KEY=...
#   RESEND_API_KEY=test_placeholder
#   INVITE_FROM_EMAIL=Streaming Helper <invite@streaminghelper.net>
#   APP_URL=http://localhost:5173

supabase functions serve send-invitation --env-file ./supabase/.env.local

# In another terminal — invoke with a valid user JWT:
curl -X POST http://localhost:54321/functions/v1/send-invitation \
  -H "Authorization: Bearer <user-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"email":"new-person@example.com"}'
```

## Response codes

| HTTP | body.code / status        | Meaning                                            |
|------|---------------------------|----------------------------------------------------|
| 200  | `status: "sent"`          | Invitation created + email sent                    |
| 200  | `status: "already_pending"` | Unexpired pending invite reused (no new email)   |
| 400  | `INVALID_JSON`            | Body was not valid JSON                            |
| 400  | `INVALID_EMAIL`           | Missing / malformed / too-long email               |
| 400  | `CANNOT_INVITE_SELF`      | Email matches the caller's own email               |
| 401  | `UNAUTHENTICATED`         | Missing/invalid JWT                                |
| 405  | `METHOD_NOT_ALLOWED`      | Not a POST                                         |
| 409  | `ACCOUNT_EXISTS`          | Recipient already has an account                   |
| 429  | `RATE_LIMITED`            | >10 new invitations in the last 24h                |
| 500  | `SERVER_MISCONFIGURED` / `LOOKUP_FAILED` / `INSERT_FAILED` | Server-side error |
| 502  | `EMAIL_SEND_FAILED`       | Resend failed; the new invitation is auto-revoked  |

## Client invocation (Phase 3 — not implemented yet)

```ts
const { data, error } = await supabase.functions.invoke('send-invitation', {
  body: { email },
});
```
