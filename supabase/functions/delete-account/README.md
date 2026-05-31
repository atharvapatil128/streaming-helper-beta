# delete-account — Supabase Edge Function

Permanently deletes a user's app data **and** their `auth.users` row. Lives next
to the rest of the project's Supabase config so it can be deployed alongside
schema migrations.

## Why an Edge Function (and not an RPC)?

`auth.admin.deleteUser()` requires the **service-role** key. That key bypasses
RLS and grants full database access — it must never appear in browser/Vite
code. An Edge Function runs on Supabase's servers, reads the key from a
secret, and exposes only the narrow capability we need.

## Security model

```
  Browser                Edge Function (Deno)            Database
  ───────────────        ────────────────────────        ──────────
  signed-in user
  └─ JWT in
     Authorization:
     Bearer …  ─────►    1. anon-key client
                           verifies JWT via getUser()
                         2. service-role client
                           deletes public.* rows ──────► friendships,
                                                         friend_requests,
                                                         recommendations,
                                                         comfort_titles,
                                                         connected_services,
                                                         notification_reads,
                                                         profiles
                         3. service-role client
                           auth.admin.deleteUser() ────► auth.users
                         4. returns { success: true }
```

- The user's JWT proves who they are; the function only ever deletes data for
  that one `user.id`.
- The service-role key is read from `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`
  inside the function. It is **not** in `.env.local`, **not** in any
  `VITE_*` variable, and **not** in the deployed bundle.

## Required secrets

Set these once per environment (the Supabase CLI auto-populates `SUPABASE_URL`
and `SUPABASE_ANON_KEY` for hosted functions, but setting them explicitly is
fine and works for local `supabase functions serve` too):

```bash
supabase secrets set SUPABASE_URL=https://<project-ref>.supabase.co
supabase secrets set SUPABASE_ANON_KEY=<anon-public-key>
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Get the keys from **Supabase Dashboard → Project Settings → API**. The
service-role key is in the same panel under **Project API keys → service_role
secret**. Treat it like a password.

To verify what's set:

```bash
supabase secrets list
```

## Deploy

From the project root (where `supabase/` lives):

```bash
# One-time, if the CLI hasn't been linked yet:
supabase link --project-ref <project-ref>

# Deploy the function:
supabase functions deploy delete-account
```

To redeploy after editing the function, re-run the same `deploy` command.

## Local testing (optional)

```bash
# In one terminal — run the function locally:
supabase functions serve delete-account --env-file ./supabase/.env.local

# In another terminal — invoke it with a valid JWT:
curl -X POST http://localhost:54321/functions/v1/delete-account \
  -H "Authorization: Bearer <user-jwt>"
```

`./supabase/.env.local` (only used by `serve`, do not commit) should contain:

```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## How to test safely with a dummy account

Because deletion is irreversible, always test against a throwaway account:

1. Sign up a fresh test user (e.g. `delete-test+1@your-domain.com`).
2. Add a comfort title, a friend, send/receive a recommendation, connect a
   service — so each table has at least one row to delete.
3. Open **Settings → Account → Danger Zone → Delete Account**.
4. Type `DELETE` and confirm.
5. The button should show "Deleting…", then the app returns to the auth
   screen.
6. In the Supabase Dashboard, verify:
   - **Authentication → Users**: the test user is gone.
   - **Table Editor**: no rows in `profiles`, `friendships`, `friend_requests`,
     `recommendations`, `comfort_titles`, `connected_services`,
     `notification_reads` for that user id.
7. Try signing up *again* with the same email — it should succeed cleanly,
   confirming no stale auth row remains.

Edge Function logs (`supabase functions logs delete-account`) will show
`delete-account: failed at <step>` if any step errored. The function aborts
**before** deleting the auth user when public-data deletion fails, so you can
investigate without leaving the user in a half-deleted state.

## Client invocation

The frontend calls the function via the standard supabase-js helper, which
automatically attaches the current session's JWT:

```ts
const { data, error } = await supabase.functions.invoke('delete-account', {
  method: 'POST',
});
```

See `src/app/components/SettingsModal.tsx → handleDeleteAccount()`.
