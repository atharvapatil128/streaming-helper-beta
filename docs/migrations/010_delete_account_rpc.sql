-- ============================================================
-- Migration 010 — delete_my_account() RPC
--
-- Deletes all public-schema rows belonging to the calling user,
-- then leaves the auth.users row in place (Beta 1 limitation).
--
-- Full auth-user deletion requires a Supabase Edge Function with
-- the service_role key — see the instructions below.
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

  -- Profile last — other tables reference it
  delete from public.profiles
    where id = caller;

  -- ── Beta 1 NOTE ─────────────────────────────────────────────────────────
  -- The auth.users row is NOT deleted here.
  -- Deleting auth.users requires the service_role key which cannot be
  -- exposed on the client.  Two options for full deletion:
  --
  -- Option A — Supabase Edge Function (recommended):
  --   1. supabase/functions/delete-account/index.ts
  --      import { createClient } from '@supabase/supabase-js'
  --      const admin = createClient(
  --        Deno.env.get('SUPABASE_URL')!,
  --        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  --      )
  --      export default async (req: Request) => {
  --        const { data: { user } } = await supabase.auth.getUser(
  --          req.headers.get('Authorization')!.replace('Bearer ', '')
  --        )
  --        if (!user) return new Response('Unauthorized', { status: 401 })
  --        await admin.auth.admin.deleteUser(user.id)
  --        return new Response('OK')
  --      }
  --   2. Deploy: supabase functions deploy delete-account
  --   3. Client: await supabase.functions.invoke('delete-account')
  --
  -- Option B — Manual cleanup via Supabase Dashboard:
  --   Authentication → Users → select user → Delete
  -- ──────────────────────────────────────────────────────────────────────────
end;
$$;

-- Only authenticated users can call this function
revoke execute on function public.delete_my_account() from public;
grant  execute on function public.delete_my_account() to authenticated;
