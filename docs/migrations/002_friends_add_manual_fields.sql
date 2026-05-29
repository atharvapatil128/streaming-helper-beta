-- Migration 002 — friends: support manually-added friends (no linked account)
-- ============================================================
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Safe to run more than once (all ALTER statements use IF NOT EXISTS).
-- ============================================================
--
-- Context: the original friends table requires both user_id and friend_id
-- to reference existing profiles, which means you can only add someone
-- who already has an account. To support "add a friend by name/email
-- before they sign up", this migration:
--
--   1. Makes friend_id nullable — an accepted/pending row can exist
--      without a linked profile. Referential integrity is preserved when
--      friend_id IS provided; NULL means "manual entry, not yet linked".
--
--   2. Adds friend_name (the display name the user typed) and
--      friend_email (optional, for future account-linking).
--
-- Column name choice: friend_name / friend_email (not display_name / email)
-- to avoid any confusion with the profiles.display_name column and to make
-- the purpose of these columns self-evident.

-- 1. Allow friend_id to be NULL (manual friends have no linked profile yet)
alter table public.friends
  alter column friend_id drop not null;

-- 2. Add the name the user typed when adding this friend manually
alter table public.friends
  add column if not exists friend_name  text;

-- 3. Add the email the user optionally typed (for future auto-linking)
alter table public.friends
  add column if not exists friend_email text;

-- Note: the existing unique (user_id, friend_id) constraint is still valid.
-- PostgreSQL does NOT treat NULLs as equal in unique constraints, so
-- multiple rows with (user_id=X, friend_id=NULL) are all allowed.
