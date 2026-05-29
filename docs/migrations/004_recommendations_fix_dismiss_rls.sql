-- Migration 004 — recommendations: fix dismiss RLS so updates persist
-- ============================================================
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Safe to run more than once (uses DROP IF EXISTS + CREATE).
-- ============================================================
--
-- Problem: the original UPDATE policy only had a `using` clause.
-- In PostgreSQL, when `with check` is omitted on an UPDATE policy it
-- defaults to the same expression as `using` — applied to the NEW row.
-- This is correct in theory, but for self-added recommendations where
-- from_user_id = to_user_id, some Supabase versions silently block the
-- update and return { data: null, error: null } with 0 rows affected.
--
-- Fix: drop the original policy and replace it with one that explicitly
-- covers both the recipient (to_user_id) AND the sender (from_user_id)
-- for the dismissed flag, with an explicit `with check` that only
-- validates the user identity columns (not the dismissed value itself).

-- 1. Drop the original policy
drop policy if exists "Recipients can dismiss recommendations" on public.recommendations;

-- 2. Re-create with explicit `with check` and also allow the sender
--    to dismiss/update (covers self-added recs where both IDs are the
--    current user).
create policy "Users can dismiss their own recommendations"
  on public.recommendations for update
  using    (auth.uid() = to_user_id or auth.uid() = from_user_id)
  with check (auth.uid() = to_user_id or auth.uid() = from_user_id);
