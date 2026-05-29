-- ============================================================
-- Migration 012 — Correct unique constraint on recommendations
--
-- PROBLEM
-- -------
-- The recommendations table had no DB-level unique constraint.
-- Duplicate prevention lived entirely in application code, which
-- meant any data inserted before the Phase-15 direction refactor
-- (from_user_id / to_user_id were swapped in old code) could leave
-- orphan rows that the duplicate check could silently miss, and
-- any constraint-violation error from an unrelated index surfaced
-- as a raw Postgres error string instead of a friendly message.
--
-- FIX
-- ---
-- 1. Remove any exact duplicate rows (same sender, receiver, title,
--    type) keeping the most recently created one.
-- 2. Add UNIQUE(from_user_id, to_user_id, tmdb_id, media_type) so
--    the DB enforces the correct 4-column deduplication key that
--    matches the application-level check.
--
-- This constraint guarantees:
--   - Same sender → same receiver → same title: blocked (both at DB
--     and application level, with friendly error).
--   - Different sender → same receiver → same title: ALLOWED.
--   - Same sender → different receiver → same title: ALLOWED.
--   - User who received a title can still recommend it to others.
--
-- Safe to re-run (uses IF NOT EXISTS / IF EXISTS guards).
-- ============================================================

-- ── 1. Remove exact duplicates, keeping the newest row ────────────────────
-- "Exact duplicate" = same (from_user_id, to_user_id, tmdb_id, media_type).
-- We keep the row with the greatest created_at; all older sibling rows are
-- deleted.  This step is safe even if no duplicates exist.
DELETE FROM public.recommendations
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY from_user_id, to_user_id, tmdb_id, media_type
        ORDER BY created_at DESC   -- keep newest
      ) AS rn
    FROM public.recommendations
  ) ranked
  WHERE rn > 1
);

-- ── 2. Add the unique constraint ──────────────────────────────────────────
-- Using DO $$ ... $$ to make it idempotent (no CREATE CONSTRAINT IF NOT EXISTS
-- syntax in older Postgres versions).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname   = 'unique_recommendation_per_pair'
    AND    conrelid  = 'public.recommendations'::regclass
  ) THEN
    ALTER TABLE public.recommendations
      ADD CONSTRAINT unique_recommendation_per_pair
      UNIQUE (from_user_id, to_user_id, tmdb_id, media_type);
  END IF;
END;
$$;
