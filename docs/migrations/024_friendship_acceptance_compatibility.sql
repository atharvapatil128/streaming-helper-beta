-- ============================================================
-- Migration 024 - Friendship acceptance compatibility hardening
--
-- Adds authoritative, serialized friendship acceptance/removal RPCs and
-- fixes literal underscore handling in username prefix search.
--
-- This is the compatibility half of a two-step rollout. Existing
-- clients retain their current table permissions until Migration 025.
-- Do not apply Migration 025 until clients accept requests through
-- public.accept_friend_request(uuid).
--
-- Prerequisites: Migrations 006-023 applied.
-- Safe to re-run: CREATE OR REPLACE and idempotent grants/revokes.
-- ============================================================


-- 1. Authoritative, atomic friend-request acceptance
--
-- SECURITY DEFINER is required because the function must continue to
-- update friend_requests and create both directed friendship edges after
-- Migration 025 removes those write paths from browser roles.
--
-- The caller supplies only the request id. Both parties are derived from
-- the locked database row. A missing row and a row belonging to another
-- recipient deliberately return the same error to avoid existence leaks.
--
-- A retry by the correct recipient after acceptance is idempotent. It
-- repairs exactly one missing directed edge, but if both edges are absent
-- it treats the friendship as previously removed and does not recreate it.

create or replace function public.accept_friend_request(
  p_request_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller     uuid := auth.uid();
  v_request    public.friend_requests%rowtype;
  v_edge_count integer;
begin
  if v_caller is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_request_id is null then
    raise exception 'FRIEND_REQUEST_NOT_FOUND';
  end if;

  select fr.*
    into v_request
  from public.friend_requests as fr
  where fr.id = p_request_id
    and fr.recipient_id = v_caller
  for update;

  -- The recipient predicate above prevents unauthorized UUID holders from
  -- locking another user's request. Missing and unauthorized requests are
  -- deliberately indistinguishable.
  if not found then
    raise exception 'FRIEND_REQUEST_NOT_FOUND';
  end if;

  if v_request.requester_id = v_caller then
    raise exception 'INVALID_FRIEND_REQUEST';
  end if;

  -- A declined request is final.
  if v_request.status = 'declined' then
    raise exception 'FRIEND_REQUEST_NOT_ACCEPTABLE';
  end if;

  if v_request.status not in ('pending', 'accepted') then
    raise exception 'FRIEND_REQUEST_NOT_ACCEPTABLE';
  end if;

  -- Serialize every acceptance/repair/removal operation for this unordered
  -- user pair. Both this RPC and remove_friend(uuid) below derive the same
  -- canonical text key and fixed-seed bigint hash. A hash collision can
  -- only cause unrelated pairs to wait; authorization remains row-based.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'friendship:'
        || least(v_caller::text, v_request.requester_id::text)
        || ':'
        || greatest(v_caller::text, v_request.requester_id::text),
      24024
    )
  );

  -- First acceptance always creates both directed edges and changes the
  -- request state in this same function transaction.
  if v_request.status = 'pending' then
    insert into public.friendships (user_id, friend_id)
    values
      (v_request.requester_id, v_caller),
      (v_caller, v_request.requester_id)
    on conflict (user_id, friend_id) do nothing;

    update public.friend_requests
       set status = 'accepted',
           responded_at = now()
     where id = v_request.id;

    return 'accepted';
  end if;

  -- The shared pair advisory lock above is the authoritative serialization
  -- mechanism. Under that lock, inspect the exact directed pair normally.
  -- One edge means an older partial write and is repaired. Zero edges means
  -- remove_friend previously removed the relationship, so replay must not
  -- resurrect it. Two edges is a no-op.
  select count(*)::integer
    into v_edge_count
  from public.friendships as f
  where (f.user_id = v_request.requester_id and f.friend_id = v_caller)
     or (f.user_id = v_caller and f.friend_id = v_request.requester_id);

  if v_edge_count = 1 then
    insert into public.friendships (user_id, friend_id)
    values
      (v_request.requester_id, v_caller),
      (v_caller, v_request.requester_id)
    on conflict (user_id, friend_id) do nothing;
  end if;

  return 'accepted';
end;
$$;

revoke all
  on function public.accept_friend_request(uuid)
  from public, anon, authenticated;

grant execute
  on function public.accept_friend_request(uuid)
  to authenticated;


-- 2. Serialized friend removal
--
-- Replaces Migration 008's remove_friend implementation without changing
-- its signature or integer row-count result. It uses the exact same
-- canonical pair advisory lock as accept_friend_request, so acceptance,
-- accepted-request repair, and removal cannot inspect or mutate the same
-- friendship pair concurrently.

create or replace function public.remove_friend(
  target_friend_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller        uuid := auth.uid();
  v_deleted_count integer;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  if target_friend_id is null or v_caller = target_friend_id then
    raise exception 'Invalid target';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'friendship:'
        || least(v_caller::text, target_friend_id::text)
        || ':'
        || greatest(v_caller::text, target_friend_id::text),
      24024
    )
  );

  delete from public.friendships
  where (user_id = v_caller and friend_id = target_friend_id)
     or (user_id = target_friend_id and friend_id = v_caller);

  get diagnostics v_deleted_count = row_count;

  return v_deleted_count;
end;
$$;

revoke all
  on function public.remove_friend(uuid)
  from public, anon, authenticated;

grant execute
  on function public.remove_friend(uuid)
  to authenticated;


-- 3. Literal username-prefix search
--
-- Migration 023 validated underscore as a legal username character but
-- passed it unescaped to LIKE, where underscore means "any one character".
-- Escape underscores before constructing the pattern. The resulting LIKE
-- pattern still has a fixed literal prefix and remains compatible with the
-- profiles_username_prefix_idx text_pattern_ops index created in 023.
-- All authentication, rate-limit, result-shape, ordering, exclusion, and
-- limit behavior from Migration 023 is retained.

