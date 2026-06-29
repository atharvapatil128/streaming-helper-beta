-- ============================================================
-- Migration 019 — Durable email outbox (transactional)
-- Beta 2, transactional email notifications (Phase 2B)
--
-- Adds a database-side outbox that turns two source actions into
-- durable email jobs, plus the service-role-only RPCs a future
-- worker will use to claim and resolve those jobs. NO email is
-- sent here and NO Edge Function / Cron job is created.
--
-- Source actions covered (INSERT only):
--   • public.recommendations  → 'recommendation_received'
--   • public.friend_requests  → 'friend_request_received'
--
-- Adds:
--   • public.email_jobs (table + constraints + indexes)
--   • public.set_email_jobs_updated_at()         (BEFORE UPDATE)
--   • public.enqueue_recommendation_email()      (AFTER INSERT recs)
--   • public.enqueue_friend_request_email()      (AFTER INSERT reqs)
--   • public.claim_email_jobs(text, integer)
--   • public.mark_email_job_sent(uuid, text, text)
--   • public.mark_email_job_skipped(uuid, text, text)
--   • public.mark_email_job_retryable(uuid, text, text, integer)
--   • public.mark_email_job_failed(uuid, text, text)
--   • public.evaluate_email_job_rate_limit(uuid)
--   • public.normalize_email_job_code(text, text)  (private helper)
--   • RLS (enabled, NO user-facing policies)
--   • grants (service_role only; public/anon/authenticated revoked)
--
-- This migration does NOT:
--   • call Resend or create any Edge Function / Cron job
--   • create an AFTER UPDATE email trigger (reactivation must NOT
--     enqueue a second email)
--   • enqueue historical rows — only NEW inserts create jobs
--   • modify migration 018 / notification_preferences
--   • modify recommendations or friend_requests columns, RLS,
--     constraints, or reactivation behavior
--   • modify friendships, invitations, send-invitation, the
--     frontend, SettingsModal, App.tsx, or extension code
--
-- Safe to re-run: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE
-- FUNCTION, CREATE INDEX IF NOT EXISTS, DROP TRIGGER / DROP POLICY
-- IF EXISTS before each create, and idempotent DO-blocks for
-- constraints.
-- ============================================================


-- ── 1. Table: public.email_jobs ──────────────────────────────
-- One row per (event_type, source_id) source action. source_id is
-- polymorphic (recommendations.id OR friend_requests.id) so it has
-- NO foreign key. actor/recipient DO reference profiles and cascade
-- on account deletion.

create table if not exists public.email_jobs (
  id                  uuid        primary key default gen_random_uuid(),
  event_type          text        not null,
  source_id           uuid        not null,
  actor_user_id       uuid        not null references public.profiles (id) on delete cascade,
  recipient_user_id   uuid        not null references public.profiles (id) on delete cascade,
  status              text        not null default 'pending',
  attempt_count       integer     not null default 0,
  next_attempt_at     timestamptz not null default now(),
  locked_at           timestamptz,
  locked_by           text,
  last_error_code     text,
  provider_message_id text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  sent_at             timestamptz,
  skipped_at          timestamptz,
  failed_at           timestamptz
);


-- ── 2. Allowed values + constraints ──────────────────────────
-- Added via idempotent DO-blocks (no ADD CONSTRAINT IF NOT EXISTS
-- in older Postgres). Each guards on pg_constraint.

