# Beta 2 Extension Production Change Plan

## Purpose

Enable username-or-email extension sign-in, reliable refreshed sessions, and
server-authorized recommendations from supported streaming title pages.

## Production changes requiring approval

1. Apply `docs/migrations/027_beta2_recommendation_security.sql`.
   - Adds authoritative batch send and atomic five-minute Undo RPCs.
   - Removes direct recommendation INSERT access and broad UPDATE access.
   - Preserves recipient dismissal updates and sender deletion.
   - Adds private login and title-resolution rate-event tables.
   - Adds 15-minute login limits and a 60-per-hour user title-resolution limit.
2. Configure Edge Function secrets.
   - `EXTENSION_ALLOWED_ORIGINS=chrome-extension://<exact-extension-id>`
   - `EXTENSION_LOGIN_HASH_PEPPER=<random server-only value>`
   - `TMDB_API_KEY=<server-side TMDB v3 key>`
3. Deploy:
   - `extension-login` with gateway JWT verification disabled.
   - `resolve-streaming-title` with gateway JWT verification enabled.

No paid Supabase feature, scheduled job, or paid release plan is required.
Retention cleanup occurs opportunistically in the rate-limit RPCs.

## Manual information needed

- Copy the extension ID shown for Streaming Helper in `chrome://extensions`
  after loading/reloading the local `helper-extension` folder.
- Confirm that a TMDB v3 API key has been added directly as a Supabase Edge
  Function secret. Do not paste the key into chat or a shared terminal log.

The login hash pepper can be generated and set during the approved deployment;
it should never be displayed or committed.

## Deployment sequence

1. Record pre-change grants, policies, function privileges, and friendship
   invariants.
2. Apply migration 027.
3. Run the migration’s ACL/RLS/function and invariant verification queries.
4. Set the three required secrets.
5. Deploy the login function, then verify generic invalid-credential,
   rate-limit, and no-email response behavior.
6. Deploy the title resolver, then verify JWT, rate-limit, conservative match,
   and no-match behavior.
7. Load the unpacked extension and run the Chrome matrix in
   `helper-extension/README.md`.
8. Capture runtime picker/success screenshots and complete `design-qa.md`.
9. Merge only after the database, Edge, Chrome, and visual gates pass.

## Rollback

- Do not roll back by restoring direct client INSERT access.
- If an Edge Function fails, undeploy/disable that function while leaving the
  hardened recommendation ACL in place.
- If the recommendation RPC fails verification, stop the rollout before
  extension release and apply a reviewed forward-fix migration.
- Existing recommendations remain readable/dismissible under the hardened
  policies; the new tables contain only opaque hashes, user IDs, timestamps,
  and short-lived Undo eligibility.
