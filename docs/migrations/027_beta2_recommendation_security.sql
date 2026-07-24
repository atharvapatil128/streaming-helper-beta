-- ============================================================
-- Migration 027 - Beta 2 recommendation security
--
-- Authoritative batch sending, short-lived undo, recommendation ACL/RLS
-- lockdown, evidence-backed friend profiles, and an internal extension-login
-- rate limiter.
--
-- Prerequisites: Migrations 001-026.
-- Do not apply directly to production. Verify in a disposable/test project.
-- ============================================================

-- Only send_title_recommendation may create undo eligibility.
create table if not exists public.recommendation_send_undo_entries (
  recommendation_id uuid primary key
    references public.recommendations (id) on delete cascade,
  sender_id         uuid        not null
    references public.profiles (id) on delete cascade,
  action            text        not null check (action = 'SENT'),
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  constraint recommendation_send_undo_expiry_chk
    check (expires_at > created_at)
);

create index if not exists recommendation_send_undo_sender_expiry_idx
  on public.recommendation_send_undo_entries (sender_id, expires_at);

alter table public.recommendation_send_undo_entries enable row level security;
revoke all on table public.recommendation_send_undo_entries
  from public, anon, authenticated, service_role;

-- Successful sends/reactivations consume abuse-limit events. Already-active
-- duplicates do not. Rows contain no title metadata and are retained for only
-- the rolling-limit window plus a bounded cleanup margin.
create table if not exists public.recommendation_send_rate_events (
  id           bigint generated always as identity primary key,
  sender_id    uuid        not null
    references public.profiles (id) on delete cascade,
  recipient_id uuid        not null
    references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  constraint recommendation_send_rate_no_self_chk
    check (sender_id <> recipient_id)
);

create index if not exists recommendation_send_rate_sender_idx
  on public.recommendation_send_rate_events (sender_id, created_at desc);

create index if not exists recommendation_send_rate_pair_idx
  on public.recommendation_send_rate_events
    (sender_id, recipient_id, created_at desc);

create index if not exists recommendation_send_rate_created_at_idx
  on public.recommendation_send_rate_events (created_at);

alter table public.recommendation_send_rate_events enable row level security;
revoke all on table public.recommendation_send_rate_events
  from public, anon, authenticated, service_role;