do $$
begin
  -- event_type whitelist
  if not exists (
    select 1 from pg_constraint
    where conname = 'email_jobs_event_type_chk'
      and conrelid = 'public.email_jobs'::regclass
  ) then
    alter table public.email_jobs
      add constraint email_jobs_event_type_chk
      check (event_type in ('recommendation_received', 'friend_request_received'));
  end if;

  -- status whitelist
  if not exists (
    select 1 from pg_constraint
    where conname = 'email_jobs_status_chk'
      and conrelid = 'public.email_jobs'::regclass
  ) then
    alter table public.email_jobs
      add constraint email_jobs_status_chk
      check (status in ('pending', 'processing', 'sent', 'skipped', 'retryable', 'failed'));
  end if;

  -- attempt_count must be non-negative
  if not exists (
    select 1 from pg_constraint
    where conname = 'email_jobs_attempt_count_chk'
      and conrelid = 'public.email_jobs'::regclass
  ) then
    alter table public.email_jobs
      add constraint email_jobs_attempt_count_chk
      check (attempt_count >= 0);
  end if;

  -- actor and recipient must differ (no self-notification jobs)
  if not exists (
    select 1 from pg_constraint
    where conname = 'email_jobs_actor_ne_recipient_chk'
      and conrelid = 'public.email_jobs'::regclass
  ) then
    alter table public.email_jobs
      add constraint email_jobs_actor_ne_recipient_chk
      check (actor_user_id <> recipient_user_id);
  end if;

  -- one job per source action
  if not exists (
    select 1 from pg_constraint
    where conname = 'email_jobs_event_source_uniq'
      and conrelid = 'public.email_jobs'::regclass
  ) then
    alter table public.email_jobs
      add constraint email_jobs_event_source_uniq
      unique (event_type, source_id);
  end if;

  -- status-consistency: lock + completion timestamps must match status.
  -- next_attempt_at is NOT NULL (column default), so "present" for
  -- retryable is structurally guaranteed; provider_message_id is NOT
  -- required for 'sent' (an unusual provider response must still be
  -- recoverable) but sent_at IS required.
  if not exists (
    select 1 from pg_constraint
    where conname = 'email_jobs_status_consistency_chk'
      and conrelid = 'public.email_jobs'::regclass
  ) then
    alter table public.email_jobs
      add constraint email_jobs_status_consistency_chk
      check (
        case status
          when 'pending' then
            locked_at is null and locked_by is null
            and sent_at is null and skipped_at is null and failed_at is null
          when 'processing' then
            locked_at is not null and locked_by is not null
            and sent_at is null and skipped_at is null and failed_at is null
          when 'sent' then
            sent_at is not null
            and locked_at is null and locked_by is null
            and skipped_at is null and failed_at is null
          when 'skipped' then
            skipped_at is not null
            and locked_at is null and locked_by is null
            and sent_at is null and failed_at is null
          when 'failed' then
            failed_at is not null
            and locked_at is null and locked_by is null
            and sent_at is null and skipped_at is null
          when 'retryable' then
            locked_at is null and locked_by is null
            and next_attempt_at is not null
            and sent_at is null and skipped_at is null and failed_at is null
          else false
        end
      );
  end if;
end;
$$;


-- ── 3. Indexes ───────────────────────────────────────────────
-- The unique(event_type, source_id) constraint already provides a
-- backing index, so no separate (event_type, source_id) index here.

-- worker claiming (eligible status + due + FIFO tie-break)
create index if not exists email_jobs_claim_idx
  on public.email_jobs (status, next_attempt_at, created_at);

-- stale processing recovery
create index if not exists email_jobs_stale_lock_idx
  on public.email_jobs (status, locked_at);

-- actor rate-limit lookup (per actor, per event, rolling window)
create index if not exists email_jobs_actor_rate_idx
  on public.email_jobs (actor_user_id, event_type, created_at);

-- sender→recipient recommendation rate limit
create index if not exists email_jobs_actor_recipient_rate_idx
  on public.email_jobs (actor_user_id, recipient_user_id, event_type, created_at);

-- recipient lookup
create index if not exists email_jobs_recipient_idx
  on public.email_jobs (recipient_user_id, created_at);


-- ── 4. updated_at trigger ────────────────────────────────────
-- Always stamps updated_at with the server clock on UPDATE so no
-- worker can persist a false value. created_at is never touched.

create or replace function public.set_email_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_email_jobs_updated_at on public.email_jobs;
create trigger trg_email_jobs_updated_at
  before update on public.email_jobs
  for each row
  execute function public.set_email_jobs_updated_at();

-- Trigger functions run via their triggers, not by direct call.
revoke execute on function public.set_email_jobs_updated_at() from public, anon, authenticated;


-- ── 5. RLS + table grants ────────────────────────────────────
-- RLS is ENABLED with NO user-facing policies. With RLS on and no
-- permissive policy, every anon/authenticated row operation is
-- denied — ordinary clients cannot select, insert, update, delete,
-- or even learn that a job exists. service_role bypasses RLS.
--
-- Table privileges are stripped from public/anon/authenticated and
-- granted only to service_role. postgres retains owner access.

alter table public.email_jobs enable row level security;

revoke all on table public.email_jobs from public;
revoke all on table public.email_jobs from anon;
revoke all on table public.email_jobs from authenticated;

grant select, insert, update, delete on table public.email_jobs to service_role;


