-- ============================================================
-- Rollback for Migration 027 - Beta 2 recommendation security
--
-- Restores the database contract immediately after Migration 026:
--   * removes only the functions, tables, indexes, and recommendation
--     policies introduced by Migration 027;
--   * restores the pre-027 recommendation RLS policies and table ACL; and
--   * restores Migration 021's get_my_friend_profiles() implementation
--     and execution grant.
--
-- IMPORTANT:
--   * Run only when Migration 027 is the active recommendation contract.
--   * This rollback deletes transient undo and rate-limit event rows.
--   * It does not delete recommendations created while Migration 027 was
--     active and does not revert any Edge Function deployment.
--   * The preconditions fail closed if the expected Migration 027 object
--     set or policy set is incomplete or has been changed.
--   * Verify in a disposable/test project before production use.
--
-- Source of restored state:
--   * Recommendation policies: migrations 004 and 009 plus the baseline
--     policy retained by Migration 009.
--   * Recommendation ACL: authenticated CRUD access required by the
--     pre-027 direct-client flow; PUBLIC and anon remain revoked.
--   * Friend-profile RPC: Migration 021, unchanged by Migrations 022-026.
-- ============================================================

begin;

-- Serialize this rollback with any other operator using the same artifact.
select pg_advisory_xact_lock(
  hashtextextended('migration:027_beta2_recommendation_security:rollback', 27027)
);

-- Fail before making changes unless the complete Migration 027 contract is
-- present. Exact policy-name checking prevents this rollback from silently
-- replacing a later or manually modified recommendation authorization model.
do $preconditions$
declare
  v_policies text[];
begin
  if to_regclass('public.recommendations') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.friendships') is null then
    raise exception
      'ROLLBACK_027_PRECONDITION_FAILED: required pre-027 base tables are missing';
  end if;

  if to_regclass('public.recommendation_send_undo_entries') is null
     or to_regclass('public.recommendation_send_rate_events') is null
     or to_regclass('public.extension_login_rate_events') is null
     or to_regclass('public.title_resolution_rate_events') is null then
    raise exception
      'ROLLBACK_027_PRECONDITION_FAILED: one or more Migration 027 tables are missing';
  end if;

  if to_regclass('public.recommendation_send_undo_sender_expiry_idx') is null
     or to_regclass('public.recommendation_send_rate_sender_idx') is null
     or to_regclass('public.recommendation_send_rate_pair_idx') is null
     or to_regclass('public.recommendation_send_rate_created_at_idx') is null
     or to_regclass('public.extension_login_rate_events_lookup_idx') is null
     or to_regclass('public.extension_login_rate_events_created_at_idx') is null
     or to_regclass('public.title_resolution_rate_events_lookup_idx') is null
     or to_regclass('public.title_resolution_rate_events_created_at_idx') is null then
    raise exception
      'ROLLBACK_027_PRECONDITION_FAILED: one or more Migration 027 indexes are missing';
  end if;

  if to_regprocedure(
       'public.send_title_recommendation(uuid[],integer,text,text,text,text,text[],text)'
     ) is null
     or to_regprocedure('public.undo_title_recommendation(uuid[])') is null
     or to_regprocedure('public.undo_title_recommendation(uuid)') is null
     or to_regprocedure(
       'public.consume_extension_login_rate_limit(text,text)'
     ) is null
     or to_regprocedure(
       'public.consume_title_resolution_rate_limit()'
     ) is null
     or to_regprocedure('public.get_my_friend_profiles()') is null then
    raise exception
      'ROLLBACK_027_PRECONDITION_FAILED: one or more required functions are missing';
  end if;

  select coalesce(
           array_agg(p.policyname::text order by p.policyname::text),
           array[]::text[]
         )
    into v_policies
  from pg_policies as p
  where p.schemaname = 'public'
    and p.tablename = 'recommendations';

  if v_policies <> array[
       'Recipients can update recommendation dismissal',
       'Senders and recipients can view recommendations',
       'Senders can delete their recommendations'
     ]::text[] then
    raise exception
      'ROLLBACK_027_PRECONDITION_FAILED: unexpected recommendation policy set: %',
      v_policies;
  end if;
end;
$preconditions$;

-- Prevent recommendation writes while the authoritative send functions and
-- direct-client authorization model are exchanged in this transaction.
lock table public.recommendations in access exclusive mode;

