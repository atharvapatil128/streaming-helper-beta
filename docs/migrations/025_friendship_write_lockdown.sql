-- ============================================================
-- Migration 025 - Direct friendship write lockdown
--
-- Apply only after the deployed client accepts friend requests through
-- public.accept_friend_request(uuid) from Migration 024.
--
-- Removes browser-side friendship creation/deletion and limits the remaining
-- recipient UPDATE path to pending -> declined. All app friendship removal
-- uses public.remove_friend(uuid), whose SECURITY DEFINER implementation in
-- Migration 024 remains able to delete both edges after browser-role DELETE
-- privileges and the direct DELETE policy are removed.
--
-- Also removes the obsolete direct friend-request cancellation policy and
-- DELETE privilege after the RPC replacement added in Migration 024 is live.
--
-- Prerequisite: Migration 024 applied and RPC-based client deployed.
-- Safe to re-run: DROP POLICY IF EXISTS, idempotent revoke, policy replace.
-- ============================================================


-- 1. Remove direct friendship creation/removal from Data API roles

drop policy if exists "Either party can create a friendship row"
  on public.friendships;

drop policy if exists "Either party can remove a friendship"
  on public.friendships;

revoke insert, delete
  on table public.friendships
  from public, anon, authenticated;


-- 2. Preserve direct decline while blocking direct acceptance
--
-- USING constrains the old row to a pending request addressed to the
-- caller. WITH CHECK constrains the resulting row to declined for the same
-- recipient. Existing column grants from Migration 022 allow authenticated
-- clients to update only status and responded_at, so party ids and request
-- metadata cannot be reassigned through this policy.

drop policy if exists "Recipients can respond to friend requests"
  on public.friend_requests;

drop policy if exists "Recipients can decline pending friend requests"
  on public.friend_requests;

create policy "Recipients can decline pending friend requests"
  on public.friend_requests
  for update
  to authenticated
  using (
    (select auth.uid()) = recipient_id
    and status = 'pending'
  )
  with check (
    (select auth.uid()) = recipient_id
    and status = 'declined'
    and responded_at is not null
  );


-- 3. Remove obsolete direct pending-request cancellation
--
-- Migration 024's RPC supersedes the retained Migration 006 DELETE policy and
-- privilege. Removing both prevents dead or accidental browser write paths.
drop policy if exists "Requesters can cancel pending requests"
  on public.friend_requests;

revoke delete
  on table public.friend_requests
  from public, anon, authenticated;


-- ============================================================
-- Verification SQL (run only after applying in a disposable/test env)
-- ============================================================

-- 25a. Direct friendship INSERT/DELETE privileges are absent for browser roles.
-- select grantee, privilege_type
-- from information_schema.table_privileges
-- where table_schema = 'public'
--   and table_name = 'friendships'
--   and grantee in ('PUBLIC', 'anon', 'authenticated')
--   and privilege_type in ('INSERT', 'DELETE')
-- order by grantee;
-- Expected: zero rows.

-- 25b. The permissive INSERT and DELETE policies are absent.
-- select polname, polcmd
-- from pg_policy
-- where polrelid = 'public.friendships'::regclass
-- order by polname;
-- Expected: neither "Either party can create a friendship row" nor
-- "Either party can remove a friendship" is present.

-- 25c. As an authenticated user, attempt either friendship direction.
-- insert into public.friendships (user_id, friend_id)
-- values (auth.uid(), '<other_user_uuid>'::uuid);
-- insert into public.friendships (user_id, friend_id)
-- values ('<other_user_uuid>'::uuid, auth.uid());
-- Expected: both denied with insufficient privilege.

-- 25d. Direct friendship DELETE is denied. As either party:
-- delete from public.friendships
-- where (user_id = auth.uid() and friend_id = '<other_user_uuid>'::uuid)
--    or (user_id = '<other_user_uuid>'::uuid and friend_id = auth.uid());
-- Expected: denied with insufficient privilege; edges remain unchanged.

-- 25e. Direct acceptance is denied. As the recipient of a pending request:
-- update public.friend_requests
--    set status = 'accepted', responded_at = now()
--  where id = '<pending_request_uuid>'::uuid;
-- Expected: RLS WITH CHECK violation (or UPDATE 0); row remains pending and
-- no friendship edge is created.

-- 25f. Direct decline is preserved. As the recipient of a pending request:
-- update public.friend_requests
--    set status = 'declined', responded_at = now()
--  where id = '<pending_request_uuid>'::uuid;
-- Expected: UPDATE 1 and status='declined'.

-- 25g. The authoritative acceptance RPC still works after lockdown.
-- select public.accept_friend_request('<pending_request_uuid>'::uuid);
-- Expected: 'accepted', request updated, exactly two directed edges.

-- 25h. Invitation acceptance regression reminders (use fresh fixtures).
-- select public.respond_invitation('<raw_token>', 'accept');
-- select public.respond_to_my_invitation('<invitation_uuid>'::uuid, 'accept');
-- Expected: each valid path returns 'accepted' and creates both directed
-- friendship edges despite authenticated INSERT having been revoked.

-- 25i. Friend removal RPC succeeds despite direct DELETE lockdown.
-- select public.remove_friend('<friend_uuid>'::uuid);
-- Expected: returns 2 for a complete pair and deletes both edges through
-- SECURITY DEFINER even though browser roles cannot DELETE the table.

-- 25j. Confirm RPC execution grants remain narrow.
-- select
--   has_function_privilege('authenticated',
--     'public.accept_friend_request(uuid)'::regprocedure, 'EXECUTE') as authenticated_can_execute,
--   has_function_privilege('anon',
--     'public.accept_friend_request(uuid)'::regprocedure, 'EXECUTE') as anon_can_accept,
--   has_function_privilege('authenticated',
--     'public.remove_friend(uuid)'::regprocedure, 'EXECUTE') as authenticated_can_remove,
--   has_function_privilege('anon',
--     'public.remove_friend(uuid)'::regprocedure, 'EXECUTE') as anon_can_remove;
-- Expected: true, false, true, false.

-- 25k. Inspect recipient UPDATE policies.
-- select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr,
--        pg_get_expr(polwithcheck, polrelid) as with_check_expr
-- from pg_policy
-- where polrelid = 'public.friend_requests'::regclass
--   and polcmd = 'w';
-- Expected: recipient policy permits only old status pending and new status
-- declined for the authenticated recipient.

-- 25l. Run Supabase Security and Performance Advisors after application in
-- the test environment. Confirm no new function search_path, RLS, privilege,
-- duplicate-index, or policy warnings before production approval.

-- 25m. Request cancellation uses the authoritative RPC.
-- As the requester of a pending request:
-- select public.cancel_friend_request('<request_uuid>'::uuid);
-- Expected: 'cancelled' and the request is deleted. As the recipient, an
-- unrelated user, or for a nonexistent/non-pending request, expect the same
-- FRIEND_REQUEST_NOT_FOUND error. Anonymous execution is denied.
-- Direct DELETE privilege and the old requester DELETE policy must be absent.
