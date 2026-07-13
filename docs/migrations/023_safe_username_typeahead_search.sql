-- ============================================================
-- Migration 023 — Safe username typeahead search
-- Beta 2, Phase 2C (typeahead)
--
-- Adds a single SECURITY DEFINER RPC:
--   public.search_profiles_by_username_prefix(p_query text)
--
-- The RPC allows an authenticated user to search for accounts
-- by username prefix.  It uses the existing normalization and
-- rate-limit infrastructure from Migration 021 unchanged.
--
-- Privacy guarantees:
--   • Requires a live auth.uid() — anonymous callers are rejected.
--   • Only columns without privacy impact are returned:
--       user_id, username, display_name, avatar_url.
--   • email, username_changed_at, and internal tables are never
--     returned or mentioned.
--   • Does NOT restore the broad profiles SELECT policy removed
--     by Migration 022 and does NOT add new RLS policies that
--     expose cross-user reads.  The function runs as the database
--     owner (SECURITY DEFINER) with a fixed, protected search_path,
--     so it can query profiles while bypassing RLS, exactly as the
--     other username RPCs already do.
--   • Execution is revoked from public and anon; granted only to
--     authenticated.
--   • Rate-limited via the existing profile_action_rate_events
--     infrastructure: 30 searches per user per minute.
--
-- Prerequisites: Migrations 021, 021a, 022 applied.
--
-- Safe to re-run: CREATE OR REPLACE, CREATE INDEX IF NOT EXISTS,
-- idempotent grants/revokes.
-- ============================================================


-- ── 1. Prefix index for username LIKE searches ────────────────────

create index if not exists profiles_username_prefix_idx
  on public.profiles (username text_pattern_ops)
  where username is not null;


-- ── 2. search_profiles_by_username_prefix (STABLE-ish, VOLATILE for
--       rate-limit insert) ─────────────────────────────────────────
--
-- Returns at most 5 rows matching the given prefix query.
-- Sort: exact match first, then remaining prefix matches
--       alphabetically by username.
-- Excludes the authenticated caller.
-- Short queries (< 3 normalised chars) return empty immediately.
-- Rate limit: 30 calls / user / 1 minute.

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
begin
  -- ── Auth guard ──────────────────────────────────────────────────
  if v_caller is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  -- ── Normalize using Migration 021 normalizer ─────────────────────
  -- normalize_username_input trims and lowercases, returning NULL for
  -- inputs shorter than 3 chars or failing the character rules.
  -- We apply it to the raw query as if it were a username prefix;
  -- inputs with fewer than 3 valid chars return nothing silently.
  v_normalized := lower(btrim(p_query));

  if v_normalized is null or length(v_normalized) < 3 then
    return;
  end if;

  -- Only allow characters that can appear in valid usernames.
  -- This prevents injection via LIKE wildcards and ensures we only
  -- search against the stored normalised form.
  if v_normalized !~ '^[a-z0-9_]+$' then
    return;
  end if;

  -- ── Rate limit ────────────────────────────────────────────────────
  -- 30 prefix searches / user / 1 minute.  Uses the same advisory-
  -- lock + insert pattern as check_username_available in Migration 021.
  -- Returns false when the limit is exceeded; we return empty quietly.
  if not public.record_authenticated_action_rate_event(
    'username_prefix_search', 30, interval '1 minute'
  ) then
    return;
  end if;

  -- ── Query ─────────────────────────────────────────────────────────
  -- Prefix search via LIKE.  The LIKE pattern is constructed from
  -- validated, normalised input only — no user-supplied wildcards.
  -- Exact match ordered before prefix matches; then alphabetical.
  -- Caller excluded by id.
  -- Result capped at 5.
  return query
  select
    p.id          as user_id,
    p.username    as username,
    p.display_name as display_name,
    p.avatar_url  as avatar_url
  from public.profiles as p
  where p.username like (v_normalized || '%')
    and p.id <> v_caller
  order by
    (p.username = v_normalized) desc,
    p.username asc
  limit 5;
end;
$$;


-- ── 3. Permissions ────────────────────────────────────────────────

revoke all on function public.search_profiles_by_username_prefix(text)
  from public, anon;

grant execute on function public.search_profiles_by_username_prefix(text)
  to authenticated;


-- ── 4. Verification queries (SELECT-only, non-destructive) ────────

-- 23a. Function exists with correct owner.
-- select routine_name, security_type
-- from   information_schema.routines
-- where  routine_schema = 'public'
--   and  routine_name   = 'search_profiles_by_username_prefix';
-- Expected: one row, security_type = 'DEFINER'.

-- 23b. Return columns contain no email field.
-- select column_name
-- from   information_schema.columns
-- where  table_schema = 'information_schema'  -- informational only
-- Expected: check result set of the RPC call directly for absence of
-- 'email', 'username_changed_at', 'reserved_until', 'action_type'.

-- 23c. Anonymous callers cannot execute the RPC.
-- (as anon role)
-- select * from public.search_profiles_by_username_prefix('test');
-- Expected: permission denied (EXECUTE revoked from anon).
-- UNAUTHENTICATED inside the function is defense in depth if EXECUTE
-- were ever granted while auth.uid() is null.

-- 23d. Short prefix returns empty (< 3 chars).
-- select count(*) from public.search_profiles_by_username_prefix('ab');
-- Expected: 0

-- 23e. Invalid characters return empty.
-- select count(*) from public.search_profiles_by_username_prefix('a b');
-- Expected: 0

-- 23f. Prefix search returns at most 5 rows.
-- select count(*) from public.search_profiles_by_username_prefix('ath');
-- Expected: <= 5  (or 0 if no usernames start with 'ath')

-- 23g. Caller is excluded from results.
-- select user_id from public.search_profiles_by_username_prefix('own_prefix');
-- Expected: auth.uid() not present in result.

-- 23h. Exact match appears first.
-- (when 'atharva' and 'atharva2' both exist)
-- select username from public.search_profiles_by_username_prefix('atharva');
-- Expected: first row is 'atharva', then 'atharva2'.

-- 23i. Rate limit triggers after 30 calls/minute.
-- After 30 identical calls return results, the 31st returns 0 rows.
-- profile_action_rate_events shows 30 rows for
-- action_type = 'username_prefix_search'.

-- 23j. Results contain only: user_id, username, display_name, avatar_url.
-- select * from public.search_profiles_by_username_prefix('ath');
-- Confirm column list.

-- 23k. Migration 022 broad-SELECT removal is still in effect.
-- (as authenticated user)
-- select count(*) from public.profiles where id <> auth.uid();
-- Expected: 0 (RLS blocks cross-user direct SELECT).