create or replace function public.search_profiles_by_username_prefix(
  p_query text
)
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller      uuid := auth.uid();
  v_normalized  text;
  v_like_prefix text;
begin
  if v_caller is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  v_normalized := lower(btrim(p_query));

  if v_normalized is null or length(v_normalized) < 3 then
    return;
  end if;

  if v_normalized !~ '^[a-z0-9_]+$' then
    return;
  end if;

  if not public.record_authenticated_action_rate_event(
    'username_prefix_search', 30, interval '1 minute'
  ) then
    return;
  end if;

  -- Percent is rejected by validation. Escape the only permitted LIKE
  -- metacharacter so an underscore is matched literally.
  v_like_prefix := replace(v_normalized, '_', E'\\_');

  return query
  select
    p.id           as user_id,
    p.username     as username,
    p.display_name as display_name,
    p.avatar_url   as avatar_url
  from public.profiles as p
  where p.username like (v_like_prefix || '%') escape E'\\'
    and p.id <> v_caller
  order by
    (p.username = v_normalized) desc,
    p.username asc
  limit 5;
end;
$$;

revoke all
  on function public.search_profiles_by_username_prefix(text)
  from public, anon, authenticated;

grant execute
  on function public.search_profiles_by_username_prefix(text)
  to authenticated;


-- ============================================================
-- Verification SQL (run only after applying in a disposable/test env)
-- ============================================================

-- 24a. RPC grants: authenticated has EXECUTE; PUBLIC and anon do not.
-- select grantee, privilege_type
-- from information_schema.routine_privileges
-- where specific_schema = 'public'
--   and routine_name = 'accept_friend_request'
--   and grantee in ('PUBLIC', 'anon', 'authenticated')
-- order by grantee;
-- Expected: authenticated/EXECUTE only.

-- 24b. As the request recipient, accept a pending request.
-- select public.accept_friend_request('<request_uuid>'::uuid);
-- Expected: 'accepted'; friend_requests.status='accepted'; responded_at set;
-- exactly these two edges exist:
-- select user_id, friend_id from public.friendships
-- where (user_id = '<requester_uuid>' and friend_id = '<recipient_uuid>')
--    or (user_id = '<recipient_uuid>' and friend_id = '<requester_uuid>');

-- 24c. Retry the same call as the same recipient after deleting exactly one
-- edge in a disposable fixture using an administrator connection.
-- select public.accept_friend_request('<request_uuid>'::uuid);
-- Expected: 'accepted'; both edges restored; no duplicates.
-- Concurrency check: race this one-edge repair against remove_friend in two
-- sessions. Confirm one call waits on the shared pair advisory lock. Whether
-- removal runs before or after repair, the final state is zero edges: a
-- repair followed by removal is deleted, while removal followed by replay
-- observes zero edges and does not resurrect the friendship.

-- 24d. Replay after removal. Accept a request, call remove_friend so neither
-- directed edge remains, then retry as the original recipient:
-- select public.accept_friend_request('<request_uuid>'::uuid);
-- Expected: 'accepted'; neither friendship edge is recreated.

-- 24e. Retry an accepted request while both edges still exist.
-- select public.accept_friend_request('<request_uuid>'::uuid);
-- Expected: 'accepted'; exactly two edges remain; no duplicates.

-- 24e-1. Pending-accept versus remove concurrency. Race first acceptance
-- against remove_friend in two sessions and confirm one waits on the same
-- pair advisory lock. If removal serializes last, expect zero edges. If the
-- pending acceptance serializes last, expect exactly two edges.

-- 24f. As the requester or an unrelated authenticated user, call the RPC.
-- select public.accept_friend_request('<request_uuid>'::uuid);
-- Expected: FRIEND_REQUEST_NOT_FOUND, matching a nonexistent UUID.

-- 24g. A declined request cannot be accepted.
-- select public.accept_friend_request('<declined_request_uuid>'::uuid);
-- Expected: FRIEND_REQUEST_NOT_ACCEPTABLE and no friendship edges.

-- 24g-1. remove_friend keeps its API contract and narrow grants.
-- select public.remove_friend('<friend_uuid>'::uuid);
-- Expected: 0, 1, or 2 matching rows deleted; NULL/self target rejected.
-- select grantee, privilege_type
-- from information_schema.routine_privileges
-- where specific_schema = 'public'
--   and routine_name = 'remove_friend'
--   and grantee in ('PUBLIC', 'anon', 'authenticated')
-- order by grantee;
-- Expected: authenticated/EXECUTE only.

-- 24h. Literal underscore behavior. With fixtures abc_user, abcXuser,
-- and abc_user2, search as a different authenticated user:
-- select username
-- from public.search_profiles_by_username_prefix('abc_');
-- Expected: abc_user and abc_user2 may appear; abcXuser must not appear.

-- 24i. Search contract regression checks.
-- Confirm: anonymous execution denied; <3 characters and invalid '%'
-- return zero rows; caller excluded; result count <= 5; columns are only
-- user_id, username, display_name, avatar_url; 31st call/minute is limited.

-- 24j. Confirm the prefix index still exists and inspect a representative
-- plan with test data. Planner choice depends on table size/statistics.
-- select indexdef from pg_indexes
-- where schemaname='public' and indexname='profiles_username_prefix_idx';
-- explain (analyze, buffers)
-- select id from public.profiles
-- where username like E'abc\\_%' escape E'\\';

-- 24k. After all database migrations are applied in the test environment,
-- run Supabase Security and Performance Advisors in the Dashboard, or the
-- supported CLI/MCP advisor commands for the installed version. Resolve or
-- explicitly disposition every new warning before production approval.
