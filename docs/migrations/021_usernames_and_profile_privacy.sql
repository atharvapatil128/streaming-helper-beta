-- ============================================================
-- Migration 021 — Usernames (additive, backward compatible)
-- Beta 2, Phase 1 — database foundation
--
-- Adds username columns, reserved names, reuse holds, SECURITY
-- DEFINER RPCs, rate-limit infrastructure, and username write
-- guards WITHOUT removing the existing broad profile SELECT
-- policy or changing profile UPDATE grants.
--
-- Privacy enforcement lives in Migration 022 (apply after frontend).
--
-- Prerequisites: Migrations 006–020 applied.
--
-- Safe to re-run: IF NOT EXISTS, DROP … IF EXISTS, CREATE OR REPLACE.
-- ============================================================


-- ── 1. profiles.username columns ─────────────────────────────
-- Added first so downstream functions and constraints can reference them.

alter table public.profiles
  add column if not exists username text,
  add column if not exists username_changed_at timestamptz;

comment on column public.profiles.username is
  'Canonical lowercase public handle (3–30 chars, a-z0-9_). NULL until claimed.';

comment on column public.profiles.username_changed_at is
  'Set when username is first claimed or changed; enforces 30-day change cooldown.';


-- ── 2. Username normalization (IMMUTABLE — no dependencies) ──
-- Created BEFORE the CHECK constraint that calls it.

