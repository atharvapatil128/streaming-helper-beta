-- ============================================================
-- Migration 015 — Email invitation system (Beta 2, Phase 1)
--
-- Adds the `invitations` table used to invite people who do NOT
-- yet have a Streaming Helper account. This phase is SCHEMA ONLY:
--   • table + constraints + indexes
--   • RLS (default-deny; inviter-read only)
--   • SECURITY DEFINER functions for token lookup + accept/decline
--   • a BEFORE INSERT trigger that normalizes the email and blocks
--     self-invitations
--
-- No email provider, no client write policies, and no application
-- code are touched in this migration.
--
-- Token model: the RAW token is NEVER stored. Only a SHA-256 hash
-- (`token_hash`) is persisted. The Edge Function (Phase 2) will
-- generate the random token, email it, and store only its hash.
-- The lookup/respond functions receive the raw token and hash it
-- internally to find the row — so a database leak never exposes a
-- usable invitation link.
--
-- Safe to re-run:
--   • CREATE TABLE/INDEX ... IF NOT EXISTS
--   • DROP POLICY/TRIGGER IF EXISTS before CREATE
--   • CREATE OR REPLACE FUNCTION
-- ============================================================

-- pgcrypto provides digest() for SHA-256 hashing. The functions below call
-- it as `extensions.digest(...)`, so this migration REQUIRES pgcrypto to
-- live in the `extensions` schema (the Supabase default). uuid-ossp
-- (uuid_generate_v4) is already enabled by earlier migrations.
--
-- For a brand-new install this creates pgcrypto directly in `extensions`.
-- If pgcrypto is ALREADY installed, "if not exists" makes this a no-op and
-- the WITH SCHEMA clause is ignored — it will NOT move an existing extension.
-- Verify the current location BEFORE running this migration with:
--   select e.extname, n.nspname as schema_name
--   from pg_extension e join pg_namespace n on n.oid = e.extnamespace
--   where e.extname in ('pgcrypto', 'uuid-ossp');
-- If pgcrypto reports a schema other than `extensions`, either schema-qualify
-- the digest() calls to that schema or relocate the extension manually first.
create extension if not exists pgcrypto with schema extensions;


-- ── 1. invitations table ─────────────────────────────────────
create table if not exists public.invitations (
  id            uuid        primary key default uuid_generate_v4(),
  inviter_id    uuid        not null references public.profiles (id) on delete cascade,
  invitee_email text        not null,                       -- always stored lower-cased (trigger + CHECK)
  token_hash    text        not null,                       -- SHA-256 hex of the raw token; raw token never stored
  status        text        not null default 'pending'
                  check (status in ('pending', 'accepted', 'declined', 'revoked')),
  accepted_by   uuid                 references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  expires_at    timestamptz not null default (now() + interval '14 days'),

  -- Defense-in-depth: guarantee the email is normalized regardless of insert path.
  constraint invitations_email_lowercase_chk check (invitee_email = lower(invitee_email))
);


-- ── 2. Constraints & indexes ─────────────────────────────────

-- One active pending invitation per (inviter, normalized email).
-- Allows a fresh invite after a previous one was accepted/declined/revoked.
create unique index if not exists invitations_pending_unique_idx
  on public.invitations (inviter_id, invitee_email)
  where status = 'pending';

-- IMPORTANT (Phase 2 requirement — expired-but-pending rows):
-- This partial index treats ANY row with status='pending' as occupying the
-- unique slot, INCLUDING one whose expires_at has already passed. Phase 1 has
-- no automated expiry, so a stale expired-pending row would otherwise block
-- re-inviting the same email. The Phase 2 send-invitation Edge Function MUST,
-- for a given (inviter_id, normalized invitee_email):
--   1. look up an existing pending invitation
--   2. if found AND expires_at <= now(): UPDATE it to status='revoked'
--      (responded_at = now()), THEN insert a fresh invitation
--   3. if found AND still unexpired: reuse/return it — do NOT insert and do
--      NOT resend the email (prevents duplicate sends)
--   4. if none found: insert a new invitation
-- Because step 2 flips status away from 'pending' BEFORE the new insert, the
-- partial unique index is satisfied and the new row is allowed. This works
-- with the index exactly as defined above — no index change is required.

-- Fast token-hash lookups (used by the SECURITY DEFINER functions).
create unique index if not exists invitations_token_hash_idx
  on public.invitations (token_hash);

-- Inviter dashboards ("my sent invitations") and expiry sweeps.
create index if not exists invitations_inviter_idx
  on public.invitations (inviter_id, status);


-- ── 3. Row Level Security ────────────────────────────────────
-- Default-deny: enabling RLS with no permissive policy blocks all
-- client access. We then add exactly ONE narrow SELECT policy.
alter table public.invitations enable row level security;

