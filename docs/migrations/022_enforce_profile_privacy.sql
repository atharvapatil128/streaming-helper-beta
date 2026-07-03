-- ============================================================
-- Migration 022 — Enforce profile and friend-request privacy
-- Beta 2, Phase 1b
--
-- Apply ONLY after the web frontend has migrated to safe RPCs:
--   • get_my_friend_profiles()
--   • get_incoming_friend_requests_safe()
--   • get_my_sent_friend_requests_safe()
--   • get_sent_recommendation_recipients_safe()
--   • lookup_profile_by_email()
--   • lookup_profile_by_username()
--   • send_friend_request_by_email()
--   • send_friend_request_by_username()
--
-- Prerequisites:
--   • Migration 021 applied
--   • Frontend Phase 2 deployed (all direct cross-user profile reads
--     and direct friend_requests INSERTs replaced with safe RPCs)
--
-- After this migration:
--   • Cross-user direct profiles SELECT returns no rows (RLS).
--   • Direct INSERT to friend_requests is denied (privilege revoked).
--   • Requester direct SELECT of sent friend_requests returns no rows (RLS).
--   • Recipients can SELECT only safe incoming-request columns (no email).
--   • Recipients can UPDATE only status and responded_at.
--   • Requesters can DELETE their own pending requests (RLS + DELETE grant).
--   • DELETE ... RETURNING recipient_email is denied (no column privilege).
--   • SECURITY DEFINER RPCs continue to function (they bypass RLS and
--     run as the function owner with full table access).
--   • service_role table access is unchanged.
--
-- Safe to re-run: DROP POLICY/PRIVILEGE IF EXISTS, idempotent grants.
-- ============================================================


-- ── 1. Drop broad cross-user profile SELECT ──────────────────

drop policy if exists "Authenticated users can view profiles for friend discovery"
  on public.profiles;

-- Retained policies (from base schema + migration 006):
--   "Users can view their own profile"   (SELECT, auth.uid() = id)
--   "Users can update their own profile" (UPDATE, auth.uid() = id)


-- ── 2. Tighten profile UPDATE grants ─────────────────────────
-- authenticated clients may edit display fields only.
-- username/username_changed_at: RPC-only (trigger guard, 021).
-- email: not client-writable (synced via handle_new_user).
-- updated_at: maintained by trg_profiles_updated_at (021).

revoke update on table public.profiles from public, anon, authenticated;

grant update (display_name, avatar_url)
  on table public.profiles to authenticated;


-- ── 3. Drop requester-side friend_requests policies ──────────
-- These allowed requesters to directly SELECT sent requests and
-- directly INSERT new requests, bypassing controlled RPCs.

drop policy if exists "Requesters can view their sent requests"
  on public.friend_requests;

drop policy if exists "Requesters can create friend requests"
  on public.friend_requests;


-- ── 4. Tighten friend_requests table privileges ───────────────
-- After this migration, only SECURITY DEFINER RPCs
-- (send_friend_request_by_email / send_friend_request_by_username)
-- may insert rows. Those functions run as the function owner
-- (postgres / supabase_admin) and are unaffected by these revocations.
--
-- Column-level SELECT/UPDATE grants prevent authenticated clients from
-- reading recipient_email via SELECT or DELETE ... RETURNING, even when
-- RLS would otherwise permit the row operation.
--
-- Note: 'public' in a REVOKE below refers to the PostgreSQL default-
-- privilege role, not the schema. Revoking from 'public' removes
-- the privilege from all roles that inherit from it (including anon
-- and authenticated).

revoke insert on public.friend_requests from public, anon, authenticated;

revoke select, update
  on table public.friend_requests
  from public, anon, authenticated;

grant select (
  id,
  requester_id,
  recipient_id,
  status,
  responded_at,
  created_at
)
  on table public.friend_requests
  to authenticated;

grant update (
  status,
  responded_at
)
  on table public.friend_requests
  to authenticated;

grant delete
  on table public.friend_requests
  to authenticated;


-- ── 5. Retained friend_requests policies ─────────────────────
-- These are explicitly listed here for documentation; they were
-- created in migration 006 and are NOT modified by this migration.
--
-- "Recipients can view requests sent to them"
--     SELECT using (auth.uid() = recipient_id)
--
-- "Recipients can respond to friend requests"
--     UPDATE using/with check (auth.uid() = recipient_id)
--
-- "Requesters can cancel pending requests"
--     DELETE using (auth.uid() = requester_id and status = 'pending')
--
-- Recipients retain SELECT on safe columns only (no recipient_email).
-- Requesters retain DELETE on their pending rows (cancellation).
-- DELETE WHERE may reference id, requester_id, and status via granted
-- SELECT columns; RETURNING recipient_email is denied by column privilege.
-- No client-side UPDATE for requesters (by design since migration 006).


-- ============================================================
-- Verification queries (SELECT-only; run after apply in test env)
-- ============================================================

-- 22a. Broad profile SELECT policy absent.
-- select polname from pg_policy
-- where  polrelid = 'public.profiles'::regclass
-- order  by polname;
-- Must NOT include "Authenticated users can view profiles for friend discovery".

