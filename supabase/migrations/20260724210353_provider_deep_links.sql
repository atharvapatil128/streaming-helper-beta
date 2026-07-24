-- Beta 2: verified Netflix/Prime references for recommendation destinations.
-- Provider data is nullable so every existing row and legacy caller keeps the
-- Search/TMDB behavior. Only canonical relative references are stored.

begin;

alter table public.recommendations
  add column provider_key text,
  add column provider_ref text;

alter table public.recommendations
  add constraint recommendations_provider_link_chk check (
    (provider_key is null and provider_ref is null)
    or (
      provider_key is not null
      and provider_ref is not null
      and (
        (
          provider_key = 'netflix'
          and provider_ref ~ '^watch/[1-9][0-9]{4,19}$'
        )
        or (
          provider_key = 'prime_video'
          and provider_ref ~ '^detail/[A-Z0-9]{10,40}$'
        )
      )
    )
  ) not valid;

alter table public.recommendations
  validate constraint recommendations_provider_link_chk;

comment on column public.recommendations.provider_key is
  'Allowlisted streaming provider key captured from the sender tab.';
comment on column public.recommendations.provider_ref is
  'Validated provider-relative catalog reference; never a complete URL.';

-- PostgreSQL cannot replace a function while changing its input signature.
-- Move the already-reviewed implementation out of the exposed public schema,
-- then put a backward-compatible public wrapper at the original RPC name.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter function public.send_title_recommendation(
  uuid[], integer, text, text, text, text, text[], text
) set schema private;

alter function private.send_title_recommendation(
  uuid[], integer, text, text, text, text, text[], text
) rename to send_title_recommendation_providerless;

revoke all on function private.send_title_recommendation_providerless(
  uuid[], integer, text, text, text, text, text[], text
) from public, anon, authenticated, service_role;

create function public.send_title_recommendation(
  p_recipient_ids uuid[],
  p_tmdb_id       integer,
  p_media_type    text,
  p_title         text,
  p_thumbnail_url text,
  p_year          text,
  p_genres        text[],
  p_platform      text,
  p_provider_key  text default null,
  p_provider_ref  text default null
)
returns table (
  recipient_id       uuid,
  recommendation_id  uuid,
  status              text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sender uuid := auth.uid();
  v_result record;
begin
  if not (
    (p_provider_key is null and p_provider_ref is null)
    or (
      p_provider_key is not null
      and p_provider_ref is not null
      and (
        (
          p_provider_key = 'netflix'
          and p_provider_ref ~ '^watch/[1-9][0-9]{4,19}$'
        )
        or (
          p_provider_key = 'prime_video'
          and p_provider_ref ~ '^detail/[A-Z0-9]{10,40}$'
        )
      )
    )
  ) then
    raise exception 'INVALID_PROVIDER_REFERENCE';
  end if;

  for v_result in
    select result.recipient_id, result.recommendation_id, result.status
    from private.send_title_recommendation_providerless(
      p_recipient_ids,
      p_tmdb_id,
      p_media_type,
      p_title,
      p_thumbnail_url,
      p_year,
      p_genres,
      p_platform
    ) as result
  loop
    if v_result.status = 'SENT' then
      update public.recommendations as rec
         set provider_key = p_provider_key,
             provider_ref = p_provider_ref
       where rec.id = v_result.recommendation_id
         and rec.from_user_id = v_sender;
    elsif v_result.status = 'REACTIVATED' and p_provider_key is not null then
      update public.recommendations as rec
         set provider_key = p_provider_key,
             provider_ref = p_provider_ref
       where rec.from_user_id = v_sender
         and rec.to_user_id = v_result.recipient_id
         and rec.tmdb_id = p_tmdb_id
         and rec.media_type = p_media_type;
    end if;

    recipient_id := v_result.recipient_id;
    recommendation_id := v_result.recommendation_id;
    status := v_result.status;
    return next;
  end loop;
end;
$$;

revoke all on function public.send_title_recommendation(
  uuid[], integer, text, text, text, text, text[], text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.send_title_recommendation(
  uuid[], integer, text, text, text, text, text[], text, text, text
) to authenticated;

comment on function public.send_title_recommendation(
  uuid[], integer, text, text, text, text, text[], text, text, text
) is
  'Sends recommendations with optional validated provider references. Legacy callers may omit the final two arguments.';

commit;

-- Verification after apply:
-- select to_regprocedure(
--   'public.send_title_recommendation(uuid[],integer,text,text,text,text,text[],text)'
-- ) as old_public_signature,
-- to_regprocedure(
--   'public.send_title_recommendation(uuid[],integer,text,text,text,text,text[],text,text,text)'
-- ) as current_public_signature;
-- Expected: old_public_signature is null; current_public_signature is present.
--
-- select has_function_privilege(
--   'authenticated',
--   'public.send_title_recommendation(uuid[],integer,text,text,text,text,text[],text,text,text)',
--   'EXECUTE'
-- ) as authenticated_can_send,
-- has_function_privilege(
--   'anon',
--   'public.send_title_recommendation(uuid[],integer,text,text,text,text,text[],text,text,text)',
--   'EXECUTE'
-- ) as anon_can_send;
-- Expected: true, false.
