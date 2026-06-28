
-- ============================================================
-- Migration 016 — Authenticated invitation discovery
-- Beta 2, Phase 4.1
--
-- Allows authenticated users to discover invitations addressed
-- to their confirmed account email, even if they no longer have
-- the original invitation token.
--
-- Adds:
--   • public.list_my_pending_invitations()
--   • public.respond_to_my_invitation(uuid, text)
--
-- This migration does NOT:
--   • modify migration 015
--   • modify the invitations table or its RLS policies
--   • expose invitation emails or token hashes
--   • automatically create friendships during signup
-- ============================================================


-- ── 1. list_my_pending_invitations() ─────────────────────────
-- Returns pending, unexpired invitations addressed to the
-- authenticated user's confirmed email.
--
-- Returns only presentation-safe fields:
--   • invitation_id
--   • inviter_display_name
--   • created_at
--   • expires_at
--
-- Does not return:
--   • invitee_email
--   • token_hash
--   • inviter_id
--   • accepted_by

create or replace function public.list_my_pending_invitations()
returns table (
  invitation_id        uuid,
  inviter_display_name text,
  created_at           timestamptz,
  expires_at           timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    i.id as invitation_id,
    coalesce(
      nullif(trim(p.display_name), ''),
      'A friend'
    ) as inviter_display_name,
    i.created_at,
    i.expires_at
  from public.invitations i
  join auth.users u
    on u.id = auth.uid()
   and u.email_confirmed_at is not null
  join public.profiles p
    on p.id = i.inviter_id
  where i.status = 'pending'
    and i.expires_at > now()
    and i.invitee_email = lower(trim(u.email))
  order by i.created_at desc;
$$;


-- ── 2. respond_to_my_invitation(invitation_id, action) ───────
-- Lets an authenticated user accept or decline an invitation
-- addressed to their confirmed email without needing the raw token.
--
-- Security requirements:
--   • caller must be authenticated
--   • caller's email must be confirmed
--   • action must be accept or decline
--   • invitation must exist
--   • invitation must still be pending
--   • invitation must not be expired
--   • authenticated email must match invitee_email
--
-- Accepting creates both directed friendship rows atomically.

create or replace function public.respond_to_my_invitation(
  p_invitation_id uuid,
  p_action        text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_inv   public.invitations%rowtype;
begin
  -- Caller must be authenticated.
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Explicit NULL check is required because:
  -- NULL NOT IN (...) evaluates to NULL rather than TRUE.
  if p_action is null
     or p_action not in ('accept', 'decline') then
    raise exception 'INVALID_ACTION';
  end if;

  if p_invitation_id is null then
    raise exception 'INVITATION_NOT_FOUND';
  end if;

  -- Lock the invitation so two concurrent responses cannot
  -- process the same invitation simultaneously.
  select *
    into v_inv
  from public.invitations
  where id = p_invitation_id
  for update;

  if not found then
    raise exception 'INVITATION_NOT_FOUND';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'INVITATION_NOT_PENDING';
  end if;

  -- Use <= so the response boundary matches the discovery query,
  -- which only returns invitations where expires_at > now().
  if v_inv.expires_at <= now() then
    raise exception 'INVITATION_EXPIRED';
  end if;

  -- Obtain the authoritative, confirmed email from auth.users.
  select lower(trim(u.email))
    into v_email
  from auth.users u
  where u.id = v_uid
    and u.email_confirmed_at is not null;

  if v_email is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_email <> lower(trim(v_inv.invitee_email)) then
    raise exception 'EMAIL_MISMATCH';
  end if;


  -- ── Decline ──────────────────────────────────────────────

  if p_action = 'decline' then
    update public.invitations
       set status = 'declined',
           responded_at = now()
     where id = v_inv.id;

    return 'declined';
  end if;


  -- ── Accept ───────────────────────────────────────────────

  -- Self-invites should already be blocked during insertion,
  -- but keep this defensive validation.
  if v_inv.inviter_id = v_uid then
    raise exception 'CANNOT_ACCEPT_OWN_INVITATION';
  end if;

  -- Create both directed friendship records.
  insert into public.friendships (
    user_id,
    friend_id
  )
  values
    (v_inv.inviter_id, v_uid),
    (v_uid, v_inv.inviter_id)
  on conflict (user_id, friend_id) do nothing;

  update public.invitations
     set status = 'accepted',
         accepted_by = v_uid,
         responded_at = now()
   where id = v_inv.id;

  return 'accepted';
end;
$$;


-- ── 3. Execution grants ──────────────────────────────────────
-- Remove the default PUBLIC execution privilege and allow only
-- authenticated Supabase users to call these functions.

revoke execute
  on function public.list_my_pending_invitations()
  from public, anon;

grant execute
  on function public.list_my_pending_invitations()
  to authenticated;


revoke execute
  on function public.respond_to_my_invitation(uuid, text)
  from public, anon;

grant execute
  on function public.respond_to_my_invitation(uuid, text)
  to authenticated;

-- ============================================================
-- End Migration 016
-- ============================================================

