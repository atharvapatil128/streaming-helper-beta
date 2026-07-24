-- Minimal migration harness representing the migration-027 contract.
-- This is intentionally not the production schema; it lets CI/local Postgres
-- parse and exercise migration 028 without requiring a linked Supabase project.

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null,
  to_user_id uuid not null,
  tmdb_id integer not null,
  media_type text not null,
  title text not null,
  thumbnail_url text,
  year text,
  rating numeric,
  duration text,
  genres text[] not null default '{}',
  platforms text[] not null default '{}',
  source_name text,
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (from_user_id, to_user_id, tmdb_id, media_type)
);

create function public.send_title_recommendation(
  p_recipient_ids uuid[],
  p_tmdb_id integer,
  p_media_type text,
  p_title text,
  p_thumbnail_url text,
  p_year text,
  p_genres text[],
  p_platform text
)
returns table (
  recipient_id uuid,
  recommendation_id uuid,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient uuid;
  v_existing public.recommendations%rowtype;
begin
  foreach v_recipient in array p_recipient_ids loop
    select *
      into v_existing
      from public.recommendations
     where from_user_id = auth.uid()
       and to_user_id = v_recipient
       and tmdb_id = p_tmdb_id
       and media_type = p_media_type
     for update;

    recipient_id := v_recipient;
    recommendation_id := null;
    if found and not v_existing.dismissed then
      status := 'ALREADY_ACTIVE';
    elsif found then
      update public.recommendations
         set dismissed = false
       where id = v_existing.id;
      status := 'REACTIVATED';
    else
      insert into public.recommendations (
        from_user_id, to_user_id, tmdb_id, media_type, title,
        thumbnail_url, year, genres, platforms
      ) values (
        auth.uid(), v_recipient, p_tmdb_id, p_media_type, p_title,
        p_thumbnail_url, p_year, p_genres, array[p_platform]
      ) returning id into recommendation_id;
      status := 'SENT';
    end if;
    return next;
  end loop;
end;
$$;

grant execute on function public.send_title_recommendation(
  uuid[], integer, text, text, text, text, text[], text
) to authenticated;
