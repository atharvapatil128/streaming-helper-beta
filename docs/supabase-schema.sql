-- ============================================================
-- Streaming Helper — Supabase Schema
-- ============================================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Tables use uuid primary keys tied to auth.users.
-- Row Level Security (RLS) is enabled on every table so that
-- users can only read and write their own rows.
-- ============================================================


-- ── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";


-- ── profiles ────────────────────────────────────────────────
-- One row per authenticated user, created automatically via a
-- trigger on auth.users.

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
  -- Added by later migrations (see docs/migrations/):
  --   006: email text
  --   021: username text, username_changed_at timestamptz
);

-- Auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- NOTE: Migration 006 adds profiles.email and a broad SELECT policy for friend
-- discovery. Migration 021 adds username columns and safe RPCs (additive).
-- Migration 022 removes the broad SELECT policy and tightens UPDATE grants
-- AFTER the frontend migrates to those RPCs. Apply docs/migrations/*.sql in order.


-- ── friends ─────────────────────────────────────────────────
-- Directed edge: user_id invited / connected friend_id.
-- status: 'pending' → invite sent, 'accepted' → mutual, 'paused' → hidden.
--
-- friend_id is nullable to support manually-added friends who don't yet
-- have an account. friend_name and friend_email store what the user typed.
-- See docs/migrations/002_friends_add_manual_fields.sql for the ALTER
-- statements that add these columns to an already-created table.

create table if not exists public.friends (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  friend_id    uuid          references public.profiles (id) on delete cascade,
  friend_name  text,
  friend_email text,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'paused')),
  created_at   timestamptz not null default now(),
  unique (user_id, friend_id)
);

alter table public.friends enable row level security;

create policy "Users can view their own friend rows"
  on public.friends for select
  using (auth.uid() = user_id);

create policy "Users can insert friend requests"
  on public.friends for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own friend rows"
  on public.friends for update
  using (auth.uid() = user_id);

create policy "Users can delete their own friend rows"
  on public.friends for delete
  using (auth.uid() = user_id);


-- ── recommendations ─────────────────────────────────────────
-- A title that from_user_id has shared with to_user_id.
-- tmdb_id links to The Movie Database for metadata lookups.
--
-- source_name stores the display name of whoever recommended the title
-- for quick rendering without a JOIN. For manually added recs this is
-- the friend's name the user picked; for extension-added recs (future)
-- it will be the friend's profile display_name.
-- See docs/migrations/003_recommendations_add_source_name.sql for the
-- ALTER TABLE that adds this column to an already-created table.

create table if not exists public.recommendations (
  id              uuid primary key default uuid_generate_v4(),
  from_user_id    uuid not null references public.profiles (id) on delete cascade,
  to_user_id      uuid not null references public.profiles (id) on delete cascade,
  tmdb_id         integer not null,
  media_type      text not null check (media_type in ('movie', 'series')),
  title           text not null,
  thumbnail_url   text,
  year            text,
  rating          numeric(3,1),
  duration        text,
  genres          text[] not null default '{}',
  platforms       text[] not null default '{}',
  source_name     text,
  dismissed       boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists recommendations_to_user_idx
  on public.recommendations (to_user_id, dismissed);

alter table public.recommendations enable row level security;

-- Sender and recipient can both read the recommendation row.
-- This allows the sender to check for duplicates before inserting,
-- and the recipient to see their inbox.
create policy "Senders and recipients can view recommendations"
  on public.recommendations for select
  using (auth.uid() = to_user_id or auth.uid() = from_user_id);

-- Sender can insert a recommendation to any valid recipient (friend).
-- Only from_user_id is constrained to auth.uid(); to_user_id may be any profile.
create policy "Senders can create recommendations"
  on public.recommendations for insert
  with check (auth.uid() = from_user_id);

-- Sender or recipient can dismiss / update (covers self-added recs where
-- from_user_id = to_user_id). Explicit with check prevents privilege escalation.
create policy "Users can dismiss their own recommendations"
  on public.recommendations for update
  using    (auth.uid() = to_user_id or auth.uid() = from_user_id)
  with check (auth.uid() = to_user_id or auth.uid() = from_user_id);

-- Sender can delete their own recommendations
create policy "Senders can delete their recommendations"
  on public.recommendations for delete
  using (auth.uid() = from_user_id);


-- ── comfort_titles ──────────────────────────────────────────
-- A user's personal comfort rewatch list.
-- tmdb_id is nullable to support manually-added titles.

create table if not exists public.comfort_titles (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  tmdb_id         integer,
  title           text not null,
  thumbnail_url   text,
  year            text,
  media_type      text check (media_type in ('movie', 'series')),
  is_pinned       boolean not null default false,
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists comfort_titles_user_idx
  on public.comfort_titles (user_id, is_pinned);

alter table public.comfort_titles enable row level security;

create policy "Users can view their own comfort titles"
  on public.comfort_titles for select
  using (auth.uid() = user_id);

create policy "Users can insert comfort titles"
  on public.comfort_titles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own comfort titles"
  on public.comfort_titles for update
  using (auth.uid() = user_id);

create policy "Users can delete their own comfort titles"
  on public.comfort_titles for delete
  using (auth.uid() = user_id);


-- ── connected_services ──────────────────────────────────────
-- Which streaming services a user has connected.
-- access_token_enc stores an encrypted token (encrypt before insert;
-- never store plaintext tokens in this column).

create table if not exists public.connected_services (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  service_name      text not null,
  service_icon      text,
  is_connected      boolean not null default false,
  access_token_enc  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, service_name)
);

alter table public.connected_services enable row level security;

create policy "Users can view their own connected services"
  on public.connected_services for select
  using (auth.uid() = user_id);

create policy "Users can insert connected services"
  on public.connected_services for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own connected services"
  on public.connected_services for update
  using    (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own connected services"
  on public.connected_services for delete
  using (auth.uid() = user_id);


-- ── events ──────────────────────────────────────────────────
-- Append-only activity log for friend requests, new recommendations,
-- and other notifications. payload is free-form JSON.
-- type examples: 'friend_request', 'recommendation_added', 'service_connected'

create table if not exists public.events (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists events_user_created_idx
  on public.events (user_id, created_at desc);

alter table public.events enable row level security;

create policy "Users can view their own events"
  on public.events for select
  using (auth.uid() = user_id);

create policy "Users can insert their own events"
  on public.events for insert
  with check (auth.uid() = user_id);

-- Events are append-only: no update or delete policies.


-- ── Incremental migrations ───────────────────────────────────
-- This bootstrap file is not the full production schema. After running it
-- on a fresh project, apply every file in docs/migrations/ in numeric order.
--
-- Identity & social graph highlights:
--   006 — profiles.email, friend_requests, friendships, friend discovery RLS
--   015–017 — email invitations (token RPCs)
--   018 — notification_preferences
--   019 — email_jobs outbox + enqueue triggers
--   020 — pg_cron schedule for notification worker
--   021 — usernames + safe RPCs (additive; keeps broad SELECT)
--   022 — profile privacy enforcement (after frontend RPC migration)