-- Inviters may read ONLY their own invitation rows (to show "pending
-- invitations" in the sender UI). No other client may read these rows,
-- so invitee emails are never exposed to unrelated users.
drop policy if exists "Inviters can view their own invitations" on public.invitations;
create policy "Inviters can view their own invitations"
  on public.invitations for select
  using (auth.uid() = inviter_id);

-- NOTE: there are intentionally NO client INSERT / UPDATE / DELETE
-- policies. All writes happen through the SECURITY DEFINER functions
-- below (which run as the function owner and bypass RLS) or, in Phase 2,
-- through the service-role Edge Function. This keeps token generation
-- and status transitions on the server only.


-- ── 4. Normalize + block self-invitation (BEFORE INSERT) ─────
-- Runs before constraint checks, so it both lower-cases the email and
-- rejects an invite addressed to the inviter's own email. Works on any
-- insert path (Edge Function/service-role included) because it compares
-- against the inviter_id's stored profile email rather than auth.uid().
create or replace function public.invitations_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inviter_email text;
begin
  new.invitee_email := lower(trim(new.invitee_email));

  select lower(p.email) into v_inviter_email
  from public.profiles p
  where p.id = new.inviter_id;

  if v_inviter_email is not null and v_inviter_email = new.invitee_email then
    raise exception 'CANNOT_INVITE_SELF';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_invitations_before_insert on public.invitations;
create trigger trg_invitations_before_insert
  before insert on public.invitations
  for each row execute function public.invitations_before_insert();


-- ── 5. lookup_invitation(token) ──────────────────────────────
-- Public-facing (pre-auth) read used by the invite landing page.
-- Returns ONLY the minimum needed to render the prompt: inviter display
-- name, status, and whether it has expired. Never returns invitee_email
-- or inviter_id. Returns zero rows when the token does not match.
create or replace function public.lookup_invitation(p_token text)
returns table (
  inviter_display_name text,
  status               text,
  is_expired           boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    p.display_name                  as inviter_display_name,
    i.status                        as status,
    (i.expires_at < now())          as is_expired
  from public.invitations i
  join public.profiles p on p.id = i.inviter_id
  -- Defensive token validation: NULL/blank/oversized input yields zero rows,
  -- indistinguishable from a non-matching token. Max length is generous; the
  -- exact raw-token format is finalized in Phase 2.
  where p_token is not null
    and length(btrim(p_token)) > 0
    and length(p_token) <= 512
    and i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;


-- ── 6. respond_invitation(token, action) ─────────────────────
-- Authenticated accept/decline. Requirements enforced:
--   • caller is authenticated
--   • invitation exists, is 'pending', and not expired
--   • caller's auth email matches invitee_email (case-insensitive)
--   • on accept: both directed friendship rows created atomically,
--     duplicate-safe via ON CONFLICT
--   • marks accepted (records accepted_by + responded_at) or declined
-- Returns the resulting status string. Raises a stable error code string
-- on any validation failure so the frontend can map it to UI copy.
create or replace function public.respond_invitation(p_token text, p_action text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_hash  text;
  v_inv   public.invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_action not in ('accept', 'decline') then
    raise exception 'INVALID_ACTION';
  end if;

  -- Token input validation. Malformed input (NULL/blank/oversized) is treated
  -- as a non-match so callers cannot distinguish "malformed" from "no such
  -- invitation". Max length is generous; raw-token format finalized in Phase 2.
  if p_token is null or length(btrim(p_token)) = 0 or length(p_token) > 512 then
    raise exception 'INVITATION_NOT_FOUND';
  end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  -- Lock the row so concurrent accepts cannot double-process it.
  select * into v_inv
  from public.invitations
  where token_hash = v_hash
  for update;

  if not found then
    raise exception 'INVITATION_NOT_FOUND';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'INVITATION_NOT_PENDING';
  end if;

  if v_inv.expires_at < now() then
    raise exception 'INVITATION_EXPIRED';
  end if;

  -- Authoritative email check against the auth record (not profiles).
  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_uid;

  if v_email is null or v_email <> v_inv.invitee_email then
    raise exception 'EMAIL_MISMATCH';
  end if;

  -- ── Decline ──────────────────────────────────────────────
  if p_action = 'decline' then
    update public.invitations
       set status = 'declined', responded_at = now()
     where id = v_inv.id;
    return 'declined';
  end if;

  -- ── Accept ───────────────────────────────────────────────
  -- Defensive: a self-invite should be impossible (blocked at insert),
  -- but never let someone befriend themselves.
  if v_inv.inviter_id = v_uid then
    raise exception 'CANNOT_ACCEPT_OWN_INVITATION';
  end if;

  -- Create both directed edges using the existing friendship structure.
  insert into public.friendships (user_id, friend_id)
  values (v_inv.inviter_id, v_uid),
         (v_uid,            v_inv.inviter_id)
  on conflict (user_id, friend_id) do nothing;

  update public.invitations
     set status       = 'accepted',
         accepted_by  = v_uid,
         responded_at = now()
   where id = v_inv.id;

  return 'accepted';
end;
$$;


-- ── 7. Execution grants ──────────────────────────────────────
-- lookup is safe pre-auth (you must already possess the token).
revoke all on function public.lookup_invitation(text)          from public;
grant  execute on function public.lookup_invitation(text)       to anon, authenticated;

-- respond requires an authenticated session.
revoke all on function public.respond_invitation(text, text)    from public;
grant  execute on function public.respond_invitation(text, text) to authenticated;


-- ============================================================
-- Account-deletion compatibility (informational — NOT applied here)
-- ------------------------------------------------------------
-- FK actions make the current delete flow safe WITHOUT edits:
--   • invitations.inviter_id  → profiles(id) ON DELETE CASCADE
--       The delete-account Edge Function deletes public.profiles last;
--       that cascade removes all invitations the user SENT. No FK
--       violation, no deletion failure.
--   • invitations.accepted_by → profiles(id) ON DELETE SET NULL
--       Invitations the user ACCEPTED keep their 'accepted' status but
--       have accepted_by reset to NULL. Harmless historical rows.
--
-- RECOMMENDED additive cleanup for Phase 2 (for explicitness / not
-- relying on cascade ordering) — to be added to BOTH
-- supabase/functions/delete-account/index.ts and the delete_my_account()
-- RPC, BEFORE the profiles delete step:
--
--     delete from public.invitations
--       where inviter_id = <userId> or accepted_by = <userId>;
--
-- This is purely additive and is intentionally deferred to Phase 2.
-- ============================================================
