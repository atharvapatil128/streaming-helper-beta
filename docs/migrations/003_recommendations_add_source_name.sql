-- Migration 003 — recommendations: add source_name for display
-- ============================================================
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Safe to run more than once (uses IF NOT EXISTS).
-- ============================================================
--
-- Context: from_user_id references a profiles row (an authenticated user).
-- When a recommendation is added manually via the dashboard (before the
-- Chrome extension is built), the recommending friend likely has no Supabase
-- account, so we cannot use from_user_id to look up their name.
--
-- source_name stores the display name of whoever recommended the title.
-- For manual adds: source_name = the friend's name the user picked.
-- For extension-added recs (future): source_name = friend's profile display_name.

alter table public.recommendations
  add column if not exists source_name text;