create or replace function public.normalize_username_input(p_username text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_username is null then
    return null;
  end if;

  v := lower(btrim(p_username));

  if v = '' then
    return null;
  end if;

  if length(v) < 3 or length(v) > 30 then
    return null;
  end if;

  if v !~ '^[a-z0-9_]+$' then
    return null;
  end if;

  if left(v, 1) = '_' or right(v, 1) = '_' then
    return null;
  end if;

  if position('__' in v) > 0 then
    return null;
  end if;

  if v ~ '^[0-9]+$' then
    return null;
  end if;

  return v;
end;
$$;

-- authenticated needs EXECUTE so PostgreSQL can evaluate the CHECK constraint
-- on any profile UPDATE, not only those going through username RPCs.
-- The function is IMMUTABLE, input-only, and accesses no tables.
revoke all on function public.normalize_username_input(text) from public, anon;
grant execute on function public.normalize_username_input(text) to authenticated;


-- ── 3. Stored username format constraint ─────────────────────
-- normalize_username_input is now defined above; the constraint is safe.
-- NULL passes without evaluation (PostgreSQL CHECK semantics).
-- A CHECK returning NULL also passes, so we explicitly require IS NOT NULL.

alter table public.profiles
  drop constraint if exists profiles_username_format_chk;

alter table public.profiles
  add constraint profiles_username_format_chk
  check (
    username is null
    or (
      public.normalize_username_input(username) is not null
      and username = public.normalize_username_input(username)
    )
  );


-- ── 4. Username uniqueness (partial index) ───────────────────

create unique index if not exists profiles_username_unique_idx
  on public.profiles (username)
  where username is not null;


-- ── 5. reserved_usernames ────────────────────────────────────

create table if not exists public.reserved_usernames (
  username   text        primary key,
  created_at timestamptz not null default now()
);

alter table public.reserved_usernames enable row level security;
revoke all on public.reserved_usernames from public, anon, authenticated;


-- ── 6. username_reservations (30-day reuse hold) ───────────

create table if not exists public.username_reservations (
  username         text        primary key,
  original_user_id uuid        references public.profiles (id) on delete set null,
  reserved_until   timestamptz not null,
  created_at       timestamptz not null default now()
);

create index if not exists username_reservations_until_idx
  on public.username_reservations (reserved_until);

alter table public.username_reservations enable row level security;
revoke all on public.username_reservations from public, anon, authenticated;


-- ── 7. Rate-limit event log ──────────────────────────────────

create table if not exists public.profile_action_rate_events (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  action_type text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists profile_action_rate_events_lookup_idx
  on public.profile_action_rate_events (user_id, action_type, created_at desc);

alter table public.profile_action_rate_events enable row level security;
revoke all on public.profile_action_rate_events from public, anon, authenticated;


-- ── 8. Seed reserved usernames ─────────────────────────────

insert into public.reserved_usernames (username) values
  ('admin'),
  ('administrator'),
  ('api'),
  ('app'),
  ('auth'),
  ('billing'),
  ('contact'),
  ('dashboard'),
  ('help'),
  ('moderator'),
  ('notifications'),
  ('privacy'),
  ('root'),
  ('security'),
  ('settings'),
  ('staff'),
  ('streaminghelper'),
  ('support'),
  ('system'),
  ('terms'),
  ('username'),
  ('user'),
  ('users')
on conflict (username) do nothing;


-- ── 9. profiles.updated_at trigger ───────────────────────────

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_profiles_updated_at();


-- ── 10. Email normalization (internal, IMMUTABLE) ──────────

create or replace function public.normalize_profile_email_input(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_email is null or btrim(p_email) = '' then null
    else lower(btrim(p_email))
  end;
$$;

revoke all on function public.normalize_profile_email_input(text) from public, anon, authenticated;


-- ── 11. Authoritative auth email resolver (internal, STABLE) ─
-- auth.users.email is the primary source; profiles.email is a
-- legacy fallback only when auth email is absent or blank.

create or replace function public.resolve_profile_auth_email(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when u.email is not null and btrim(u.email::text) <> '' then
      lower(btrim(u.email::text))
    when p.email is not null and btrim(p.email) <> '' then
      lower(btrim(p.email))
    else
      null
  end
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id;
$$;

revoke all on function public.resolve_profile_auth_email(uuid) from public, anon, authenticated;


-- ── 12. Username availability check (internal, STABLE) ─────

create or replace function public.is_username_available(p_normalized text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_normalized is not null
    and not exists (
      select 1 from public.reserved_usernames r
      where r.username = p_normalized
    )
    and not exists (
      select 1 from public.profiles p
      where p.username = p_normalized
    )
    and not exists (
      select 1 from public.username_reservations ur
      where ur.username = p_normalized
        and ur.reserved_until > now()
    );
$$;

revoke all on function public.is_username_available(text) from public, anon, authenticated;


-- ── 13. Concurrency-safe rate-limit recorder (internal, VOLATILE) ─
-- Advisory lock prevents parallel requests bypassing count+insert.
-- Returns true when the event was recorded, false when at limit.

create or replace function public.record_authenticated_action_rate_event(
  p_action    text,
  p_max_count integer,
  p_window    interval
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_count  integer;
begin
  if v_caller is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if p_action is null or btrim(p_action) = '' then
    raise exception 'INVALID_ACTION';
  end if;

  if p_max_count is null or p_max_count < 1 then
    raise exception 'INVALID_RATE_LIMIT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_caller::text || ':' || p_action, 0)
  );

  select count(*)
    into v_count
  from public.profile_action_rate_events e
  where e.user_id = v_caller
    and e.action_type = p_action
    and e.created_at > now() - p_window;

  if v_count >= p_max_count then
    return false;
  end if;

  insert into public.profile_action_rate_events (user_id, action_type)
  values (v_caller, p_action);

  return true;
end;
$$;

revoke all on function public.record_authenticated_action_rate_event(text, integer, interval)
  from public, anon, authenticated;


-- ── 14. Friend-request submission rate limits (internal, VOLATILE) ─
-- Burst:  5 / user / 1 minute
-- Daily: 20 / user / 24 hours
-- Shared by both send_friend_request_by_username and _by_email.
-- Returns 'RECORDED' or 'RATE_LIMITED' without raising.

create or replace function public.record_friend_request_submission_attempt()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_burst  integer;
  v_daily  integer;
  v_action text := 'friend_request_submit';
begin
  if v_caller is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_caller::text || ':' || v_action, 0)
  );

  select count(*)
    into v_burst
  from public.profile_action_rate_events e
  where e.user_id = v_caller
    and e.action_type = v_action
    and e.created_at > now() - interval '1 minute';

  if v_burst >= 5 then
    return 'RATE_LIMITED';
  end if;

  select count(*)
    into v_daily
  from public.profile_action_rate_events e
  where e.user_id = v_caller
    and e.action_type = v_action
    and e.created_at > now() - interval '24 hours';

  if v_daily >= 20 then
    return 'RATE_LIMITED';
  end if;

  insert into public.profile_action_rate_events (user_id, action_type)
  values (v_caller, v_action);

  return 'RECORDED';
end;
$$;

revoke all on function public.record_friend_request_submission_attempt()
  from public, anon, authenticated;


-- ── 15. Reserve a released username (internal) ───────────────

create or replace function public.reserve_username_hold(
  p_username text,
  p_original_user_id uuid,
  p_hold_days integer default 30
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_username is null then
    return;
  end if;

  insert into public.username_reservations (
    username,
    original_user_id,
    reserved_until
  )
  values (
    p_username,
    p_original_user_id,
    now() + make_interval(days => p_hold_days)
  )
  on conflict (username) do update
    set reserved_until = greatest(
          public.username_reservations.reserved_until,
          excluded.reserved_until
        ),
        original_user_id = excluded.original_user_id;
end;
$$;

revoke all on function public.reserve_username_hold(text, uuid, integer)
  from public, anon, authenticated;


-- ── 16. Username direct-write guard (INSERT OR UPDATE) ────────
-- Defense-in-depth before Migration 022 applies column grants.
--
-- SECURITY MODEL:
--   set_config('app.username_write_token', 'allowed', true) uses the
--   third argument true = LOCAL = transaction-scoped. The value is
--   visible only within the current transaction and is automatically
--   reset on commit or rollback. No other session or concurrent
--   transaction can observe it.
--
--   No authenticated-callable function sets this config key.
--   Only claim_username and change_username set it inside their own
--   SECURITY DEFINER transaction before the UPDATE.
--
--   PostgREST PATCH requests go through PostgREST's own transaction,
--   which never sets this key, so they are blocked by the trigger
--   even if table-level UPDATE privilege were somehow granted.

create or replace function public.profiles_guard_username_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.username is not null or new.username_changed_at is not null then
      if current_setting('app.username_write_token', true) is distinct from 'allowed' then
        raise exception 'USERNAME_WRITE_FORBIDDEN';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.username is distinct from new.username
       or old.username_changed_at is distinct from new.username_changed_at then
      if current_setting('app.username_write_token', true) is distinct from 'allowed' then
        raise exception 'USERNAME_WRITE_FORBIDDEN';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_username_write on public.profiles;

create trigger trg_profiles_guard_username_write
  before insert or update on public.profiles
  for each row
  execute function public.profiles_guard_username_write();


-- ── 17. Username hold on profile deletion ────────────────────

create or replace function public.profiles_reserve_username_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.username is not null then
    perform public.reserve_username_hold(old.username, old.id, 30);
  end if;
  return old;
end;
$$;

drop trigger if exists trg_profiles_reserve_username_on_delete on public.profiles;

create trigger trg_profiles_reserve_username_on_delete
  before delete on public.profiles
  for each row
  execute function public.profiles_reserve_username_on_delete();


-- ── 18. Partial unique index: pending requests by recipient id ────────
-- Prevents a second pending request to the same recipient_id even when
-- recipient_email differs (e.g. after an email change). Complements the
-- existing email-based uniqueness enforced by the schema.
--
-- PREFLIGHT — run before applying to detect existing conflicting rows:
-- select requester_id, recipient_id, count(*)
-- from   public.friend_requests
-- where  status = 'pending'
--   and  recipient_id is not null
-- group  by requester_id, recipient_id
-- having count(*) > 1;
-- If this returns rows, resolve duplicates before applying this migration.
-- Do NOT automatically delete or merge data.

create unique index if not exists
  friend_requests_pending_recipient_unique_idx
on public.friend_requests (requester_id, recipient_id)
where status = 'pending'
  and recipient_id is not null;


-- ── 19. RPC: check_username_available (VOLATILE — records rate event) ──

create or replace function public.check_username_available(p_username text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_normalized text;
begin
  if auth.uid() is null then
    return false;
  end if;

  if not public.record_authenticated_action_rate_event(
    'check_username_available', 60, interval '1 minute'
  ) then
    return false;
  end if;

  v_normalized := public.normalize_username_input(p_username);
  if v_normalized is null then
    return false;
  end if;

  return public.is_username_available(v_normalized);
end;
$$;

revoke all on function public.check_username_available(text) from public, anon;
grant execute on function public.check_username_available(text) to authenticated;


-- ── 19. RPC: claim_username (VOLATILE) ────────────────────────

create or replace function public.claim_username(p_username text)
returns table (username text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller           uuid := auth.uid();
  v_normalized       text;
  v_current_username text;
  v_row_count        integer;
begin
  if v_caller is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  v_normalized := public.normalize_username_input(p_username);
  if v_normalized is null then
    raise exception 'USERNAME_INVALID';
  end if;

  -- FOR UPDATE serializes concurrent claims by the same account.
  select p.username
    into v_current_username
  from public.profiles p
  where p.id = v_caller
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if v_current_username is not null then
    raise exception 'USERNAME_ALREADY_SET';
  end if;

  if not public.is_username_available(v_normalized) then
    raise exception 'USERNAME_UNAVAILABLE';
  end if;

  perform set_config('app.username_write_token', 'allowed', true);

  -- Conditional UPDATE guards against concurrent claim winning the race.
  update public.profiles
     set username = v_normalized,
         username_changed_at = now()
   where id = v_caller
     and username is null;

  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    raise exception 'USERNAME_ALREADY_SET';
  end if;

  return query select v_normalized;
exception
  when unique_violation then
    raise exception 'USERNAME_UNAVAILABLE';
end;
$$;

revoke all on function public.claim_username(text) from public, anon;
grant execute on function public.claim_username(text) to authenticated;


-- ── 20. RPC: change_username (VOLATILE) ───────────────────────

create or replace function public.change_username(p_username text)
returns table (username text, changed_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller       uuid := auth.uid();
  v_normalized   text;
  v_old_username text;
  v_changed_at   timestamptz;
  v_now          timestamptz := now();
begin
  if v_caller is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  -- FOR UPDATE serializes concurrent changes by the same account.
  select p.username, p.username_changed_at
    into v_old_username, v_changed_at
  from public.profiles p
  where p.id = v_caller
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if v_old_username is null then
    raise exception 'USERNAME_NOT_SET';
  end if;

  if v_changed_at is not null
     and v_changed_at > v_now - interval '30 days' then
    raise exception 'COOLDOWN_ACTIVE';
  end if;

  v_normalized := public.normalize_username_input(p_username);
  if v_normalized is null then
    raise exception 'USERNAME_INVALID';
  end if;

  if v_normalized = v_old_username then
    raise exception 'USERNAME_UNCHANGED';
  end if;

  if not public.is_username_available(v_normalized) then
    raise exception 'USERNAME_UNAVAILABLE';
  end if;

  perform public.reserve_username_hold(v_old_username, v_caller, 30);

  perform set_config('app.username_write_token', 'allowed', true);

  update public.profiles
     set username = v_normalized,
         username_changed_at = v_now
   where id = v_caller;

  return query select v_normalized, v_now;
exception
  when unique_violation then
    raise exception 'USERNAME_UNAVAILABLE';
end;
$$;

revoke all on function public.change_username(text) from public, anon;
grant execute on function public.change_username(text) to authenticated;


-- ── 21. RPC: lookup_profile_by_username (VOLATILE) ───────────

create or replace function public.lookup_profile_by_username(p_username text)
returns table (
  id           uuid,
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
  v_normalized text;
begin
  if auth.uid() is null then
    return;
  end if;

  if not public.record_authenticated_action_rate_event(
    'lookup_username', 30, interval '1 minute'
  ) then
    return;
  end if;

  v_normalized := public.normalize_username_input(p_username);
  if v_normalized is null then
    return;
  end if;

  return query
  select p.id, p.username, p.display_name, p.avatar_url
  from public.profiles p
  where p.username = v_normalized;
end;
$$;

revoke all on function public.lookup_profile_by_username(text) from public, anon;
grant execute on function public.lookup_profile_by_username(text) to authenticated;


-- ── 22. RPC: lookup_profile_by_email (VOLATILE) ────────────────

create or replace function public.lookup_profile_by_email(p_email text)
returns table (
  id           uuid,
  display_name text,
  username     text,
  avatar_url   text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    return;
  end if;

  if not public.record_authenticated_action_rate_event(
    'lookup_email', 30, interval '1 minute'
  ) then
    return;
  end if;

  v_email := public.normalize_profile_email_input(p_email);
  if v_email is null then
    return;
  end if;

  return query
  select p.id, p.display_name, p.username, p.avatar_url
  from public.profiles p
  where public.resolve_profile_auth_email(p.id) = v_email
  limit 1;
end;
$$;

revoke all on function public.lookup_profile_by_email(text) from public, anon;
grant execute on function public.lookup_profile_by_email(text) to authenticated;


-- ── 23. RPC: send_friend_request_by_username (VOLATILE) ──────
-- Rate event recorded first and committed with every attempt.
-- Expected outcomes return a status row; no exception rollback.

create or replace function public.send_friend_request_by_username(p_username text)
returns table (
  status                 text,
  request_id             uuid,
  recipient_id           uuid,
  recipient_username     text,
  recipient_display_name text,
  recipient_avatar_url   text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller            uuid := auth.uid();
  v_rate              text;
  v_normalized        text;
  v_recipient_id      uuid;
  v_recipient_email   text;
  v_recipient_user    text;
  v_recipient_display text;
  v_recipient_avatar  text;
  v_request_id        uuid;
begin
  if v_caller is null then
    return query select 'UNAUTHENTICATED'::text,
      null::uuid, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  v_rate := public.record_friend_request_submission_attempt();
  if v_rate = 'RATE_LIMITED' then
    return query select 'RATE_LIMITED'::text,
      null::uuid, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  v_normalized := public.normalize_username_input(p_username);
  if v_normalized is null then
    return query select 'USERNAME_INVALID'::text,
      null::uuid, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  select p.id, p.username, p.display_name, p.avatar_url
    into v_recipient_id, v_recipient_user, v_recipient_display, v_recipient_avatar
  from public.profiles p
  where p.username = v_normalized;

  if v_recipient_id is null then
    return query select 'RECIPIENT_NOT_FOUND'::text,
      null::uuid, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  if v_recipient_id = v_caller then
    return query select 'CANNOT_REQUEST_SELF'::text,
      null::uuid, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  v_recipient_email := public.resolve_profile_auth_email(v_recipient_id);

  if v_recipient_email is null or v_recipient_email = '' then
    return query select 'RECIPIENT_NOT_FOUND'::text,
      null::uuid, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  if exists (
    select 1 from public.friendships f
    where f.user_id = v_caller and f.friend_id = v_recipient_id
  ) then
    return query select 'ALREADY_FRIENDS'::text,
      null::uuid, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  -- Duplicate check by recipient_id (race-safe via partial unique index)
  -- or by authoritative email (covers rows where recipient_id differs or
  -- was not set on older rows).
  if exists (
    select 1 from public.friend_requests fr
    where fr.requester_id = v_caller
      and fr.status = 'pending'
      and (
        fr.recipient_id = v_recipient_id
        or lower(btrim(fr.recipient_email)) = v_recipient_email
      )
  ) then
    return query select 'REQUEST_ALREADY_PENDING'::text,
      null::uuid, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  begin
    insert into public.friend_requests (
      requester_id, recipient_id, recipient_email, status
    )
    values (v_caller, v_recipient_id, v_recipient_email, 'pending')
    returning id into v_request_id;
  exception
    when unique_violation then
      return query select 'REQUEST_ALREADY_PENDING'::text,
        null::uuid, null::uuid, null::text, null::text, null::text;
      return;
  end;

  return query select
    'SENT'::text,
    v_request_id,
    v_recipient_id,
    v_recipient_user,
    v_recipient_display,
    v_recipient_avatar;
end;
$$;

revoke all on function public.send_friend_request_by_username(text) from public, anon;
grant execute on function public.send_friend_request_by_username(text) to authenticated;


-- ── 24. RPC: send_friend_request_by_email (VOLATILE) ─────────
-- Uses the same shared 5/min + 20/24h rate limits.
-- Resolves recipient internally; never returns recipient email.

create or replace function public.send_friend_request_by_email(p_email text)
returns table (
  status                 text,
  request_id             uuid,
  recipient_id           uuid,
  recipient_username     text,
  recipient_display_name text,
  recipient_avatar_url   text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller            uuid := auth.uid();
  v_rate              text;
  v_email             text;
  v_recipient_id      uuid;
  v_recipient_email   text;
  v_recipient_user    text;
  v_recipient_display text;
  v_recipient_avatar  text;
  v_request_id        uuid;
begin
  if v_caller is null then
    return query select 'UNAUTHENTICATED'::text,
      null::uuid, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  v_rate := public.record_friend_request_submission_attempt();
  if v_rate = 'RATE_LIMITED' then
    return query select 'RATE_LIMITED'::text,
      null::uuid, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  v_email := public.normalize_profile_email_input(p_email);
  if v_email is null or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return query select 'EMAIL_INVALID'::text,
      null::uuid, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  -- Resolve recipient by auth email (authoritative), falling back to
  -- profiles.email for legacy rows where auth email is absent.
  select p.id, p.username, p.display_name, p.avatar_url
    into v_recipient_id, v_recipient_user, v_recipient_display, v_recipient_avatar
  from auth.users u
  inner join public.profiles p on p.id = u.id
  where (
    case
      when u.email is not null and btrim(u.email::text) <> '' then lower(btrim(u.email::text))
      when p.email is not null and btrim(p.email) <> ''       then lower(btrim(p.email))
      else null
    end
  ) = v_email
  limit 1;

  if v_recipient_id is null then
    return query select 'RECIPIENT_NOT_FOUND'::text,
      null::uuid, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  if v_recipient_id = v_caller then
    return query select 'CANNOT_REQUEST_SELF'::text,
      null::uuid, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  -- Re-resolve the authoritative email for the matched recipient to use in
  -- the friend_requests row (handles edge-case where lookup matched on
  -- profiles.email but auth.users.email has since been updated).
  v_recipient_email := public.resolve_profile_auth_email(v_recipient_id);

  if v_recipient_email is null or v_recipient_email = '' then
    return query select 'RECIPIENT_NOT_FOUND'::text,
      null::uuid, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  if exists (
    select 1 from public.friendships f
    where f.user_id = v_caller and f.friend_id = v_recipient_id
  ) then
    return query select 'ALREADY_FRIENDS'::text,
      null::uuid, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  -- Duplicate check by recipient_id (race-safe via partial unique index)
  -- or by authoritative email (covers rows where recipient_id differs or
  -- was not set on older rows).
  if exists (
    select 1 from public.friend_requests fr
    where fr.requester_id = v_caller
      and fr.status = 'pending'
      and (
        fr.recipient_id = v_recipient_id
        or lower(btrim(fr.recipient_email)) = v_recipient_email
      )
  ) then
    return query select 'REQUEST_ALREADY_PENDING'::text,
      null::uuid, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  begin
    insert into public.friend_requests (
      requester_id, recipient_id, recipient_email, status
    )
    values (v_caller, v_recipient_id, v_recipient_email, 'pending')
    returning id into v_request_id;
  exception
    when unique_violation then
      return query select 'REQUEST_ALREADY_PENDING'::text,
        null::uuid, null::uuid, null::text, null::text, null::text;
      return;
  end;

  return query select
    'SENT'::text,
    v_request_id,
    v_recipient_id,
    v_recipient_user,
    v_recipient_display,
    v_recipient_avatar;
end;
$$;

revoke all on function public.send_friend_request_by_email(text) from public, anon;
grant execute on function public.send_friend_request_by_email(text) to authenticated;


-- ── 25. Safe cross-user profile read RPCs (STABLE) ────────────

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

revoke all on function public.get_my_friend_profiles() from public, anon;
grant execute on function public.get_my_friend_profiles() to authenticated;


create or replace function public.get_incoming_friend_requests_safe()
returns table (
  id                     uuid,
  requester_id           uuid,
  status                 text,
  created_at             timestamptz,
  requester_username     text,
  requester_display_name text,
  requester_avatar_url   text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    fr.id,
    fr.requester_id,
    fr.status,
    fr.created_at,
    p.username,
    p.display_name,
    p.avatar_url
  from public.friend_requests fr
  inner join public.profiles p on p.id = fr.requester_id
  where fr.recipient_id = auth.uid()
    and fr.status = 'pending'
  order by fr.created_at desc;
$$;

revoke all on function public.get_incoming_friend_requests_safe() from public, anon;
grant execute on function public.get_incoming_friend_requests_safe() to authenticated;


-- Matches fetchSentRecommendations(): non-dismissed sent rows only.
create or replace function public.get_sent_recommendation_recipients_safe()
returns table (
  profile_id   uuid,
  username     text,
  display_name text,
  avatar_url   text
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (p.id)
    p.id,
    p.username,
    p.display_name,
    p.avatar_url
  from public.recommendations r
  inner join public.profiles p on p.id = r.to_user_id
  where r.from_user_id = auth.uid()
    and r.dismissed = false
  order by p.id;
$$;

revoke all on function public.get_sent_recommendation_recipients_safe() from public, anon;
grant execute on function public.get_sent_recommendation_recipients_safe() to authenticated;


-- ── 26. RPC: get_my_sent_friend_requests_safe (STABLE) ─────────
-- Left-joins recipient profile so historical rows with NULL recipient_id
-- are not hidden. Never returns recipient_email.

create or replace function public.get_my_sent_friend_requests_safe()
returns table (
  id                     uuid,
  recipient_id           uuid,
  status                 text,
  created_at             timestamptz,
  recipient_username     text,
  recipient_display_name text,
  recipient_avatar_url   text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    fr.id,
    fr.recipient_id,
    fr.status,
    fr.created_at,
    p.username,
    p.display_name,
    p.avatar_url
  from public.friend_requests fr
  left join public.profiles p on p.id = fr.recipient_id
  where fr.requester_id = auth.uid()
    and fr.status = 'pending'
  order by fr.created_at desc;
$$;

revoke all on function public.get_my_sent_friend_requests_safe() from public, anon;
grant execute on function public.get_my_sent_friend_requests_safe() to authenticated;


-- ── 27. Backward-compatible notes ─────────────────────────────
-- Broad "Authenticated users can view profiles for friend discovery" retained.
-- Existing friend_requests INSERT and SELECT policies retained.
-- Migration 022 enforces privacy after frontend migration.


-- ============================================================
-- Verification / test guidance (SELECT-only unless noted)
-- ============================================================

-- 21a. normalize_username_input exists BEFORE the CHECK constraint.
-- This query must return a row (verifies function was created first).
-- select public.normalize_username_input('alice');  -- expect 'alice'

-- 21b. CHECK constraint references the function.
-- select conname, pg_get_constraintdef(oid)
-- from   pg_constraint
-- where  conrelid = 'public.profiles'::regclass
--   and  conname = 'profiles_username_format_chk';

-- 21c. Direct insert of non-canonical username blocked by CHECK (TEST-ENV).
-- insert into public.profiles (id) values (auth.uid());
--   → set username = 'ADMIN' directly → should fail (trigger and/or CHECK).

-- 21d. Broad discovery SELECT policy still present.
-- select polname from pg_policy
-- where  polrelid = 'public.profiles'::regclass
--   and  polname = 'Authenticated users can view profiles for friend discovery';

-- 21e. Function volatility (lookup/check/send_request must be VOLATILE = 'v').
-- select proname, provolatile
-- from   pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where  n.nspname = 'public'
--   and  proname in (
--          'lookup_profile_by_username','lookup_profile_by_email',
--          'check_username_available',
--          'send_friend_request_by_username','send_friend_request_by_email'
--        );

-- 21f. Concurrent claim_username (TEST-ENV).
-- Two sessions, same user, username = NULL.
-- Both call claim_username('same_name') concurrently.
-- Expect exactly one success; other raises USERNAME_ALREADY_SET or
-- USERNAME_UNAVAILABLE (partial unique index race).

-- 21g. Concurrent change_username (TEST-ENV).
-- Two sessions, same user, cooldown satisfied.
-- Both call change_username to different valid names concurrently.
-- Expect one success; other raises COOLDOWN_ACTIVE or USERNAME_UNAVAILABLE.

-- 21h. lookup RPCs run without STABLE-in-write errors (TEST-ENV).
-- select * from public.lookup_profile_by_username('someuser');
-- select * from public.lookup_profile_by_email('friend@example.com');
-- Expect: results returned, no "INSERT not allowed in non-volatile function" error.

-- 21i. Failed friend-request attempts count toward limits (TEST-ENV).
-- Call send_friend_request_by_username with invalid username 6 times in 1 min.
-- Expect status = 'RATE_LIMITED' on 6th call.
-- Confirm 5 rows in profile_action_rate_events with action_type='friend_request_submit'.

-- 21j. Availability checks count toward 60/min (TEST-ENV).
-- Call check_username_available 61 times in one minute.
-- 61st returns false. Events table shows 60 rows for
-- action_type = 'check_username_available'.

-- 21k. send_friend_request_by_username structured statuses (TEST-ENV).
-- select status from public.send_friend_request_by_username('not_valid!!!');
-- Expect: 'USERNAME_INVALID' (one row, no exception).

-- 21l. send_friend_request_by_email structured statuses (TEST-ENV).
-- select status from public.send_friend_request_by_email('notanemail');
-- Expect: 'EMAIL_INVALID'.
-- select status from public.send_friend_request_by_email('nobody@example.com');
-- Expect: 'RECIPIENT_NOT_FOUND'.

-- 21m. send_friend_request_by_username result contains no email column.
-- select column_name from information_schema.columns
-- where  ... (or inspect result set of the function call directly).
-- Confirm: no 'recipient_email' or 'email' column in result.

-- 21n. get_my_sent_friend_requests_safe contains no email column (TEST-ENV).
-- select * from public.get_my_sent_friend_requests_safe() limit 1;
-- Confirm result columns exclude any *email* field.

-- 21o. get_incoming_friend_requests_safe contains no email column (TEST-ENV).
-- select * from public.get_incoming_friend_requests_safe() limit 1;

-- 21p. Both send RPCs trigger email_jobs enqueue (TEST-ENV).
-- Confirm trg_enqueue_friend_request_email fires after each successful insert.
-- select * from public.email_jobs order by created_at desc limit 5;

-- 21q. Legacy frontend still functional before 022 (TEST-ENV).
-- select email from public.profiles where id <> auth.uid() limit 1;
-- Expect: rows returned (broad SELECT policy still active in 021).
-- useFriendRequests.sendRequest('friend@example.com') works via direct INSERT.

-- 21r. Username guard trigger fires on INSERT OR UPDATE.
-- select tgtype & 4 > 0  as fires_on_insert,
--        tgtype & 16 > 0 as fires_on_update
-- from   pg_trigger
-- where  tgrelid = 'public.profiles'::regclass
--   and  tgname  = 'trg_profiles_guard_username_write';
-- Expect both: true.

-- 21s. Invitation + email-job triggers still present.
-- select tgname from pg_trigger
-- where  tgname in ('trg_enqueue_recommendation_email','trg_enqueue_friend_request_email')
--   and  not tgisinternal;

-- 21t. normalize_username_input EXECUTE granted to authenticated.
-- select has_function_privilege(
--   'authenticated',
--   'public.normalize_username_input(text)'::regprocedure,
--   'EXECUTE'
-- );
-- Expect: true.

-- 21u. Both partial unique indexes on friend_requests exist.
-- select indexname, indexdef
-- from   pg_indexes
-- where  tablename = 'friend_requests'
--   and  indexname in (
--          'friend_requests_pending_recipient_unique_idx'
--        );
-- Expect: one row with the partial WHERE clause.

-- 21v. Duplicate pending request by same recipient_id blocked even
--      when recipient_email differs (TEST-ENV).
-- Insert a pending request to recipient_id X via send_friend_request_by_username.
-- Then call send_friend_request_by_email with a DIFFERENT email that resolves
-- to the same recipient_id X.
-- Expect: status = 'REQUEST_ALREADY_PENDING' on the second call.

-- 21w. Duplicate pending request by same email blocked even when
--      recipient_id not yet on the older row (TEST-ENV).
-- With a legacy row where recipient_id IS NULL and recipient_email = 'x@example.com':
-- Call send_friend_request_by_email('x@example.com').
-- Expect: status = 'REQUEST_ALREADY_PENDING'.

-- 21x. Both send RPCs return REQUEST_ALREADY_PENDING for the same recipient (TEST-ENV).
-- After sending via username RPC:
--   select status from public.send_friend_request_by_username('<same_username>');
-- After sending via email RPC:
--   select status from public.send_friend_request_by_email('<same_email>');
-- Both expect: 'REQUEST_ALREADY_PENDING'.
