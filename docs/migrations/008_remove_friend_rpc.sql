-- ============================================================
-- Migration 008 — remove_friend RPC
--
-- Replaces the two-step client-side DELETE with a single
-- SECURITY DEFINER function so both friendship rows are deleted
-- atomically, bypassing RLS edge-cases entirely.
--
-- Safe to re-run (CREATE OR REPLACE).
-- ============================================================

create or replace function public.remove_friend(target_friend_id uuid)
returns integer           -- number of rows deleted (0, 1, or 2)
language plpgsql
security definer
set search_path = public  -- prevent search_path injection
as $$
declare
  caller uuid := auth.uid();
  deleted_count integer;
begin
  -- Guard: caller must be authenticated
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  -- Guard: cannot "unfriend" yourself
  if caller = target_friend_id then
    raise exception 'Invalid target';
  end if;

  -- Delete both directed edges in one statement.
  -- Only rows that actually belong to this friendship pair are touched.
  delete from public.friendships
  where (user_id = caller        and friend_id = target_friend_id)
     or (user_id = target_friend_id and friend_id = caller);

  get diagnostics deleted_count = row_count;

  return deleted_count;
end;
$$;

-- Revoke public execute and grant only to authenticated users.
revoke execute on function public.remove_friend(uuid) from public;
grant  execute on function public.remove_friend(uuid) to authenticated;