-- ── 6. Recommendation enqueue trigger ────────────────────────
-- AFTER INSERT only. Reactivation (dismissed true→false) is an
-- UPDATE and is intentionally NOT covered — there is no AFTER
-- UPDATE email trigger in Beta 2.
--
-- SECURITY DEFINER so the insert into the locked-down email_jobs
-- table succeeds for any authenticated inserter (web/extension/
-- direct). Fail-open: expected duplicates are absorbed by ON
-- CONFLICT; any UNEXPECTED error is caught, logged as a sanitized
-- warning, and swallowed so the recommendation insert still commits.

create or replace function public.enqueue_recommendation_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- No self-recommendation emails.
  if new.from_user_id = new.to_user_id then
    return new;
  end if;

  begin
    insert into public.email_jobs (event_type, source_id, actor_user_id, recipient_user_id)
    values ('recommendation_received', new.id, new.from_user_id, new.to_user_id)
    on conflict (event_type, source_id) do nothing;
  exception
    when others then
      -- Sanitized marker + SQLSTATE only. No emails/names/titles/IDs.
      raise warning 'EMAIL_JOB_ENQUEUE_FAILED:%', sqlstate;
  end;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_recommendation_email on public.recommendations;
create trigger trg_enqueue_recommendation_email
  after insert on public.recommendations
  for each row
  execute function public.enqueue_recommendation_email();

revoke execute on function public.enqueue_recommendation_email() from public, anon, authenticated;


-- ── 7. Friend-request enqueue trigger ────────────────────────
-- AFTER INSERT only. Skips when there is no in-app recipient
-- (recipient_id null → invite-only target) or when requester =
-- recipient. Status updates (accept/decline) never enqueue. A
-- re-sent request after a hard-DELETE cancel is a new row with a
-- new id, so it may legitimately create a new job.

create or replace function public.enqueue_friend_request_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- No account to notify, or self-request.
  if new.recipient_id is null then
    return new;
  end if;
  if new.requester_id = new.recipient_id then
    return new;
  end if;

  begin
    insert into public.email_jobs (event_type, source_id, actor_user_id, recipient_user_id)
    values ('friend_request_received', new.id, new.requester_id, new.recipient_id)
    on conflict (event_type, source_id) do nothing;
  exception
    when others then
      raise warning 'EMAIL_JOB_ENQUEUE_FAILED:%', sqlstate;
  end;

  return new;
end;
$$;

drop trigger if exists trg_enqueue_friend_request_email on public.friend_requests;
create trigger trg_enqueue_friend_request_email
  after insert on public.friend_requests
  for each row
  execute function public.enqueue_friend_request_email();

revoke execute on function public.enqueue_friend_request_email() from public, anon, authenticated;


-- ── 8. Code-normalization helper (private) ───────────────────
-- Forces every worker-supplied reason / error code into a stable,
-- bounded machine-code shape before it is ever stored. This is the
-- single guarantee that last_error_code never contains a raw provider
-- response body, an email address, a name, or arbitrary user text.
--
-- Rules:
--   • trim + uppercase
--   • allow only A–Z, 0–9, underscore, hyphen, colon
--   • replace every other character with underscore
--   • cap at 64 characters
--   • if the result is empty (blank input), return the caller's
--     stable fallback (e.g. INVALID_SKIP_REASON / RETRYABLE_ERROR /
--     FAILED / MAX_ATTEMPTS)
--
-- IMMUTABLE + no table access, so search_path = '' is safe. It is
-- only ever reached through the SECURITY DEFINER mark_* RPCs (which
-- are owned by the same role), so ordinary clients get no EXECUTE.

