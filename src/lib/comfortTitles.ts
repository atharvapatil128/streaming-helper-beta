import { supabase } from './supabase';
import type { ComfortTitle } from '../types';

// ── Row → app type ──────────────────────────────────────────────────────────

type Row = {
  id: string;
  tmdb_id: number | null;
  title: string;
  thumbnail_url: string | null;
  year: string | null;
  media_type: 'movie' | 'series' | null;
  is_pinned: boolean;
  platform: string | null;
  overview: string | null;
};

function rowToComfortTitle(row: Row): ComfortTitle {
  return {
    id: row.id,
    tmdbId: row.tmdb_id ?? undefined,
    title: row.title,
    type: row.media_type ?? 'movie',
    thumbnail: row.thumbnail_url ?? '',
    year: row.year ?? '',
    duration: '',          // runtime is not fetched at search time
    platform: row.platform ?? '',
    isPinned: row.is_pinned,
    overview: row.overview ?? undefined,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function fetchComfortTitles(userId: string): Promise<ComfortTitle[]> {
  const { data, error } = await supabase
    .from('comfort_titles')
    .select('id, tmdb_id, title, thumbnail_url, year, media_type, is_pinned, platform, overview')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToComfortTitle);
}

export async function addComfortTitle(
  userId: string,
  title: Omit<ComfortTitle, 'id' | 'isPinned'>
): Promise<ComfortTitle> {
  const { data, error } = await supabase
    .from('comfort_titles')
    .insert({
      user_id:       userId,
      tmdb_id:       title.tmdbId ?? null,
      title:         title.title,
      media_type:    title.type,
      thumbnail_url: title.thumbnail || null,
      year:          title.year || null,
      platform:      title.platform || null,
      overview:      title.overview || null,
      is_pinned:     false,
      source:        'pinned',
    })
    .select('id, tmdb_id, title, thumbnail_url, year, media_type, is_pinned, platform, overview')
    .single();

  if (error) throw new Error(error.message);
  return rowToComfortTitle(data);
}

export async function removeComfortTitle(id: string): Promise<void> {
  const { error } = await supabase
    .from('comfort_titles')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function pinComfortTitle(id: string): Promise<void> {
  const { error } = await supabase
    .from('comfort_titles')
    .update({ is_pinned: true })
    .eq('id', id);

  if (error) throw new Error(error.message);
}