-- 22b. Cross-user profile SELECT denied (TEST-ENV).
-- As authenticated user A:
--   select email from public.profiles where id <> auth.uid() limit 1;
-- Expect: zero rows (RLS blocks), no error.

-- 22c. Own profile still readable (TEST-ENV).
-- select id, display_name, email from public.profiles where id = auth.uid();
-- Expect: one row.

-- 22d. Safe profile RPCs still executable.
-- select has_function_privilege('authenticated',
--   'public.get_my_friend_profiles()'::regprocedure, 'EXECUTE');
-- Expect: true.

-- 22e. Profile column UPDATE privileges (authenticated).
-- select column_name, privilege_type
-- from   information_schema.column_privileges
-- where  table_schema = 'public' and table_name = 'profiles'
--   and  grantee = 'authenticated' and privilege_type = 'UPDATE'
-- order  by column_name;
-- Expect: display_name, avatar_url only.
-- NOT: email, updated_at, username, username_changed_at.

-- 22f. Direct friend_requests INSERT denied (TEST-ENV).
-- insert into public.friend_requests (requester_id, recipient_email, status)
-- values (auth.uid(), 'test@example.com', 'pending');
-- Expect: ERROR: permission denied for table friend_requests.

-- 22g. Requester direct SELECT of sent request returns no rows (TEST-ENV).
-- After inserting a request via send_friend_request_by_email/username:
-- select * from public.friend_requests where requester_id = auth.uid();
-- Expect: zero rows (SELECT policy for requesters has been dropped).

-- 22h. Recipient SELECT of incoming request still works (TEST-ENV).
-- As user B (recipient):
-- select id, requester_id, recipient_id, status, responded_at, created_at
-- from   public.friend_requests
-- where  recipient_id = auth.uid();
-- Expect: rows returned.

-- 22i. authenticated SELECT privileges on friend_requests (column-level).
-- select column_name, privilege_type
-- from   information_schema.column_privileges
-- where  table_schema = 'public'
--   and  table_name = 'friend_requests'
--   and  grantee = 'authenticated'
--   and  privilege_type = 'SELECT'
-- order  by column_name;
-- Expect exactly:
--   created_at, id, recipient_id, requester_id, responded_at, status
-- Must NOT include: recipient_email.

-- 22j. authenticated has no SELECT on recipient_email.
-- select has_column_privilege(
--   'authenticated',
--   'public.friend_requests',
--   'recipient_email',
--   'SELECT'
-- );
-- Expect: false.

-- 22k. authenticated UPDATE privileges on friend_requests (column-level).
-- select column_name, privilege_type
-- from   information_schema.column_privileges
-- where  table_schema = 'public'
--   and  table_name = 'friend_requests'
--   and  grantee = 'authenticated'
--   and  privilege_type = 'UPDATE'
-- order  by column_name;
-- Expect exactly: responded_at, status
-- Must NOT include: recipient_email, requester_id, recipient_id, created_at.

-- 22l. authenticated retains DELETE privilege on friend_requests.
-- select has_table_privilege('authenticated', 'public.friend_requests', 'DELETE');
-- Expect: true.

-- 22m. Requester cancel (DELETE) still works (TEST-ENV).
-- As requesting user, with the request id from send RPC result:
-- delete from public.friend_requests
-- where  id = '<request_id>'
--   and  requester_id = auth.uid()
--   and  status = 'pending';
-- Expect: DELETE 1.

-- 22n. DELETE ... RETURNING recipient_email is denied (TEST-ENV).
-- As requesting user cancelling their own pending request:
-- delete from public.friend_requests
-- where  id = '<request_id>'
--   and  requester_id = auth.uid()
--   and  status = 'pending'
-- returning recipient_email;
-- Expect: ERROR: permission denied for column recipient_email
--   (or equivalent insufficient_privilege message).

-- 22o. Recipient accept/decline still succeeds (TEST-ENV).
-- As recipient user:
-- update public.friend_requests
--    set status = 'accepted', responded_at = now()
-- where  id = '<request_id>'
--   and  recipient_id = auth.uid();
-- Expect: UPDATE 1.
-- Do not use RETURNING recipient_email; that column is not granted.

-- 22p. send RPCs still insert and trigger email_jobs (TEST-ENV).
-- select * from public.send_friend_request_by_email('friend@example.com');
-- Expect: status = 'SENT', request_id populated.
-- select count(*) from public.email_jobs
-- where event_type = 'friend_request_received' order by created_at desc limit 1;
-- Expect: count incremented.

-- 22q. get_my_sent_friend_requests_safe returns sent request (TEST-ENV).
-- select * from public.get_my_sent_friend_requests_safe();
-- Expect: row for the request just sent, no email column.

-- 22r. Username direct write still blocked (TEST-ENV).
-- update public.profiles set username = 'hacked' where id = auth.uid();
-- Expect: ERROR: USERNAME_WRITE_FORBIDDEN (trigger) or insufficient_privilege.
