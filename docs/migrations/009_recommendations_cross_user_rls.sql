-- ============================================================
-- Migration 009 — Fix recommendations RLS for cross-user sends
--
-- Problem:
--   The original INSERT policy was created when recommendations were
--   self-added (from_user_id = to_user_id = current user). It may
--   include an implicit or explicit `auth.uid() = to_user_id` check
--   that blocks inserting a row where to_user_id is a different user.
--
--   Additionally, the SELECT policy only allowed the recipient
--   (to_user_id = auth.uid()) to read rows, which silently blocked
--   the sender from checking for duplicates before inserting.
--
-- Fix:
--   1. Drop and re-create the INSERT policy so it ONLY requires
--      auth.uid() = from_user_id. The sender can set to_user_id to
--      any valid profile UUID (their friend).
--   2. Drop and re-create the SELECT policy so BOTH the sender
--      (from_user_id = auth.uid()) AND the recipient
--      (to_user_id = auth.uid()) can read the row.
--      This lets the duplicate-check query in the frontend work
--      correctly for cross-user recommendations.
--   3. Leave UPDATE and DELETE policies unchanged.
--
-- Safe to re-run (DROP POLICY IF EXISTS before every CREATE POLICY).
-- ============================================================

-- ── 1. SELECT — sender and recipient can both read ────────────────────────
drop policy if exists "Recipients can view recommendations"   on public.recommendations;
drop policy if exists "Senders can view sent recommendations" on public.recommendations;

create policy "Senders and recipients can view recommendations"
  on public.recommendations for select
  using (auth.uid() = to_user_id or auth.uid() = from_user_id);


-- ── 2. INSERT — only the sender may create, with any recipient ────────────
drop policy if exists "Senders can create recommendations"  on public.recommendations;
drop policy if exists "Users can add recommendations"       on public.recommendations;

create policy "Senders can create recommendations"
  on public.recommendations for insert
  with check (auth.uid() = from_user_id);


-- ── 3. UPDATE — unchanged; keep both sender and recipient able to dismiss ─
-- (Handled by migration 004. No changes needed here.)

-- ── 4. DELETE — unchanged; sender can delete their own rows ───────────────
-- (Existing "Senders can delete their recommendations" policy is correct.)
