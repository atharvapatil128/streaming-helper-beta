-- ============================================================
-- Migration 018 — Notification preferences (server-backed)
-- Beta 2, transactional email notifications (Phase 2A)
--
-- Adds a per-user preference row that controls ONLY whether the
-- future email worker is allowed to send an email for a given
-- event type. These preferences do NOT affect:
--   • in-app recommendation notifications
--   • incoming friend-request UI
--   • notification badges / unread counts
--   • recommendation creation
--   • friend-request creation
--
-- Two initial email event types are represented:
--   • recommendation_emails_enabled
--   • friend_request_emails_enabled
-- Both default to TRUE (opt-out model for Beta 2).
--
-- Adds:
--   • public.notification_preferences (table)
--   • public.handle_new_profile_notification_prefs()  (AFTER INSERT on profiles)
--   • public.set_notification_preferences_updated_at() (BEFORE UPDATE)
--   • RLS policies (owner SELECT / INSERT / UPDATE; no DELETE)
--   • grants (authenticated only; public + anon revoked)
--   • a one-time backfill for existing profiles
--
-- This migration does NOT:
--   • create the email outbox / email_jobs table
--   • create enqueue triggers on recommendations or friend_requests
--   • create the notification email Edge Function or any Cron job
--   • modify the auth.users handle_new_user() function
--   • modify recommendations, friend_requests, friendships,
--     invitations, profiles columns, or existing profile policies
--   • modify SettingsModal, App.tsx, send-invitation, or any
--     other Edge Function / frontend / extension code
--
-- Safe to re-run: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE
-- FUNCTION, DROP TRIGGER / DROP POLICY IF EXISTS before each create,
-- and an idempotent ON CONFLICT DO NOTHING backfill.
-- ============================================================


-- ── 1. Table ─────────────────────────────────────────────────
-- One row per user. user_id is both the primary key and the FK
-- to public.profiles, so each profile has at most one preference
-- row and the row is removed automatically when the profile (and
-- therefore the auth user) is deleted.

create table if not exists public.notification_preferences (
  user_id                       uuid        primary key
                                  references public.profiles (id) on delete cascade,
  recommendation_emails_enabled boolean     not null default true,
  friend_request_emails_enabled boolean     not null default true,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);


-- ── 2. updated_at trigger ────────────────────────────────────
-- Forces updated_at to the server clock on every UPDATE. A client
-- can send any updated_at value through PostgREST; this trigger
-- overwrites it so the column is always trustworthy. created_at is
-- never touched here, so it stays at its original insert value.

create or replace function public.set_notification_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_notification_preferences_updated_at
  on public.notification_preferences;

create trigger trg_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row
  execute function public.set_notification_preferences_updated_at();


-- ── 3. New-profile auto-creation ─────────────────────────────
-- A SEPARATE trigger on public.profiles (NOT a change to the
-- existing auth.users handle_new_user function). When a profile
-- row is created, a default preference row is inserted.
--
-- ON CONFLICT DO NOTHING means: if a preference row already exists
-- for this user (e.g. created by the backfill, or a profile upsert
-- re-firing the trigger), the insert is a harmless no-op and never
-- interferes with profile creation.
--
-- SECURITY DEFINER + locked-down search_path so the insert succeeds
-- regardless of the inserting role and is not affected by RLS or a
-- malicious search_path.

create or replace function public.handle_new_profile_notification_prefs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_profiles_create_notification_prefs
  on public.profiles;

create trigger trg_profiles_create_notification_prefs
  after insert on public.profiles
  for each row
  execute function public.handle_new_profile_notification_prefs();


-- ── 4. Existing-user backfill ────────────────────────────────
-- Insert one default row for every profile that does not already
-- have one. ON CONFLICT DO NOTHING makes this safe to re-run and
-- harmless if the trigger above already created some rows.

insert into public.notification_preferences (user_id)
select p.id
from public.profiles p
on conflict (user_id) do nothing;