-- Remove only the five callable function signatures created by Migration 027.
-- Dropping the functions first prevents dependencies on the transient tables.
drop function public.undo_title_recommendation(uuid);
drop function public.undo_title_recommendation(uuid[]);
drop function public.send_title_recommendation(
  uuid[], integer, text, text, text, text, text[], text
);
drop function public.consume_extension_login_rate_limit(text, text);
drop function public.consume_title_resolution_rate_limit();

-- Remove the three recommendation policies created by Migration 027.
drop policy "Senders and recipients can view recommendations"
  on public.recommendations;
drop policy "Recipients can update recommendation dismissal"
  on public.recommendations;
drop policy "Senders can delete their recommendations"
  on public.recommendations;

-- Restore the exact pre-027 policy definitions from Migrations 004 and 009
-- and the baseline sender-delete policy retained by Migration 009.
create policy "Senders and recipients can view recommendations"
  on public.recommendations for select
  using (auth.uid() = to_user_id or auth.uid() = from_user_id);

create policy "Senders can create recommendations"
  on public.recommendations for insert
  with check (auth.uid() = from_user_id);

create policy "Users can dismiss their own recommendations"
  on public.recommendations for update
  using    (auth.uid() = to_user_id or auth.uid() = from_user_id)
  with check (auth.uid() = to_user_id or auth.uid() = from_user_id);

create policy "Senders can delete their recommendations"
  on public.recommendations for delete
  using (auth.uid() = from_user_id);

-- Restore the pre-027 direct-client ACL. Migration 027 did not alter the
-- service_role grant, so this rollback deliberately leaves it untouched.
revoke all on table public.recommendations
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.recommendations
  to authenticated;

-- Restore Migration 021's pre-027 friend-profile function. Migrations 022-026
-- did not replace this definition.
create or replace function public.get_my_friend_profiles()
returns table (
  friendship_id  uuid,
  friend_user_id uuid,
  username       text,
  display_name   text,
  avatar_url     text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    f.id        as friendship_id,
    f.friend_id as friend_user_id,
    p.username,
    p.display_name,
    p.avatar_url
  from public.friendships f
  inner join public.profiles p on p.id = f.friend_id
  where f.user_id = auth.uid()
  order by f.created_at asc;
$$;

revoke all on function public.get_my_friend_profiles()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_friend_profiles()
  to authenticated;

-- Remove only the explicitly named secondary indexes introduced by 027.
-- Primary-key indexes and constraints are removed with their owning tables.
drop index public.recommendation_send_undo_sender_expiry_idx;
drop index public.recommendation_send_rate_sender_idx;
drop index public.recommendation_send_rate_pair_idx;
drop index public.recommendation_send_rate_created_at_idx;
drop index public.extension_login_rate_events_lookup_idx;
drop index public.extension_login_rate_events_created_at_idx;
drop index public.title_resolution_rate_events_lookup_idx;
drop index public.title_resolution_rate_events_created_at_idx;

-- Remove only the four transient tables introduced by Migration 027.
drop table public.recommendation_send_undo_entries;
drop table public.recommendation_send_rate_events;
drop table public.extension_login_rate_events;
drop table public.title_resolution_rate_events;

-- Transactional verification: any mismatch aborts the complete rollback.
do $verification$
declare
  v_policies   text[];
  v_privileges text[];
begin
  if to_regclass('public.recommendation_send_undo_entries') is not null
     or to_regclass('public.recommendation_send_rate_events') is not null
     or to_regclass('public.extension_login_rate_events') is not null
     or to_regclass('public.title_resolution_rate_events') is not null then
    raise exception
      'ROLLBACK_027_VERIFICATION_FAILED: a Migration 027 table remains';
  end if;

  if to_regprocedure(
       'public.send_title_recommendation(uuid[],integer,text,text,text,text,text[],text)'
     ) is not null
     or to_regprocedure('public.undo_title_recommendation(uuid[])') is not null
     or to_regprocedure('public.undo_title_recommendation(uuid)') is not null
     or to_regprocedure(
       'public.consume_extension_login_rate_limit(text,text)'
     ) is not null
     or to_regprocedure(
       'public.consume_title_resolution_rate_limit()'
     ) is not null then
    raise exception
      'ROLLBACK_027_VERIFICATION_FAILED: a Migration 027 function remains';
  end if;

  select coalesce(
           array_agg(p.policyname::text order by p.policyname::text),
           array[]::text[]
         )
    into v_policies
  from pg_policies as p
  where p.schemaname = 'public'
    and p.tablename = 'recommendations';

  if v_policies <> array[
       'Senders and recipients can view recommendations',
       'Senders can create recommendations',
       'Senders can delete their recommendations',
       'Users can dismiss their own recommendations'
     ]::text[] then
    raise exception
      'ROLLBACK_027_VERIFICATION_FAILED: pre-027 policies were not restored: %',
      v_policies;
  end if;

  select coalesce(
           array_agg(tp.privilege_type order by tp.privilege_type),
           array[]::text[]
         )
    into v_privileges
  from information_schema.table_privileges as tp
  where tp.table_schema = 'public'
    and tp.table_name = 'recommendations'
    and tp.grantee = 'authenticated';

  if v_privileges <> array['DELETE', 'INSERT', 'SELECT', 'UPDATE']::text[] then
    raise exception
      'ROLLBACK_027_VERIFICATION_FAILED: authenticated recommendation ACL is %',
      v_privileges;
  end if;

  if exists (
    select 1
    from information_schema.table_privileges as tp
    where tp.table_schema = 'public'
      and tp.table_name = 'recommendations'
      and tp.grantee in ('PUBLIC', 'anon')
  ) then
    raise exception
      'ROLLBACK_027_VERIFICATION_FAILED: PUBLIC or anon recommendation grants remain';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.get_my_friend_profiles()',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.get_my_friend_profiles()',
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.get_my_friend_profiles()',
       'EXECUTE'
     ) then
    raise exception
      'ROLLBACK_027_VERIFICATION_FAILED: friend-profile function ACL is incorrect';
  end if;