create or replace function public.send_title_recommendation(
  p_recipient_ids uuid[],
  p_tmdb_id       integer,
  p_media_type    text,
  p_title         text,
  p_thumbnail_url text,
  p_year          text,
  p_genres        text[],
  p_platform      text
)
returns table (
  recipient_id       uuid,
  recommendation_id  uuid,
  status              text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sender          uuid := auth.uid();
  v_recipient       uuid;
  v_existing        public.recommendations%rowtype;
  v_recommendation  uuid;
  v_source_name     text;
  v_genres          text[];
  v_activation_count integer;
  v_sender_count     integer;
  v_pair_count       integer;
begin
  if v_sender is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_recipient_ids is null
     or array_ndims(p_recipient_ids) <> 1
     or cardinality(p_recipient_ids) < 1
     or cardinality(p_recipient_ids) > 20
     or exists (
       select 1 from unnest(p_recipient_ids) as r(id) where r.id is null
     )
     or exists (
       select 1 from unnest(p_recipient_ids) as r(id)
       group by r.id having count(*) > 1
     )
     or v_sender = any(p_recipient_ids) then
    raise exception 'INVALID_RECIPIENTS';
  end if;

  if p_tmdb_id is null or p_tmdb_id <= 0 then
    raise exception 'INVALID_TMDB_ID';
  end if;
  if p_media_type is null or p_media_type not in ('movie', 'series') then
    raise exception 'INVALID_MEDIA_TYPE';
  end if;
  if p_title is null or btrim(p_title) = '' or length(p_title) > 300
     or p_title ~ '[[:cntrl:]]' then
    raise exception 'INVALID_TITLE';
  end if;
  if p_thumbnail_url is not null and (
       p_thumbnail_url !~
         '^https://image[.]tmdb[.]org/t/p/w500/[A-Za-z0-9._-]{1,200}$'
     ) then
    raise exception 'INVALID_THUMBNAIL_URL';
  end if;
  if p_year is not null and (
       btrim(p_year) = '' or length(p_year) > 20 or p_year ~ '[[:cntrl:]]'
     ) then
    raise exception 'INVALID_YEAR';
  end if;
  if p_genres is null
     or coalesce(array_ndims(p_genres), 1) <> 1
     or cardinality(p_genres) > 20
     or exists (
       select 1 from unnest(p_genres) as g(value)
       where g.value is null or btrim(g.value) = ''
          or length(g.value) > 100 or g.value ~ '[[:cntrl:]]'
     ) then
    raise exception 'INVALID_GENRES';
  end if;
  if p_platform is null or btrim(p_platform) = ''
     or length(p_platform) > 100 or p_platform ~ '[[:cntrl:]]' then
    raise exception 'INVALID_PLATFORM';
  end if;

  select coalesce(
           nullif(btrim(p.display_name), ''),
           case when nullif(btrim(p.username), '') is not null
             then '@' || btrim(p.username)
             else 'Streaming Helper user'
           end
         )
    into v_source_name
  from public.profiles as p
  where p.id = v_sender;

  if not found then
    raise exception 'SENDER_PROFILE_NOT_FOUND';
  end if;

  select coalesce(array_agg(btrim(g.value) order by g.ordinality), '{}'::text[])
    into v_genres
  from unnest(p_genres) with ordinality as g(value, ordinality);

  -- Serialize each sender's rolling quota before acquiring sorted friendship
  -- locks. All callers of this RPC use this same fixed lock order.
  perform pg_advisory_xact_lock(
    hashtextextended('recommendation-send:sender:' || v_sender::text, 27027)
  );

  -- Exact Migration 024 unordered-pair key and seed. Sorted acquisition
  -- prevents deadlocks for overlapping batches.
  for v_recipient in
    select r.id from unnest(p_recipient_ids) as r(id) order by r.id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        'friendship:'
          || least(v_sender::text, v_recipient::text)
          || ':'
          || greatest(v_sender::text, v_recipient::text),
        24024
      )
    );
  end loop;

  -- Validate the whole batch before any recommendation write. Both directed
  -- edges and accepted request/invitation evidence are mandatory.
  if exists (
    select 1
    from unnest(p_recipient_ids) as r(id)
    where not (
      r.id <> v_sender
      and exists (
        select 1 from public.friendships as f
        where f.user_id = v_sender and f.friend_id = r.id
      )
      and exists (
        select 1 from public.friendships as f
        where f.user_id = r.id and f.friend_id = v_sender
      )
      and (
        exists (
          select 1 from public.friend_requests as fr
          where fr.status = 'accepted'
            and (
              (fr.requester_id = v_sender and fr.recipient_id = r.id)
              or (fr.requester_id = r.id and fr.recipient_id = v_sender)
            )
        )
        or exists (
          select 1 from public.invitations as i
          where i.status = 'accepted'
            and (
              (i.inviter_id = v_sender and i.accepted_by = r.id)
              or (i.inviter_id = r.id and i.accepted_by = v_sender)
            )
        )
      )
    )
  ) then
    raise exception 'RECIPIENT_NOT_AUTHORIZED';
  end if;

  -- Freeze the active/dismissed state used by quota calculation. Recipient
  -- dismissal and another send can otherwise change a matching row between
  -- the preflight count and the write loop. Deterministic recipient ordering
  -- preserves the batch deadlock discipline used throughout this function.
  perform rec.id
  from public.recommendations as rec
  where rec.from_user_id = v_sender
    and rec.to_user_id = any(p_recipient_ids)
    and rec.tmdb_id = p_tmdb_id
    and rec.media_type = p_media_type
  order by rec.to_user_id
  for update;

  -- Free-plan abuse protection: permit at most 100 successful recipient
  -- activations per sender and 10 per sender/recipient pair in 24 hours.
  -- Already-active duplicate sends neither consume quota nor create events.
  delete from public.recommendation_send_rate_events as e
  where e.created_at < now() - interval '48 hours';

  select count(*)::integer
    into v_activation_count
  from unnest(p_recipient_ids) as r(id)
  where not exists (
    select 1
    from public.recommendations as rec
    where rec.from_user_id = v_sender
      and rec.to_user_id = r.id
      and rec.tmdb_id = p_tmdb_id
      and rec.media_type = p_media_type
      and rec.dismissed = false
  );

  select count(*)::integer
    into v_sender_count
  from public.recommendation_send_rate_events as e
  where e.sender_id = v_sender
    and e.created_at > now() - interval '24 hours';

  if v_sender_count + v_activation_count > 100 then
    raise exception 'RATE_LIMITED';
  end if;

  for v_recipient in
    select r.id
    from unnest(p_recipient_ids) as r(id)
    where not exists (
      select 1
      from public.recommendations as rec
      where rec.from_user_id = v_sender
        and rec.to_user_id = r.id
        and rec.tmdb_id = p_tmdb_id
        and rec.media_type = p_media_type
        and rec.dismissed = false
    )
    order by r.id
  loop
    select count(*)::integer
      into v_pair_count
    from public.recommendation_send_rate_events as e
    where e.sender_id = v_sender
      and e.recipient_id = v_recipient
      and e.created_at > now() - interval '24 hours';

    if v_pair_count >= 10 then
      raise exception 'RATE_LIMITED';
    end if;
  end loop;

  for v_recipient in
    select r.id from unnest(p_recipient_ids) as r(id) order by r.id
  loop
    select rec.*
      into v_existing
    from public.recommendations as rec
    where rec.from_user_id = v_sender
      and rec.to_user_id = v_recipient
      and rec.tmdb_id = p_tmdb_id
      and rec.media_type = p_media_type
    for update;

    if found and not v_existing.dismissed then
      -- Reciprocal rows are intentionally not checked: reciprocal sends work.
      delete from public.recommendation_send_undo_entries as u
      where u.recommendation_id = v_existing.id
        and u.sender_id = v_sender;

      recipient_id := v_recipient;
      recommendation_id := null;
      status := 'ALREADY_ACTIVE';
      return next;
    elsif found then
      update public.recommendations as rec
         set title = btrim(p_title),
             thumbnail_url = p_thumbnail_url,
             year = case when p_year is null then null else btrim(p_year) end,
             rating = null,
             duration = null,
             genres = v_genres,
             platforms = array[btrim(p_platform)],
             source_name = v_source_name,
             dismissed = false
       where rec.id = v_existing.id;

      -- Undo is deliberately unavailable for reactivation. Remove any stale
      -- eligibility from an earlier fresh send of this row.
      delete from public.recommendation_send_undo_entries as u
      where u.recommendation_id = v_existing.id;

      insert into public.recommendation_send_rate_events (
        sender_id, recipient_id
      )
      values (v_sender, v_recipient);

      recipient_id := v_recipient;
      recommendation_id := null;
      status := 'REACTIVATED';
      return next;
    else
      insert into public.recommendations (
        from_user_id, to_user_id, tmdb_id, media_type, title,
        thumbnail_url, year, rating, duration, genres, platforms,
        source_name, dismissed
      )
      values (
        v_sender, v_recipient, p_tmdb_id, p_media_type, btrim(p_title),
        p_thumbnail_url,
        case when p_year is null then null else btrim(p_year) end,
        null,
        null,
        v_genres, array[btrim(p_platform)], v_source_name, false
      )
      returning id into v_recommendation;

      insert into public.recommendation_send_undo_entries (
        recommendation_id, sender_id, action, expires_at
      )
      values (
        v_recommendation, v_sender, 'SENT', now() + interval '5 minutes'
      )
      on conflict (recommendation_id) do update
        set sender_id = excluded.sender_id,
            action = excluded.action,
            created_at = now(),
            expires_at = excluded.expires_at;

      insert into public.recommendation_send_rate_events (
        sender_id, recipient_id
      )
      values (v_sender, v_recipient);

      recipient_id := v_recipient;
      recommendation_id := v_recommendation;
      status := 'SENT';
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.send_title_recommendation(
  uuid[], integer, text, text, text, text, text[], text
) from public, anon, authenticated, service_role;
grant execute on function public.send_title_recommendation(
  uuid[], integer, text, text, text, text, text[], text
) to authenticated;


