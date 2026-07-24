\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'sender@example.test',
    '{"display_name":"Sender"}',
    now()
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'recipient@example.test',
    '{"display_name":"Recipient"}',
    now()
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'second@example.test',
    '{"display_name":"Second"}',
    now()
  );

insert into public.friendships (user_id, friend_id)
values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111'),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333'),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111');

insert into public.friend_requests (
  requester_id, recipient_id, recipient_email, status, responded_at
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'recipient@example.test',
    'accepted',
    now()
  ),
  (
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333',
    'second@example.test',
    'accepted',
    now()
  );

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  false
);

do $$
declare
  v_recipient uuid := '22222222-2222-2222-2222-222222222222';
  v_second uuid := '33333333-3333-3333-3333-333333333333';
  v_row record;
  v_key text;
  v_ref text;
  v_events bigint;
  v_rows bigint;
begin
  -- Exact legacy payload (eight arguments).
  select * into v_row
  from public.send_title_recommendation(
    array[v_recipient], 100, 'movie', 'Legacy', null, '2026',
    array['Drama'], 'Netflix'
  );
  if v_row.status <> 'SENT' then
    raise exception 'legacy payload did not return SENT';
  end if;

  select provider_key, provider_ref into v_key, v_ref
  from public.recommendations where id = v_row.recommendation_id;
  if v_key is not null or v_ref is not null then
    raise exception 'legacy payload unexpectedly stored provider data';
  end if;

  -- An active retry cannot replace provider data.
  select * into v_row
  from public.send_title_recommendation(
    array[v_recipient], 100, 'movie', 'Legacy', null, '2026',
    array['Drama'], 'Netflix', 'netflix', 'watch/80117799'
  );
  if v_row.status <> 'ALREADY_ACTIVE' then
    raise exception 'active retry did not return ALREADY_ACTIVE';
  end if;
  select provider_key, provider_ref into v_key, v_ref
  from public.recommendations
  where from_user_id = auth.uid() and to_user_id = v_recipient
    and tmdb_id = 100 and media_type = 'movie';
  if v_key is not null or v_ref is not null then
    raise exception 'ALREADY_ACTIVE mutated provider data';
  end if;

  update public.recommendations set dismissed = true
  where from_user_id = auth.uid() and to_user_id = v_recipient
    and tmdb_id = 100 and media_type = 'movie';

  select * into v_row
  from public.send_title_recommendation(
    array[v_recipient], 100, 'movie', 'Legacy', null, '2026',
    array['Drama'], 'Prime Video', 'prime_video',
    'detail/0QSWZT2NXRQWO9I2EXHFU3JYF7'
  );
  if v_row.status <> 'REACTIVATED' then
    raise exception 'dismissed row did not return REACTIVATED';
  end if;
  select provider_key, provider_ref into v_key, v_ref
  from public.recommendations
  where from_user_id = auth.uid() and to_user_id = v_recipient
    and tmdb_id = 100 and media_type = 'movie';
  if v_key <> 'prime_video' or
     v_ref <> 'detail/0QSWZT2NXRQWO9I2EXHFU3JYF7' then
    raise exception 'REACTIVATED did not replace provider data';
  end if;

  select count(*), (
    select count(*) from public.recommendations
  ) into v_events, v_rows
  from public.recommendation_send_rate_events;

  begin
    perform *
    from public.send_title_recommendation(
      array[v_second], 102, 'movie', 'Invalid', null, '2026',
      array['Drama'], 'Netflix', null, 'watch/80117799'
    );
    raise exception 'partial provider pair was accepted';
  exception
    when others then
      if sqlerrm <> 'INVALID_PROVIDER_REFERENCE' then
        raise;
      end if;
  end;

  if v_events <> (select count(*) from public.recommendation_send_rate_events)
     or v_rows <> (select count(*) from public.recommendations) then
    raise exception 'invalid provider input produced side effects';
  end if;

  select * into v_row
  from public.send_title_recommendation(
    array[v_second], 103, 'series', 'Netflix title', null, '2026',
    array['Drama'], 'Netflix', 'netflix', 'watch/80117799'
  );
  if v_row.status <> 'SENT' or v_row.recommendation_id is null then
    raise exception 'valid provider send failed';
  end if;
  perform *
  from public.undo_title_recommendation(array[v_row.recommendation_id]);
  if exists (
    select 1 from public.recommendations where id = v_row.recommendation_id
  ) then
    raise exception 'fresh provider send was not undoable';
  end if;
end;
$$;

do $$
begin
  if to_regprocedure(
    'public.send_title_recommendation(uuid[],integer,text,text,text,text,text[],text)'
  ) is not null then
    raise exception 'old public overload still exists';
  end if;
  if (
    select pronargdefaults
    from pg_proc
    where oid = 'public.send_title_recommendation(uuid[],integer,text,text,text,text,text[],text,text,text)'::regprocedure
  ) <> 2 then
    raise exception 'provider arguments are not defaulted for legacy callers';
  end if;
  if has_function_privilege(
    'anon',
    'public.send_title_recommendation(uuid[],integer,text,text,text,text,text[],text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'anon can execute provider-aware RPC';
  end if;
  if has_table_privilege('authenticated', 'public.recommendations', 'INSERT') then
    raise exception 'authenticated retained direct recommendation INSERT';
  end if;
end;
$$;
