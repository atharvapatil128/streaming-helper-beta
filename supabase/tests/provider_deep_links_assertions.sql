\set ON_ERROR_STOP on

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  false
);

do $$
declare
  v_recipient uuid := '22222222-2222-2222-2222-222222222222';
  v_row record;
  v_key text;
  v_ref text;
begin
  -- Legacy eight-argument calls resolve through the defaulted parameters.
  select * into v_row
  from public.send_title_recommendation(
    array[v_recipient], 100, 'movie', 'Legacy', null, '2026',
    array['Drama'], 'Netflix'
  );
  if v_row.status <> 'SENT' then
    raise exception 'legacy call did not return SENT';
  end if;

  select provider_key, provider_ref into v_key, v_ref
  from public.recommendations where id = v_row.recommendation_id;
  if v_key is not null or v_ref is not null then
    raise exception 'legacy call unexpectedly stored provider data';
  end if;

  select * into v_row
  from public.send_title_recommendation(
    array['33333333-3333-3333-3333-333333333333'::uuid],
    101, 'series', 'Netflix title', null, '2026',
    array['Drama'], 'Netflix', 'netflix', 'watch/80117799'
  );
  select provider_key, provider_ref into v_key, v_ref
  from public.recommendations where id = v_row.recommendation_id;
  if v_key <> 'netflix' or v_ref <> 'watch/80117799' then
    raise exception 'valid Netflix reference was not stored';
  end if;

  update public.recommendations set dismissed = true
   where from_user_id = auth.uid() and to_user_id = v_recipient
     and tmdb_id = 100 and media_type = 'movie';
  perform *
  from public.send_title_recommendation(
    array[v_recipient], 100, 'movie', 'Legacy', null, '2026',
    array['Drama'], 'Netflix', 'prime_video',
    'detail/0QSWZT2NXRQWO9I2EXHFU3JYF7'
  );
  select provider_key, provider_ref into v_key, v_ref
  from public.recommendations
  where from_user_id = auth.uid() and to_user_id = v_recipient
    and tmdb_id = 100 and media_type = 'movie';
  if v_key <> 'prime_video' or v_ref <> 'detail/0QSWZT2NXRQWO9I2EXHFU3JYF7' then
    raise exception 'reactivation did not store the new reference';
  end if;

  begin
    perform *
    from public.send_title_recommendation(
      array['44444444-4444-4444-4444-444444444444'::uuid],
      102, 'movie', 'Invalid', null, '2026',
      array['Drama'], 'Netflix', 'netflix', null
    );
    raise exception 'partial provider pair was accepted';
  exception
    when others then
      if sqlerrm <> 'INVALID_PROVIDER_REFERENCE' then
        raise;
      end if;
  end;
end;
$$;

do $$
begin
  if to_regprocedure(
    'public.send_title_recommendation(uuid[],integer,text,text,text,text,text[],text)'
  ) is not null then
    raise exception 'old public overload still exists';
  end if;
  if to_regprocedure(
    'public.send_title_recommendation(uuid[],integer,text,text,text,text,text[],text,text,text)'
  ) is null then
    raise exception 'current public RPC is missing';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.send_title_recommendation(uuid[],integer,text,text,text,text,text[],text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated cannot execute current RPC';
  end if;
  if has_function_privilege(
    'anon',
    'public.send_title_recommendation(uuid[],integer,text,text,text,text,text[],text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'anon can execute current RPC';
  end if;
end;
$$;
