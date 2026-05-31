-- ============================================================
-- Migration 010 — delete_my_account() RPC
--
-- Deletes all public-schema rows belonging to the calling user.
-- The auth.users row is NOT removed here — that requires the
-- service_role key and is handled by the `delete-account` Edge
-- Function (see supabase/functions/delete-account/).
--
-- This RPC is kept as a server-side fallback / convenience for
-- admin scripts. The production Delete Account flow in the app
-- goes through the Edge Function exclusively.
--
-- Safe to re-run (CREATE OR REPLACE).
-- ============================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  -- Delete in dependency order to avoid FK violations.
  -- Most tables reference profiles with ON DELETE CASCADE, but being
  -- explicit here is safer and avoids relying on cascade ordering.

  delete from public.friendships
    where user_id = caller or friend_id = caller;

  delete from public.friend_requests
    where requester_id = caller or recipient_id = caller;

  delete from public.recommendations
    where from_user_id = caller or to_user_id = caller;

  delete from public.comfort_titles
    where user_id = caller;

  delete from public.connected_services
    where user_id = caller;

  delete from public.notification_reads
    where user_id = caller;

  -- Profile last — other tables reference it
  delete from public.profiles
    where id = caller;
end;
$$;

-- Only authenticated users can call this function
revoke execute on function public.delete_my_account() from public;
grant  execute on function public.delete_my_account() to authenticated;
