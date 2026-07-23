import { supabase } from './supabase';
import type { Recommendation } from '../types';

// ── Row → app type ──────────────────────────────────────────────────────────

type Row = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  tmdb_id: number;
  media_type: 'movie' | 'series';
  title: string;
  thumbnail_url: string | null;
  year: string | null;
  rating: number | null;
  duration: string | null;
  genres: string[];
  platforms: string[];
  source_name: string | null;
  dismissed: boolean;
};

function rowToRecommendation(row: Row): Recommendation {
  return {
    id:           row.id,
    fromUserId:   row.from_user_id,
    toUserId:     row.to_user_id,
    tmdbId:       row.tmdb_id,
    title:        row.title,
    type:         row.media_type,
    thumbnail:    row.thumbnail_url ?? '',
    year:         row.year,
    rating:       row.rating,
    duration:     row.duration,
    genres:       row.genres ?? [],
    platforms:    row.platforms ?? [],
    sourceName:   row.source_name ?? 'Unknown',
    dismissed:    row.dismissed,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

const SELECT_COLS =
  'id, from_user_id, to_user_id, tmdb_id, media_type, title, thumbnail_url, year, rating, duration, genres, platforms, source_name, dismissed';

export async function fetchRecommendations(userId: string): Promise<Recommendation[]> {
  const { data, error } = await supabase
    .from('recommendations')
    .select(SELECT_COLS)
    .eq('to_user_id', userId)
    .eq('dismissed', false)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToRecommendation);
}

// Fetch recommendations sent BY the current user to others.
// Recipient display names are hydrated through the safe RPC
// get_sent_recommendation_recipients_safe() (migration 021), which returns
// distinct recipient profiles for the caller's non-dismissed sent rows —
// never recipient emails. sourceName is overwritten with the recipient's
// name for card display, exactly as before.
export async function fetchSentRecommendations(userId: string): Promise<Recommendation[]> {
  const { data, error } = await supabase
    .from('recommendations')
    .select(SELECT_COLS)
    .eq('from_user_id', userId)
    .eq('dismissed', false)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  // Safe recipient hydration — profile_id keyed, no email exposure.
  // A hydration failure must not hide the sent list; fall back to the
  // generic label instead.
  const { data: recipients } = await supabase.rpc(
    'get_sent_recommendation_recipients_safe'
  );

  const profileMap = new Map((recipients ?? []).map((p) => [p.profile_id, p]));

  return data.map((row) => {
    const p = profileMap.get(row.to_user_id);
    const recipientName =
      p?.display_name ??
      (p?.username ? `@${p.username}` : null) ??
      'Streaming Helper user';
    // sourceName carries the recipient name so SuggestionCard can display
    // "Sent to [recipientName]" with the same field.
    return rowToRecommendation({ ...row, source_name: recipientName });
  });
}

export async function addRecommendation(
  senderId: string,
  recipientId: string,
  rec: {
    tmdbId: number;
    title: string;
    type: 'movie' | 'series';
    thumbnail: string;
    year: string | null;
    genres: string[];
    platform: string;
    sourceName: string; // compatibility-only; the RPC derives source_name
  }
): Promise<Recommendation> {
  const { data: results, error } = await supabase.rpc(
    'send_title_recommendation',
    {
      p_recipient_ids: [recipientId],
      p_tmdb_id: rec.tmdbId,
      p_media_type: rec.type,
      p_title: rec.title,
      p_thumbnail_url: rec.thumbnail || null,
      p_year: rec.year,
      p_genres: rec.genres,
      p_platform: rec.platform,
    }
  );

  if (error) throw new Error(error.message);

  const result = results?.[0];
  if (!result) {
    throw new Error('Could not send recommendation — please try again.');
  }
  if (result.status === 'ALREADY_ACTIVE') {
    throw new Error("You've already recommended this title to this friend.");
  }

  const { data, error: readError } = await supabase
    .from('recommendations')
    .select(SELECT_COLS)
    .eq('from_user_id', senderId)
    .eq('to_user_id', recipientId)
    .eq('tmdb_id', rec.tmdbId)
    .eq('media_type', rec.type)
    .single();

  if (readError) throw new Error(readError.message);
  return rowToRecommendation(data);
}

export async function dismissRecommendation(id: string): Promise<void> {
  // .select('id') forces Supabase to return the updated row.
  // Without it, a silent RLS block returns { data: null, error: null }
  // and we would never know the update failed.
  const { data, error } = await supabase
    .from('recommendations')
    .update({ dismissed: true })
    .eq('id', id)
    .select('id');

  if (error) throw new Error(error.message);

  // If 0 rows came back the update was silently blocked (RLS or bad id).
  if (!data || data.length === 0) {
    throw new Error('Could not dismiss recommendation — permission denied or record not found.');
  }
}

/**
 * Undo a previous dismiss — restores the recommendation to the active inbox
 * by setting dismissed back to false.
 */
export async function undoRecommendation(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('recommendations')
    .update({ dismissed: false })
    .eq('id', id)
    .select('id');

  if (error) throw new Error(error.message);

  if (!data || data.length === 0) {
    throw new Error('Could not undo dismiss — permission denied or record not found.');
  }
}

export async function deleteRecommendation(id: string): Promise<void> {
  const { error } = await supabase
    .from('recommendations')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}
