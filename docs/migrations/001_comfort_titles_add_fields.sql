-- Migration 001 — comfort_titles: add platform, overview, source
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- Safe to run more than once (all statements use IF NOT EXISTS / IF EXISTS).

alter table public.comfort_titles
  add column if not exists platform text,
  add column if not exists overview text,
  add column if not exists source   text not null default 'pinned';

-- Back-fill existing rows so source is never null
update public.comfort_titles
set source = 'pinned'
where source is null;
