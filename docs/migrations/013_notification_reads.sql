-- ============================================================
-- Migration 013 — notification_reads
--
-- Stores which notifications a user has explicitly marked as read.
-- Uses a stable notification_key string rather than a foreign key
-- so the table works for multiple notification types:
--
--   recommendation:<recommendation_uuid>
--   friend_request:<friend_request_uuid>    (reserved for future use)
--
-- Reading a friend request does NOT resolve it — Accept / Decline
-- actions remain independent of this table.
--
-- Safe to re-run (CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS).
-- ============================================================

create table if not exists public.notification_reads (
  id               uuid        primary key default uuid_generate_v4(),
  user_id          uuid        not null references public.profiles (id) on delete cascade,
  notification_key text        not null,
  read_at          timestamptz not null default now(),
  unique (user_id, notification_key)
);

create index if not exists notification_reads_user_idx
  on public.notification_reads (user_id);

alter table public.notification_reads enable row level security;

drop policy if exists "Users can view their own notification reads"   on public.notification_reads;
drop policy if exists "Users can insert their own notification reads" on public.notification_reads;
drop policy if exists "Users can update their own notification reads" on public.notification_reads;

create policy "Users can view their own notification reads"
  on public.notification_reads for select
  using (auth.uid() = user_id);

create policy "Users can insert their own notification reads"
  on public.notification_reads for insert
  with check (auth.uid() = user_id);

-- UPDATE is needed by upsert when a row already exists
create policy "Users can update their own notification reads"
  on public.notification_reads for update
  using    (auth.uid() = user_id)
  with check (auth.uid() = user_id);