create or replace function public.undo_title_recommendation(
  p_recommendation_ids uuid[]
)
returns table (recommendation_id uuid, status text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sender         uuid := auth.uid();
  v_recommendation uuid;
  v_undo            public.recommendation_send_undo_entries%rowtype;
  v_all_eligible    boolean := true;
  v_deleted_count   integer;
begin
  if v_sender is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_recommendation_ids is null
     or array_ndims(p_recommendation_ids) <> 1
     or cardinality(p_recommendation_ids) < 1
     or cardinality(p_recommendation_ids) > 20
     or exists (
       select 1 from unnest(p_recommendation_ids) as r(id) where r.id is null
     )
     or exists (
       select 1 from unnest(p_recommendation_ids) as r(id)
       group by r.id having count(*) > 1
     ) then
    raise exception 'INVALID_RECOMMENDATION_IDS';
  end if;

  for v_recommendation in
    select r.id from unnest(p_recommendation_ids) as r(id) order by r.id
  loop
    v_undo := null;

    select u.*
      into v_undo
    from public.recommendation_send_undo_entries as u
    inner join public.recommendations as rec
      on rec.id = u.recommendation_id
    where u.recommendation_id = v_recommendation
      and u.sender_id = v_sender
      and u.action = 'SENT'
      and rec.from_user_id = v_sender
      and rec.dismissed = false
    for update of u, rec;

    if not found or v_undo.expires_at <= now() then
      v_all_eligible := false;
    end if;
  end loop;

  -- Batch undo is all-or-nothing. Every eligible row was locked above before
  -- this decision, so recipient dismissal and competing undo/delete writes
  -- cannot change an approved batch between validation and deletion.
  if not v_all_eligible then
    for v_recommendation in
      select r.id from unnest(p_recommendation_ids) as r(id) order by r.id
    loop
      recommendation_id := v_recommendation;
      status := 'UNDO_UNAVAILABLE';
      return next;
    end loop;
    return;
  end if;

  delete from public.recommendations as rec
  where rec.id = any(p_recommendation_ids)
    and rec.from_user_id = v_sender;

  get diagnostics v_deleted_count = row_count;

  -- Defensive invariant: any unexpected row-count mismatch aborts and rolls
  -- back the complete statement rather than exposing a partial undo.
  if v_deleted_count <> cardinality(p_recommendation_ids) then
    raise exception 'UNDO_CONFLICT';
  end if;

  for v_recommendation in
    select r.id from unnest(p_recommendation_ids) as r(id) order by r.id
  loop
    recommendation_id := v_recommendation;
    status := 'UNDONE';
    return next;
  end loop;
end;
$$;

create or replace function public.undo_title_recommendation(
  p_recommendation_id uuid
)
returns table (recommendation_id uuid, status text)
language sql
volatile
security definer
set search_path = ''
as $$
  select *
  from public.undo_title_recommendation(array[p_recommendation_id]);
$$;

revoke all on function public.undo_title_recommendation(uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.undo_title_recommendation(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.undo_title_recommendation(uuid[])
  to authenticated;
grant execute on function public.undo_title_recommendation(uuid)
  to authenticated;


-- Remove every known broad legacy policy, then restore only web-required
-- reads, recipient dismissed-column updates, and sender deletes.
drop policy if exists "Recipients can view recommendations"
  on public.recommendations;
drop policy if exists "Senders can view sent recommendations"
  on public.recommendations;
drop policy if exists "Senders and recipients can view recommendations"
  on public.recommendations;
drop policy if exists "Senders can create recommendations"
  on public.recommendations;
drop policy if exists "Users can add recommendations"
  on public.recommendations;
drop policy if exists "Recipients can dismiss recommendations"
  on public.recommendations;
drop policy if exists "Users can dismiss their own recommendations"
  on public.recommendations;
drop policy if exists "Recipients can update recommendation dismissal"
  on public.recommendations;
drop policy if exists "Senders can delete their recommendations"
  on public.recommendations;

create policy "Senders and recipients can view recommendations"
  on public.recommendations for select to authenticated
  using (
    (select auth.uid()) = from_user_id
    or (select auth.uid()) = to_user_id
  );

create policy "Recipients can update recommendation dismissal"
  on public.recommendations for update to authenticated
  using ((select auth.uid()) = to_user_id)
  with check ((select auth.uid()) = to_user_id);

create policy "Senders can delete their recommendations"
  on public.recommendations for delete to authenticated
  using ((select auth.uid()) = from_user_id);

revoke all on table public.recommendations
  from public, anon, authenticated;
grant select on table public.recommendations to authenticated;
grant update (dismissed) on table public.recommendations to authenticated;
grant delete on table public.recommendations to authenticated;


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
  select f.id, f.friend_id, p.username, p.display_name, p.avatar_url
  from public.friendships as f
  inner join public.friendships as reciprocal
    on reciprocal.user_id = f.friend_id
   and reciprocal.friend_id = f.user_id
  inner join public.profiles as p on p.id = f.friend_id
  where auth.uid() is not null
    and f.user_id = auth.uid()
    and f.friend_id <> auth.uid()
    and (
      exists (
        select 1 from public.friend_requests as fr
        where fr.status = 'accepted'
          and (
            (fr.requester_id = f.user_id and fr.recipient_id = f.friend_id)
            or (fr.requester_id = f.friend_id and fr.recipient_id = f.user_id)
          )
      )
      or exists (
        select 1 from public.invitations as i
        where i.status = 'accepted'
          and (
            (i.inviter_id = f.user_id and i.accepted_by = f.friend_id)
            or (i.inviter_id = f.friend_id and i.accepted_by = f.user_id)
          )
      )
    )
  order by f.created_at asc;
$$;

revoke all on function public.get_my_friend_profiles()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_friend_profiles() to authenticated;


-- Identifier/IP hashes are domain-separated and peppered by the Edge Function.
-- Raw identifiers and addresses never reach this table.
create table if not exists public.extension_login_rate_events (
  id          bigint generated always as identity primary key,
  bucket_type text        not null check (bucket_type in ('identifier', 'ip')),
  bucket_hash text        not null,
  created_at  timestamptz not null default now(),
  constraint extension_login_rate_events_hash_chk
    check (bucket_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists extension_login_rate_events_lookup_idx
  on public.extension_login_rate_events
    (bucket_type, bucket_hash, created_at desc);

create index if not exists extension_login_rate_events_created_at_idx
  on public.extension_login_rate_events (created_at);

alter table public.extension_login_rate_events enable row level security;
revoke all on table public.extension_login_rate_events
  from public, anon, authenticated, service_role;

create or replace function public.consume_extension_login_rate_limit(
  p_identifier_hash text,
  p_ip_hash         text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_identifier_count integer;
  v_ip_count         integer;
begin
  if p_identifier_hash is null
     or p_identifier_hash !~ '^[0-9a-f]{64}$'
     or p_ip_hash is null
     or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_RATE_LIMIT_HASH';
  end if;

  -- Fixed lock order makes the two-bucket consume atomic and deadlock-safe.
  perform pg_advisory_xact_lock(
    hashtextextended('extension-login:identifier:' || p_identifier_hash, 27027)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('extension-login:ip:' || p_ip_hash, 27027)
  );

  -- The rate window is 15 minutes. One-hour opportunistic retention avoids a
  -- paid scheduler dependency while the created_at index keeps cleanup bounded.
  delete from public.extension_login_rate_events as e
  where e.created_at < now() - interval '1 hour';

  select count(*)::integer into v_identifier_count
  from public.extension_login_rate_events as e
  where e.bucket_type = 'identifier'
    and e.bucket_hash = p_identifier_hash
    and e.created_at > now() - interval '15 minutes';

  select count(*)::integer into v_ip_count
  from public.extension_login_rate_events as e
  where e.bucket_type = 'ip'
    and e.bucket_hash = p_ip_hash
    and e.created_at > now() - interval '15 minutes';

  if v_identifier_count >= 10 or v_ip_count >= 30 then
    return 'RATE_LIMITED';
  end if;

  -- Only allowed attempts consume rows, bounding each active identifier/IP
  -- bucket even if a caller continues retrying after exhaustion.
  insert into public.extension_login_rate_events (bucket_type, bucket_hash)
  values
    ('identifier', p_identifier_hash),
    ('ip', p_ip_hash);

  return 'ALLOWED';
end;
$$;

revoke all on function public.consume_extension_login_rate_limit(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_extension_login_rate_limit(text, text)
  to service_role;


-- Authenticated, per-user title-resolution limiter for the resolver Edge
-- Function. The Edge Function must call this RPC with the end user's JWT so
-- auth.uid() remains authoritative. It permits 60 resolutions per rolling
-- hour and stores no title/query metadata.
create table if not exists public.title_resolution_rate_events (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null
    references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists title_resolution_rate_events_lookup_idx
  on public.title_resolution_rate_events (user_id, created_at desc);

create index if not exists title_resolution_rate_events_created_at_idx
  on public.title_resolution_rate_events (created_at);

alter table public.title_resolution_rate_events enable row level security;
revoke all on table public.title_resolution_rate_events
  from public, anon, authenticated, service_role;

create or replace function public.consume_title_resolution_rate_limit()
returns text
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
    raise exception 'AUTH_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('title-resolution:' || v_caller::text, 27027)
  );

  -- Two-hour opportunistic retention covers the rolling one-hour window and
  -- bounds free-plan storage without requiring pg_cron.
  delete from public.title_resolution_rate_events as e
  where e.created_at < now() - interval '2 hours';

  select count(*)::integer into v_count
  from public.title_resolution_rate_events as e
  where e.user_id = v_caller
    and e.created_at > now() - interval '1 hour';

  if v_count >= 60 then
    return 'RATE_LIMITED';
  end if;

  insert into public.title_resolution_rate_events (user_id)
  values (v_caller);

  return 'ALLOWED';
end;
$$;

revoke all on function public.consume_title_resolution_rate_limit()
  from public, anon, authenticated, service_role;
grant execute on function public.consume_title_resolution_rate_limit()
  to authenticated;


-- ============================================================
-- Verification SQL (disposable/test environment only)
-- ============================================================

-- 27a. Confirm authenticated has SELECT, DELETE, and UPDATE only on dismissed;
-- no browser role has INSERT. Inspect information_schema.table_privileges and
-- information_schema.column_privileges for public.recommendations.
-- select grantee, privilege_type
-- from information_schema.table_privileges
-- where table_schema = 'public' and table_name = 'recommendations'
--   and grantee in ('PUBLIC', 'anon', 'authenticated')
-- order by grantee, privilege_type;
-- select grantee, privilege_type, column_name
-- from information_schema.column_privileges
-- where table_schema = 'public' and table_name = 'recommendations'
--   and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE')
-- order by privilege_type, column_name;
-- Expected: authenticated table SELECT/DELETE; UPDATE only dismissed; no INSERT.

-- 27b. has_function_privilege checks: authenticated can send and use both
-- undo overloads; anon cannot. Only service_role can execute
-- consume_extension_login_rate_limit(text,text). Only authenticated can
-- execute consume_title_resolution_rate_limit().
-- select
--   has_function_privilege(
--     'authenticated',
--     'public.send_title_recommendation(uuid[],integer,text,text,text,text,text[],text)',
--     'EXECUTE'
--   ) as authenticated_can_send,
--   has_function_privilege(
--     'anon',
--     'public.send_title_recommendation(uuid[],integer,text,text,text,text,text[],text)',
--     'EXECUTE'
--   ) as anon_can_send,
--   has_function_privilege(
--     'authenticated', 'public.undo_title_recommendation(uuid[])', 'EXECUTE'
--   ) as authenticated_can_undo,
--   has_function_privilege(
--     'authenticated',
--     'public.consume_extension_login_rate_limit(text,text)',
--     'EXECUTE'
--   ) as authenticated_can_consume_login_limit,
--   has_function_privilege(
--     'service_role',
--     'public.consume_extension_login_rate_limit(text,text)',
--     'EXECUTE'
--   ) as service_can_consume_login_limit,
--   has_function_privilege(
--     'authenticated',
--     'public.consume_title_resolution_rate_limit()',
--     'EXECUTE'
--   ) as authenticated_can_consume_title_limit,
--   has_function_privilege(
--     'anon',
--     'public.consume_title_resolution_rate_limit()',
--     'EXECUTE'
--   ) as anon_can_consume_title_limit;
-- Expected: true, false, true, false, true, true, false.

-- 27c. Reject NULL/empty/21-recipient batches, duplicate/NULL/self recipients,
-- invalid media/tmdb/text/URL/array inputs, and anonymous callers.
-- A non-NULL thumbnail must match exactly:
-- https://image.tmdb.org/t/p/w500/<1-200 resolver-safe filename characters>.
-- Reject alternate hosts, schemes, sizes, query strings, nested paths, and
-- percent-encoded path material.

-- 27d. Submit two recipients with one unauthorized. Expect
-- RECIPIENT_NOT_AUTHORIZED and zero writes/trigger side effects for both.

-- 27e. Race send with Migration 024 remove_friend on one pair. Confirm one
-- waits on the shared pair advisory lock and no one-sided relationship sends.

-- 27f. First send => SENT with recommendation_id; retry => ALREADY_ACTIVE
-- with NULL recommendation_id; recipient dismiss then retry => REACTIVATED
-- with NULL recommendation_id. A reverse-direction row does not block sending.
-- Confirm source_name is server-derived from sender display_name/@username.

-- 27g. Undo one or more SENT UUIDs within five minutes: every row returns
-- UNDONE and all rows are deleted. Repeat with a mixed batch containing one
-- expired/dismissed/unknown/other-sender UUID: every requested UUID returns
-- UNDO_UNAVAILABLE and none of the recommendations are deleted. Direct
-- undo-table reads fail.

-- 27h. get_my_friend_profiles excludes self edges, one-sided pairs, and pairs
-- without accepted request/invitation evidence.
-- select * from public.get_my_friend_profiles();
-- Expected: each row has reciprocal friendships, friend_user_id <> auth.uid(),
-- and accepted friend_requests or invitations evidence for the same pair.

-- 27i. As service_role, an identifier is allowed 10 attempts/15m and an IP
-- 30 attempts/15m. Exhausting either returns RATE_LIMITED. Both event rows are
-- consumed atomically. Stored values are SHA-256, never raw input.
-- select public.consume_extension_login_rate_limit(
--   repeat('a', 64), repeat('b', 64)
-- );
-- Expected for a fresh fixture: ALLOWED and exactly one identifier plus one IP
-- event. Exhausted calls add no rows. Insert synthetic rows older than one hour,
-- call again, and confirm opportunistic cleanup removes them using the
-- extension_login_rate_events_created_at_idx index.

-- 27j. As authenticated, call consume_title_resolution_rate_limit() 61 times
-- in a fresh fixture. Expected: calls 1-60 return ALLOWED, call 61 returns
-- RATE_LIMITED, and the rejected call adds no event. anon execution and direct
-- API-role table reads/writes are denied. Synthetic rows older than two hours
-- are removed on the next call through title_resolution_rate_events_created_at_idx.

-- 27k. Re-run the migration in the same disposable environment. Expected:
-- no duplicate-policy failure; exactly one
-- "Recipients can update recommendation dismissal" policy remains.

-- 27l. Run Supabase Security and Performance Advisors after test application;
-- resolve or disposition every new function, RLS, ACL, and index warning.

-- 27m. As authenticated users, verify successful SENT/REACTIVATED results
-- consume one recommendation_send_rate_events row per recipient, while
-- ALREADY_ACTIVE consumes none. Expect RATE_LIMITED above 100 activations per
-- sender/24h or 10 activations per sender-recipient pair/24h, with no partial
-- recommendation writes from a rejected batch. Direct API-role access to the
-- event table must remain denied.
