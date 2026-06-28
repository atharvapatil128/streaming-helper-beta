
-- ============================================================
-- Migration 017 — Revoke a sent invitation
-- Beta 2, sender-side pending email invitations (Phase A)
--
-- Lets the authenticated INVITER cancel an invitation they sent
-- while it is still pending, without exposing any invitation
-- data and without granting any direct client write access.
--
-- Adds:
--   • public.revoke_my_invitation(uuid)
--
-- This migration does NOT:
--   • modify migration 015 or 016
--   • modify the invitations table or its RLS policies
--   • add an UPDATE or DELETE policy to public.invitations
--   • alter the existing inviter SELECT policy
--   • modify recipient functions (lookup_invitation,
--     respond_invitation, list_my_pending_invitations,
--     respond_to_my_invitation)
-- ============================================================


-- ── revoke_my_invitation(invitation_id) ──────────────────────
-- Marks a pending invitation as 'revoked' on behalf of the
-- authenticated inviter who created it.
--
-- Security model:
--   • Only the authenticated inviter can revoke the row. Ownership
--     is enforced INSIDE the locked lookup (id + inviter_id), not
--     by fetching the row first and comparing afterward.
--   • Because ownership is part of the SELECT ... FOR UPDATE filter,
--     another authenticated user who happens to know an invitation
--     UUID gets INVITATION_NOT_FOUND — they never learn whether the
--     invitation exists or who it belongs to.
--   • Direct client UPDATE/DELETE on public.invitations remains
--     blocked. State transitions happen only through this
--     SECURITY DEFINER function.
--   • An expired row whose status is still 'pending' can still be
--     revoked; expiration is not a rejection reason here.
--
-- Returns the literal 'revoked'. Raises a stable error-code string
-- on any failure, matching the convention used by the recipient RPCs.

create or replace function public.revoke_my_invitation(
  p_invitation_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invitations%rowtype;
begin
  -- Caller must be authenticated.
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_invitation_id is null then
    raise exception 'INVITATION_NOT_FOUND';
  end if;

  -- Ownership-scoped lock. The inviter_id filter is part of the lookup
  -- itself, so a row owned by someone else is indistinguishable from a
  -- row that does not exist. This also locks the row against concurrent
  -- recipient responses so the status transition is race-free.
  select *
    into v_inv
  from public.invitations
  where id = p_invitation_id
    and inviter_id = v_uid
  for update;

  if not found then
    raise exception 'INVITATION_NOT_FOUND';
  end if;

  -- Only pending invitations can be revoked. An already accepted,
  -- declined, or revoked invitation is terminal.
  if v_inv.status <> 'pending' then
    raise exception 'INVITATION_NOT_PENDING';
  end if;

  -- Note: an expired-but-still-pending row is intentionally allowed to
  -- be revoked. We do NOT check expires_at here.

  -- Defensively re-scope the UPDATE to the same id + inviter_id.
  update public.invitations
     set status       = 'revoked',
         responded_at = now()
   where id = v_inv.id
     and inviter_id = v_uid;

  return 'revoked';
end;
$$;


-- ── Execution grants ─────────────────────────────────────────
-- Remove the default PUBLIC execution privilege and allow only
-- authenticated Supabase users to call this function. postgres and
-- service_role retain their implicit ownership/superuser access.

revoke execute
  on function public.revoke_my_invitation(uuid)
  from public, anon;

grant execute
  on function public.revoke_my_invitation(uuid)
  to authenticated;

-- ============================================================
-- End Migration 017
-- ============================================================
