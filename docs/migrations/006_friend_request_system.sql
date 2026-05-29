-- ============================================================
-- Migration 006 — Real friend-request system
-- Run every statement in order in the Supabase SQL Editor.
-- Safe to re-run: every CREATE POLICY is preceded by DROP POLICY IF EXISTS.
-- ============================================================

-- ── 1. Add email column to profiles ─────────────────────────
-- Needed so users can look each other up by email when sending
-- a friend request without querying the restricted auth.users table.

alter table public.profiles
  add column if not exists email text;

-- Update the new-user trigger to store the email going forward.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
    set email        = excluded.email,
        display_name = coalesce(excluded.display_name, public.profiles.display_name),
        avatar_url   = coalesce(excluded.avatar_url,   public.profiles.avatar_url);
  return new;
end;
$$;

-- Back-fill email for any users who signed up before this migration.
-- (This runs as service_role in the SQL Editor so it can read auth.users.)
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and p.email is null;

-- Allow any authenticated user to see all profiles so they can look up
-- friends by email. Multiple SELECT policies combine with OR in Supabase.
drop policy if exists "Authenticated users can view profiles for friend discovery"
  on public.profiles;
create policy "Authenticated users can view profiles for friend discovery"
  on public.profiles for select
  using (auth.uid() is not null);


-- ── 2. friend_requests ───────────────────────────────────────
-- One row per outgoing request. recipient_id is populated when the
-- recipient already has an account; otherwise only recipient_email is set.

create table if not exists public.friend_requests (
  id              uuid        primary key default uuid_generate_v4(),
  requester_id    uuid        not null references public.profiles (id) on delete cascade,
  recipient_id    uuid                 references public.profiles (id) on delete set null,
  recipient_email text        not null,
  status          text        not null default 'pending'
                    check (status in ('pending', 'accepted', 'declined')),
  responded_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- Prevent duplicate *pending* requests to the same email from the same requester.
-- Allows re-sending after a declined or accepted request.
create unique index if not exists friend_requests_pending_unique_idx
  on public.friend_requests (requester_id, recipient_email)
  where status = 'pending';

create index if not exists friend_requests_recipient_idx
  on public.friend_requests (recipient_id, status);

alter table public.friend_requests enable row level security;

drop policy if exists "Requesters can view their sent requests" on public.friend_requests;
create policy "Requesters can view their sent requests"
  on public.friend_requests for select
  using (auth.uid() = requester_id);

drop policy if exists "Recipients can view requests sent to them" on public.friend_requests;
create policy "Recipients can view requests sent to them"
  on public.friend_requests for select
  using (auth.uid() = recipient_id);

drop policy if exists "Requesters can create friend requests" on public.friend_requests;
create policy "Requesters can create friend requests"
  on public.friend_requests for insert
  with check (auth.uid() = requester_id);

drop policy if exists "Recipients can respond to friend requests" on public.friend_requests;
create policy "Recipients can respond to friend requests"
  on public.friend_requests for update
  using    (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

drop policy if exists "Requesters can cancel pending requests" on public.friend_requests;
create policy "Requesters can cancel pending requests"
  on public.friend_requests for delete
  using (auth.uid() = requester_id and status = 'pending');


-- ── 3. friendships ───────────────────────────────────────────
-- One row per *directed* friendship edge (two rows per friendship pair).
-- user_id = "I am friends with friend_id".
-- This makes "fetch my friends" a simple SELECT ... WHERE user_id = me.

create table if not exists public.friendships (
  id         uuid        primary key default uuid_generate_v4(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  friend_id  uuid        not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, friend_id)
);

create index if not exists friendships_user_idx
  on public.friendships (user_id);

alter table public.friendships enable row level security;

drop policy if exists "Users can view their own friendships" on public.friendships;
create policy "Users can view their own friendships"
  on public.friendships for select
  using (auth.uid() = user_id);

-- Either party can insert a row — needed so the accepting user can write
-- both directions: (me→requester) and (requester→me).
drop policy if exists "Either party can create a friendship row" on public.friendships;
create policy "Either party can create a friendship row"
  on public.friendships for insert
  with check (auth.uid() = user_id or auth.uid() = friend_id);

-- Either party can delete (unfriend from either side)
drop policy if exists "Either party can remove a friendship" on public.friendships;
create policy "Either party can remove a friendship"
  on public.friendships for delete
  using (auth.uid() = user_id or auth.uid() = friend_id);
