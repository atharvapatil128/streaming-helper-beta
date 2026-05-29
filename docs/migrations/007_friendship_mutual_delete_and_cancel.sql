-- ============================================================
-- Migration 007 — Ensure mutual-delete + cancel-request RLS
-- Run every statement in order in the Supabase SQL Editor.
-- Safe to re-run: every CREATE POLICY is preceded by DROP POLICY IF EXISTS.
-- ============================================================

-- ── 1. friendships — either party can delete both rows ───────
-- Re-create the DELETE policy so the "unfriending user" can also
-- remove the reverse row they do not own (user_id = other person).
-- The USING clause: auth.uid() = user_id  →  own row
--                   auth.uid() = friend_id →  reverse row (the other person's edge)

drop policy if exists "Either party can remove a friendship" on public.friendships;
create policy "Either party can remove a friendship"
  on public.friendships for delete
  using (auth.uid() = user_id or auth.uid() = friend_id);


-- ── 2. friend_requests — requester can cancel their own pending request ──
-- Re-create so it is guaranteed to exist even if migration 006 had
-- partial-apply issues.

drop policy if exists "Requesters can cancel pending requests" on public.friend_requests;
create policy "Requesters can cancel pending requests"
  on public.friend_requests for delete
  using (auth.uid() = requester_id and status = 'pending');