create or replace function public.normalize_email_job_code(
  p_input    text,
  p_fallback text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := upper(trim(coalesce(p_input, '')));
begin
  -- Collapse any unsupported character to underscore.
  v := regexp_replace(v, '[^A-Z0-9_:-]', '_', 'g');
  -- Bound the stored length.
  v := left(v, 64);
  if v is null or v = '' then
    return p_fallback;
  end if;
  return v;
end;
$$;

revoke execute on function public.normalize_email_job_code(text, text) from public, anon, authenticated;


-- ── 9. Atomic claim RPC ──────────────────────────────────────
-- Recovers stale 'processing' jobs (locked > 10 min), enforces the
-- five-attempt budget during recovery AND before claiming, then
-- atomically claims due pending/retryable jobs with FOR UPDATE SKIP
-- LOCKED so concurrent workers never collide.
--
-- Attempt-budget invariant: a job is NEVER claimed for attempt 6.
-- attempt_count is incremented at claim time, so the maximum stored
-- value after a claim is 5. Any row that already sits at
-- attempt_count >= 5 is terminal and is converted to 'failed' here
-- rather than being claimed again, and the claimable set explicitly
-- excludes attempt_count >= 5.

create or replace function public.claim_email_jobs(
  p_worker_id text,
  p_limit     integer default 10
)
returns table (
  id                uuid,
  event_type        text,
  source_id         uuid,
  actor_user_id     uuid,
  recipient_user_id uuid,
  attempt_count     integer,
  created_at        timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker text    := nullif(trim(p_worker_id), '');
  v_limit  integer := coalesce(p_limit, 10);
begin
  if v_worker is null then
    raise exception 'INVALID_WORKER_ID';
  end if;
  -- Bound the stored worker identifier.
  v_worker := left(v_worker, 128);

  -- Clamp batch size to a safe range.
  if v_limit < 1  then v_limit := 1;  end if;
  if v_limit > 25 then v_limit := 25; end if;

  -- Stale-lock recovery (budget EXHAUSTED): a crashed worker on its
  -- final attempt must not be retried — fail it permanently.
  update public.email_jobs j
     set status          = 'failed',
         failed_at       = now(),
         locked_at       = null,
         locked_by       = null,
         last_error_code = 'MAX_ATTEMPTS'
   where j.status = 'processing'
     and j.locked_at is not null
     and j.locked_at < now() - interval '10 minutes'
     and j.attempt_count >= 5;

  -- Stale-lock recovery (budget REMAINING): return the job to the
  -- queue so it can be retried.
  update public.email_jobs j
     set status          = 'retryable',
         locked_at       = null,
         locked_by       = null,
         next_attempt_at = now(),
         last_error_code = 'STALE_LOCK_RECOVERED'
   where j.status = 'processing'
     and j.locked_at is not null
     and j.locked_at < now() - interval '10 minutes'
     and j.attempt_count < 5;

  -- Defensive cap enforcement: any pending/retryable row that somehow
  -- reached the attempt budget is failed BEFORE claiming, so it can
  -- never be picked up for attempt 6.
  update public.email_jobs j
     set status          = 'failed',
         failed_at       = now(),
         locked_at       = null,
         locked_by       = null,
         last_error_code = 'MAX_ATTEMPTS'
   where j.status in ('pending', 'retryable')
     and j.attempt_count >= 5;

  -- Atomic claim. The CTE locks only the rows it selects and skips
  -- rows another worker already holds; the UPDATE flips them to
  -- 'processing' and stamps the lock in the same statement. The
  -- attempt_count < 5 guard guarantees attempt 6 is unreachable.
  return query
  with claimable as (
    select c.id
    from public.email_jobs c
    where c.status in ('pending', 'retryable')
      and c.next_attempt_at <= now()
      and c.attempt_count < 5
    order by c.next_attempt_at asc, c.created_at asc
    limit v_limit
    for update skip locked
  )
  update public.email_jobs j
     set status        = 'processing',
         attempt_count = j.attempt_count + 1,
         locked_at     = now(),
         locked_by     = v_worker
    from claimable cl
   where j.id = cl.id
  returning j.id, j.event_type, j.source_id, j.actor_user_id,
            j.recipient_user_id, j.attempt_count, j.created_at;
end;
$$;

revoke execute on function public.claim_email_jobs(text, integer) from public, anon, authenticated;
grant   execute on function public.claim_email_jobs(text, integer) to service_role;


-- ── 10. Mark sent RPC ────────────────────────────────────────

create or replace function public.mark_email_job_sent(
  p_job_id              uuid,
  p_worker_id           text,
  p_provider_message_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker text := nullif(trim(p_worker_id), '');
  v_rows   integer;
begin
  if v_worker is null then
    raise exception 'INVALID_WORKER_ID';
  end if;
  v_worker := left(v_worker, 128);

  update public.email_jobs
     set status              = 'sent',
         -- Opaque provider id: trim + bound to 255 chars, no raw body.
         provider_message_id = left(nullif(trim(coalesce(p_provider_message_id, '')), ''), 255),
         sent_at             = now(),
         locked_at           = null,
         locked_by           = null,
         last_error_code     = null
   where id = p_job_id
     and status = 'processing'
     and locked_by = v_worker;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'JOB_NOT_CLAIMED';
  end if;

  return 'sent';
end;
$$;

revoke execute on function public.mark_email_job_sent(uuid, text, text) from public, anon, authenticated;
grant   execute on function public.mark_email_job_sent(uuid, text, text) to service_role;


-- ── 11. Mark skipped RPC ─────────────────────────────────────
-- Skips are terminal. The reason is normalized to a stable machine
-- code; a blank reason falls back to INVALID_SKIP_REASON so the job
-- is still resolved (never left stuck in 'processing') and no raw
-- text is stored.

create or replace function public.mark_email_job_skipped(
  p_job_id    uuid,
  p_worker_id text,
  p_reason    text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker text := nullif(trim(p_worker_id), '');
  v_reason text;
  v_rows   integer;
begin
  if v_worker is null then
    raise exception 'INVALID_WORKER_ID';
  end if;
  v_worker := left(v_worker, 128);
  v_reason := public.normalize_email_job_code(p_reason, 'INVALID_SKIP_REASON');

  update public.email_jobs
     set status          = 'skipped',
         skipped_at      = now(),
         last_error_code = v_reason,
         locked_at       = null,
         locked_by       = null
   where id = p_job_id
     and status = 'processing'
     and locked_by = v_worker;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'JOB_NOT_CLAIMED';
  end if;

  return 'skipped';
end;
$$;

revoke execute on function public.mark_email_job_skipped(uuid, text, text) from public, anon, authenticated;
grant   execute on function public.mark_email_job_skipped(uuid, text, text) to service_role;


-- ── 12. Mark retryable RPC (with max-attempt fallthrough) ────
-- Reschedules a transient failure, or converts to 'failed' once the
-- attempt budget (5) is exhausted. Delay clamped to 60s..6h.

create or replace function public.mark_email_job_retryable(
  p_job_id              uuid,
  p_worker_id           text,
  p_error_code          text,
  p_retry_after_seconds integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker  text    := nullif(trim(p_worker_id), '');
  v_delay   integer := coalesce(p_retry_after_seconds, 60);
  v_attempt integer;
  v_result  text;
begin
  if v_worker is null then
    raise exception 'INVALID_WORKER_ID';
  end if;
  v_worker := left(v_worker, 128);

  -- Clamp retry delay to a safe range (60s .. 6h).
  if v_delay < 60    then v_delay := 60;    end if;
  if v_delay > 21600 then v_delay := 21600; end if;

  -- Lock the claimed row and read its current attempt budget.
  select attempt_count
    into v_attempt
  from public.email_jobs
  where id = p_job_id
    and status = 'processing'
    and locked_by = v_worker
  for update;

  if not found then
    raise exception 'JOB_NOT_CLAIMED';
  end if;

  if v_attempt >= 5 then
    -- Attempt budget exhausted → permanent failure, no reschedule.
    -- Preserve the provider code when present; else MAX_ATTEMPTS.
    update public.email_jobs
       set status          = 'failed',
           failed_at       = now(),
           last_error_code = public.normalize_email_job_code(p_error_code, 'MAX_ATTEMPTS'),
           locked_at       = null,
           locked_by       = null
     where id = p_job_id;
    v_result := 'failed';
  else
    update public.email_jobs
       set status          = 'retryable',
           next_attempt_at  = now() + make_interval(secs => v_delay),
           last_error_code  = public.normalize_email_job_code(p_error_code, 'RETRYABLE_ERROR'),
           locked_at        = null,
           locked_by        = null
     where id = p_job_id;
    v_result := 'retryable';
  end if;

  return v_result;
end;
$$;

revoke execute on function public.mark_email_job_retryable(uuid, text, text, integer) from public, anon, authenticated;
grant   execute on function public.mark_email_job_retryable(uuid, text, text, integer) to service_role;


-- ── 13. Mark failed RPC ──────────────────────────────────────
-- Immediate permanent failure (e.g. a validation error the worker
-- knows will never succeed).

create or replace function public.mark_email_job_failed(
  p_job_id     uuid,
  p_worker_id  text,
  p_error_code text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker text := nullif(trim(p_worker_id), '');
  v_rows   integer;
begin
  if v_worker is null then
    raise exception 'INVALID_WORKER_ID';
  end if;
  v_worker := left(v_worker, 128);

  update public.email_jobs
     set status          = 'failed',
         failed_at       = now(),
         last_error_code = public.normalize_email_job_code(p_error_code, 'FAILED'),
         locked_at       = null,
         locked_by       = null
   where id = p_job_id
     and status = 'processing'
     and locked_by = v_worker;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'JOB_NOT_CLAIMED';
  end if;

  return 'failed';
end;
$$;

revoke execute on function public.mark_email_job_failed(uuid, text, text) from public, anon, authenticated;
grant   execute on function public.mark_email_job_failed(uuid, text, text) to service_role;


-- ── 14. Rate-limit evaluation helper ─────────────────────────
-- Deterministic, burst-safe evaluation for a single claimed job.
--
-- For the job being evaluated, count EARLIER jobs by the same actor
-- (and, for recommendations, the same actor→recipient pair) in the
-- 24h window ending at THIS job's created_at. "Earlier" uses the
-- (created_at, id) tuple so identical timestamps still order
-- deterministically. Counting jobs (any status) rather than only
-- 'sent' rows means concurrent workers cannot race past the cap by
-- checking before another job reaches 'sent'.
--
-- Beta 2 limits:
--   recommendation_received: 20 / actor / 24h ; 5 / actor→recipient / 24h
--   friend_request_received: 10 / actor / 24h
--
-- Returns one of:
--   'allowed'
--   'actor_daily_limit'
--   'actor_recipient_daily_limit'
--   'unsupported_event'    (event_type not in the Beta 2 set; the
--                           worker treats this as a permanent invalid
--                           job, not an allowance)
--   'job_not_found'        (defensive; should not occur in practice)

create or replace function public.evaluate_email_job_rate_limit(
  p_job_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event        text;
  v_actor        uuid;
  v_recipient    uuid;
  v_created      timestamptz;
  v_window_start timestamptz;
  v_actor_count  integer;
  v_pair_count   integer;
begin
  select event_type, actor_user_id, recipient_user_id, created_at
    into v_event, v_actor, v_recipient, v_created
  from public.email_jobs
  where id = p_job_id;

  if not found then
    return 'job_not_found';
  end if;

  v_window_start := v_created - interval '24 hours';

  if v_event = 'recommendation_received' then
    -- Per-actor cap (20).
    select count(*)
      into v_actor_count
    from public.email_jobs j
    where j.event_type    = 'recommendation_received'
      and j.actor_user_id = v_actor
      and j.created_at   >= v_window_start
      and (j.created_at, j.id) < (v_created, p_job_id);

    if v_actor_count >= 20 then
      return 'actor_daily_limit';
    end if;

    -- Per actor→recipient cap (5).
    select count(*)
      into v_pair_count
    from public.email_jobs j
    where j.event_type        = 'recommendation_received'
      and j.actor_user_id     = v_actor
      and j.recipient_user_id = v_recipient
      and j.created_at       >= v_window_start
      and (j.created_at, j.id) < (v_created, p_job_id);

    if v_pair_count >= 5 then
      return 'actor_recipient_daily_limit';
    end if;

    return 'allowed';

  elsif v_event = 'friend_request_received' then
    -- Per-actor cap (10). No per-recipient cap for friend requests.
    select count(*)
      into v_actor_count
    from public.email_jobs j
    where j.event_type    = 'friend_request_received'
      and j.actor_user_id = v_actor
      and j.created_at   >= v_window_start
      and (j.created_at, j.id) < (v_created, p_job_id);

    if v_actor_count >= 10 then
      return 'actor_daily_limit';
    end if;

    return 'allowed';
  end if;

  -- Unknown event type — fail CLOSED. The CHECK constraint should
  -- prevent this, but if an unsupported event ever reaches here the
  -- worker must treat it as a permanently invalid job, not allow it.
  return 'unsupported_event';
end;
$$;

revoke execute on function public.evaluate_email_job_rate_limit(uuid) from public, anon, authenticated;
grant   execute on function public.evaluate_email_job_rate_limit(uuid) to service_role;


-- ============================================================
-- Verification queries (run manually after applying; SELECT-only
-- unless explicitly marked TEST-ENVIRONMENT-ONLY). None of these
-- are part of the migration's effect.
-- ============================================================

-- 17a. Table + columns exist.
-- select column_name, data_type, is_nullable, column_default
-- from   information_schema.columns
-- where  table_schema = 'public' and table_name = 'email_jobs'
-- order  by ordinal_position;

-- 17b. Constraints (expect event_type, status, attempt_count,
--      actor<>recipient, unique(event_type,source_id), status-consistency).
-- select conname, contype
-- from   pg_constraint
-- where  conrelid = 'public.email_jobs'::regclass
-- order  by conname;

-- 17c. Indexes.
-- select indexname, indexdef
-- from   pg_indexes
-- where  schemaname = 'public' and tablename = 'email_jobs'
-- order  by indexname;

-- 17d. RLS enabled (expect relrowsecurity = true).
-- select relrowsecurity, relforcerowsecurity
-- from   pg_class
-- where  oid = 'public.email_jobs'::regclass;

-- 17e. No ordinary-client table privileges (expect ONLY service_role).
-- select grantee, privilege_type
-- from   information_schema.role_table_grants
-- where  table_schema = 'public' and table_name = 'email_jobs'
-- order  by grantee, privilege_type;

-- 17f. Enqueue trigger present on recommendations (AFTER INSERT).
-- select tgname
-- from   pg_trigger
-- where  tgrelid = 'public.recommendations'::regclass
--   and  tgname  = 'trg_enqueue_recommendation_email';

-- 17g. Enqueue trigger present on friend_requests (AFTER INSERT).
-- select tgname
-- from   pg_trigger
-- where  tgrelid = 'public.friend_requests'::regclass
--   and  tgname  = 'trg_enqueue_friend_request_email';

-- 17h. NO email trigger fires on recommendation UPDATE — expect that
--      the only email enqueue trigger is INSERT-scoped. tgtype bit 0x04
--      = INSERT, 0x10 = UPDATE. This lists the trigger's events; the
--      enqueue trigger must NOT show UPDATE.
-- select t.tgname,
--        (t.tgtype & 4)  <> 0 as on_insert,
--        (t.tgtype & 16) <> 0 as on_update,
--        (t.tgtype & 8)  <> 0 as on_delete
-- from   pg_trigger t
-- where  t.tgrelid = 'public.recommendations'::regclass
--   and  not t.tgisinternal
-- order  by t.tgname;

-- 17i. Function execution grants (expect EXECUTE only for service_role
--      on the six worker RPCs; none for public/anon/authenticated).
-- select p.proname, r.rolname
-- from   pg_proc p
-- join   pg_namespace n on n.oid = p.pronamespace
-- left   join lateral aclexplode(p.proacl) a on true
-- left   join pg_roles r on r.oid = a.grantee
-- where  n.nspname = 'public'
--   and  p.proname in (
--          'claim_email_jobs','mark_email_job_sent','mark_email_job_skipped',
--          'mark_email_job_retryable','mark_email_job_failed',
--          'evaluate_email_job_rate_limit')
--   and  a.privilege_type = 'EXECUTE'
-- order  by p.proname, r.rolname;

-- 17j. unique(event_type, source_id) behavior + enqueue smoke test.
--      TEST-ENVIRONMENT-ONLY — inserts a real recommendation row.
--      Replace the UUIDs with two real, DIFFERENT profile IDs.
-- -- with src as (
-- --   insert into public.recommendations
-- --     (from_user_id, to_user_id, tmdb_id, media_type, title)
-- --   values ('<ACTOR_UUID>', '<RECIPIENT_UUID>', 999999, 'movie', 'RL Test')
-- --   returning id
-- -- )
-- -- select ej.event_type, ej.status, ej.attempt_count
-- -- from public.email_jobs ej
-- -- join src on src.id = ej.source_id;
-- -- A second identical-source insert must NOT create a second job
-- -- (ON CONFLICT DO NOTHING) — verify with:
-- -- select count(*) from public.email_jobs where source_id = '<that id>';

-- 17k. Claim behavior + transitions. TEST-ENVIRONMENT-ONLY.
-- -- select * from public.claim_email_jobs('verify-worker', 5);
-- -- -- then, for a returned <job_id>:
-- -- select public.mark_email_job_sent('<job_id>', 'verify-worker', 'resend-test-id');

-- 17l. Stale-lock recovery — CORRECTED so it never violates
--      email_jobs_status_consistency_chk. Use a FRESHLY CLAIMED
--      processing job (NOT a job that was already marked 'sent';
--      mutating a terminal 'sent' row back to 'processing' without
--      clearing sent_at would break the consistency constraint).
--      TEST-ENVIRONMENT-ONLY.
-- -- -- 1. Claim a fresh job so it is legitimately 'processing':
-- -- select * from public.claim_email_jobs('recover-test-worker', 1);
-- -- -- 2. Age THAT job's lock past the 10-minute threshold (it is a
-- -- --    valid processing row, so sent_at/skipped_at/failed_at are null):
-- -- update public.email_jobs
-- --    set locked_at = now() - interval '11 minutes'
-- --  where id = '<freshly_claimed_job_id>'
-- --    and status = 'processing';
-- -- -- 3. Re-claim; the aged row should be recovered and re-appear
-- -- --    (attempt_count incremented again) IF attempt_count < 5:
-- -- select * from public.claim_email_jobs('recover-test-worker', 5);

-- 17m. Five-attempt budget: an attempt-5 stale job becomes 'failed'
--      with MAX_ATTEMPTS (never retried). TEST-ENVIRONMENT-ONLY.
-- -- -- Force a processing row to the final attempt with a stale lock:
-- -- update public.email_jobs
-- --    set status='processing', attempt_count=5,
-- --        locked_at = now() - interval '11 minutes', locked_by='dead-worker',
-- --        sent_at=null, skipped_at=null, failed_at=null
-- --  where id = '<job_id>';
-- -- select * from public.claim_email_jobs('verify-worker', 5);  -- must NOT return it
-- -- select status, attempt_count, last_error_code, failed_at
-- --   from public.email_jobs where id = '<job_id>';
-- -- -- expect: status='failed', attempt_count=5, last_error_code='MAX_ATTEMPTS'

-- 17n. Five-attempt budget: an attempt-4 stale job becomes 'retryable'
--      and is then claimable as attempt 5 (the last allowed attempt).
--      TEST-ENVIRONMENT-ONLY.
-- -- update public.email_jobs
-- --    set status='processing', attempt_count=4,
-- --        locked_at = now() - interval '11 minutes', locked_by='dead-worker',
-- --        sent_at=null, skipped_at=null, failed_at=null
-- --  where id = '<job_id>';
-- -- select * from public.claim_email_jobs('verify-worker', 5);  -- returns it
-- -- select status, attempt_count from public.email_jobs where id = '<job_id>';
-- -- -- expect: status='processing', attempt_count=5

-- 17o. No row with attempt_count >= 5 is ever claimable. After running
--      a claim cycle, this must return zero rows.
-- select count(*) as bad_claims
-- from   public.email_jobs
-- where  status = 'processing' and attempt_count > 5;
-- -- expect bad_claims = 0 at all times (attempt 6 is unreachable).

-- 17p. Code normalization: reasons/errors are capped at 64 chars and
--      contain ONLY [A-Z0-9_:-] — never raw provider text. Mark a
--      claimed job skipped with deliberately messy input and inspect.
--      TEST-ENVIRONMENT-ONLY.
-- -- select * from public.claim_email_jobs('norm-test-worker', 1);
-- -- select public.mark_email_job_skipped(
-- --   '<claimed_job_id>', 'norm-test-worker',
-- --   '  resend said: 5xx error! <body>"junk" '||repeat('x',200));
-- -- select last_error_code, length(last_error_code) as len
-- --   from public.email_jobs where id = '<claimed_job_id>';
-- -- -- expect: len <= 64 and last_error_code ~ '^[A-Z0-9_:-]+$'
-- -- -- (blank input instead would store the fallback INVALID_SKIP_REASON)

-- 17q. Unsupported-event handling. SELECT-only, non-destructive:
--      directly exercise the normalizer + verify the helper's
--      unsupported branch returns 'unsupported_event'. Because the
--      CHECK constraint forbids inserting an unsupported event_type,
--      this is validated by reading the function source rather than
--      inserting a bad row:
-- select pg_get_functiondef('public.evaluate_email_job_rate_limit(uuid)'::regprocedure)
--          like '%unsupported_event%' as has_unsupported_branch;
-- -- expect has_unsupported_branch = true
-- -- (A real 'unsupported_event' return is only reachable if the event
-- --  whitelist constraint is ever relaxed; do NOT disable the CHECK in
-- --  production to test this.)

-- ============================================================
-- End Migration 019
-- ============================================================