-- ── 5. Row Level Security ────────────────────────────────────
-- Owner-only access. A user may read, create, and update ONLY
-- their own row. No DELETE policy exists, so authenticated users
-- can never delete preference rows (rows are removed only via the
-- ON DELETE CASCADE when the profile is deleted).
--
-- The service-role email worker bypasses RLS entirely (service_role
-- is exempt), so it can continue to read every user's preferences.

alter table public.notification_preferences enable row level security;

drop policy if exists "Users can view their own notification preferences"
  on public.notification_preferences;
create policy "Users can view their own notification preferences"
  on public.notification_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own notification preferences"
  on public.notification_preferences;
create policy "Users can insert their own notification preferences"
  on public.notification_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own notification preferences"
  on public.notification_preferences;
create policy "Users can update their own notification preferences"
  on public.notification_preferences for update
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- NOTE: intentionally no DELETE policy. With RLS enabled and no
-- permissive DELETE policy, every DELETE by anon/authenticated is
-- denied. service_role still bypasses RLS for worker/admin needs.


-- ── 6. Grants ────────────────────────────────────────────────
-- Remove any inherited/default privileges first, including from
-- authenticated, then grant only the exact operations and columns
-- required by the settings UI.

revoke all on table public.notification_preferences from public;
revoke all on table public.notification_preferences from anon;
revoke all on table public.notification_preferences from authenticated;

-- Users may read their complete preference row.
grant select
  on table public.notification_preferences
  to authenticated;

-- Missing-row recovery may create only the owner ID and preference
-- values. created_at and updated_at remain server-controlled.
grant insert (
  user_id,
  recommendation_emails_enabled,
  friend_request_emails_enabled
)
  on table public.notification_preferences
  to authenticated;

-- Users may update only the two preference booleans.
grant update (
  recommendation_emails_enabled,
  friend_request_emails_enabled
)
  on table public.notification_preferences
  to authenticated;

-- ============================================================
-- Verification queries (run manually after applying; not part of
-- the migration's effect). Each is a SELECT and changes nothing.
-- ============================================================

-- 9a. Backfill coverage — both numbers should match, missing = 0.
-- select
--   (select count(*) from public.profiles)                 as profiles,
--   (select count(*) from public.notification_preferences) as prefs,
--   (select count(*)
--      from public.profiles p
--      left join public.notification_preferences np on np.user_id = p.id
--     where np.user_id is null)                             as missing;

-- 9b. Table grants — expect only authenticated with
--     SELECT / INSERT / UPDATE (no DELETE; no anon; no PUBLIC).
-- select grantee, privilege_type
-- from   information_schema.role_table_grants
-- where  table_schema = 'public'
--   and  table_name   = 'notification_preferences'
-- order  by grantee, privilege_type;

-- 9c. RLS policy names + commands — expect SELECT / INSERT / UPDATE
--     only (no DELETE row).
-- select policyname, cmd
-- from   pg_policies
-- where  schemaname = 'public'
--   and  tablename  = 'notification_preferences'
-- order  by cmd, policyname;

-- 9d. Default boolean values — both column defaults should be true.
-- select column_name, column_default
-- from   information_schema.columns
-- where  table_schema = 'public'
--   and  table_name   = 'notification_preferences'
--   and  column_name in
--          ('recommendation_emails_enabled', 'friend_request_emails_enabled')
-- order  by column_name;

-- 9e. Profile-insert trigger present.
-- select tgname
-- from   pg_trigger
-- where  tgrelid = 'public.profiles'::regclass
--   and  tgname  = 'trg_profiles_create_notification_prefs';

-- 9f. updated_at trigger present.
-- select tgname
-- from   pg_trigger
-- where  tgrelid = 'public.notification_preferences'::regclass
--   and  tgname  = 'trg_notification_preferences_updated_at';

-- ============================================================
-- End Migration 018
-- ============================================================
