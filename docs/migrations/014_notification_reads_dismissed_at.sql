-- ============================================================
-- Migration 014 — notification_reads: add dismissed_at
--
-- Extends the existing notification_reads table with a nullable
-- dismissed_at column. A NULL value means "not dismissed".
-- A non-null value means the user chose to hide this notification
-- from the dropdown without it affecting the underlying record
-- (recommendation stays in the dashboard; friend request stays pending).
--
-- No new RLS policies are needed — the existing UPDATE policy on
-- notification_reads already allows users to update their own rows.
--
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
-- ============================================================

alter table public.notification_reads
  add column if not exists dismissed_at timestamptz;
