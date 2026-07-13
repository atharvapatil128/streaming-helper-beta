create or replace function public.claim_username(p_username text)
returns table (username text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller           uuid := auth.uid();
  v_normalized       text;
  v_current_username text;
  v_row_count        integer;
begin
  if v_caller is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  v_normalized := public.normalize_username_input(p_username);

  if v_normalized is null then
    raise exception 'USERNAME_INVALID';
  end if;

  -- Serialize concurrent claims from the same account.
  select p.username
    into v_current_username
  from public.profiles as p
  where p.id = v_caller
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if v_current_username is not null then
    raise exception 'USERNAME_ALREADY_SET';
  end if;

  if not public.is_username_available(v_normalized) then
    raise exception 'USERNAME_UNAVAILABLE';
  end if;

  perform set_config(
    'app.username_write_token',
    'allowed',
    true
  );

  -- Qualify the table columns to avoid conflict with the output variable
  -- named "username".
  update public.profiles as p
     set username = v_normalized,
         username_changed_at = now()
   where p.id = v_caller
     and p.username is null;

  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    raise exception 'USERNAME_ALREADY_SET';
  end if;

  return query
  select v_normalized;

exception
  when unique_violation then
    raise exception 'USERNAME_UNAVAILABLE';
end;
$$;

revoke all on function public.claim_username(text)
from public, anon;

grant execute on function public.claim_username(text)
to authenticated;