end;
$verification$;

commit;

-- ============================================================
-- Post-rollback verification queries
-- Run manually after the transaction commits.
-- ============================================================

-- 1. Migration 027 functions and tables must all be absent.
select
  to_regprocedure(
    'public.send_title_recommendation(uuid[],integer,text,text,text,text,text[],text)'
  ) as send_rpc,
  to_regprocedure('public.undo_title_recommendation(uuid[])') as undo_batch_rpc,
  to_regprocedure('public.undo_title_recommendation(uuid)') as undo_single_rpc,
  to_regprocedure(
    'public.consume_extension_login_rate_limit(text,text)'
  ) as extension_login_limit_rpc,
  to_regprocedure(
    'public.consume_title_resolution_rate_limit()'
  ) as title_resolution_limit_rpc,
  to_regclass('public.recommendation_send_undo_entries') as undo_table,
  to_regclass('public.recommendation_send_rate_events') as send_rate_table,
  to_regclass('public.extension_login_rate_events') as login_rate_table,
  to_regclass('public.title_resolution_rate_events') as title_rate_table;
-- Expected: every column is NULL.

-- 2. Exactly the four pre-027 recommendation policies must exist.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'recommendations'
order by policyname;
-- Expected:
--   SELECT  "Senders and recipients can view recommendations"
--   INSERT  "Senders can create recommendations"
--   DELETE  "Senders can delete their recommendations"
--   UPDATE  "Users can dismiss their own recommendations"

-- 3. Authenticated users must have the pre-027 CRUD table ACL; PUBLIC and
-- anon must have no direct recommendation table privileges.
select grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name = 'recommendations'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by grantee, privilege_type;
-- Expected: authenticated DELETE, INSERT, SELECT, UPDATE only.

-- 4. The pre-027 friend-profile function must exist and be executable only
-- by authenticated among the API roles checked here.
select
  to_regprocedure('public.get_my_friend_profiles()') as friend_profiles_rpc,
  has_function_privilege(
    'authenticated', 'public.get_my_friend_profiles()', 'EXECUTE'
  ) as authenticated_can_execute,
  has_function_privilege(
    'anon', 'public.get_my_friend_profiles()', 'EXECUTE'
  ) as anon_can_execute,
  has_function_privilege(
    'service_role', 'public.get_my_friend_profiles()', 'EXECUTE'
  ) as service_role_can_execute;
-- Expected: non-NULL, true, false, false.

-- 5. Inspect the restored function body and confirm it is Migration 021's
-- direct friendship/profile join without Migration 027's reciprocal/evidence
-- filters.
select pg_get_functiondef(
  'public.get_my_friend_profiles()'::regprocedure
);

