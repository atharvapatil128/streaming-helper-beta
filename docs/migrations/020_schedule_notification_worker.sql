-- ============================================================
-- Migration 020: Schedule transactional notification worker
-- ============================================================
--
-- Prerequisites:
--   1. pg_cron enabled
--   2. pg_net enabled
--   3. Vault secret: notification_worker_url
--   4. Vault secret: notification_worker_secret
--
-- The worker secret is never stored in this migration or in
-- cron.job. It is decrypted from Vault only when the job runs.
-- ============================================================

do $$
begin
  if not exists (
    select 1
    from pg_extension
    where extname = 'pg_cron'
  ) then
    raise exception 'PG_CRON_NOT_ENABLED';
  end if;

  if not exists (
    select 1
    from pg_extension
    where extname = 'pg_net'
  ) then
    raise exception 'PG_NET_NOT_ENABLED';
  end if;

  if (
    select count(*)
    from vault.secrets
    where name = 'notification_worker_url'
  ) <> 1 then
    raise exception 'NOTIFICATION_WORKER_URL_SECRET_MISSING';
  end if;

  if (
    select count(*)
    from vault.secrets
    where name = 'notification_worker_secret'
  ) <> 1 then
    raise exception 'NOTIFICATION_WORKER_SECRET_MISSING';
  end if;
end;
$$;

select cron.schedule(
  'notification-email-worker-every-minute',
  '* * * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'notification_worker_url'
        limit 1
      ),
      headers := jsonb_build_object(
        'Content-Type',
        'application/json',
        'x-notification-worker-secret',
        (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'notification_worker_secret'
          limit 1
        )
      ),
      body := jsonb_build_object(
        'source',
        'supabase-cron'
      ),
      timeout_milliseconds := 55000
    ) as request_id;
  $job$
);