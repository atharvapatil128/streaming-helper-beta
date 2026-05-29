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
// Batch-fetches recipient profiles so cards can display "Sent to [name]".
// sourceName is overwritten with the recipient's name for card display.
export async function fetchSentRecommendations(userId: string): Promise<Recommendation[]> {
  const { data, error } = await supabase
    .from('recommendations')
    .select(SELECT_COLS)
    .eq('from_user_id', userId)
    .eq('dismissed', false)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  // Batch-fetch recipient profiles for display names
  const recipientIds = [...new Set(data.map((r) => r.to_user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, email')
    .in('id', recipientIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return data.map((row) => {
    const p = profileMap.get(row.to_user_id);
    const recipientName =
      p?.display_name ?? p?.email?.split('@')[0] ?? 'Unknown';
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
    sourceName: string; // sender's own display name
  }
): Promise<Recommendation> {
  // ── 1. Check for an existing row for this exact sender → recipient pair ──
  //
  // Deduplication key: (from_user_id, to_user_id, tmdb_id, media_type).
  //
  // ALL FOUR columns are required.  Omitting from_user_id or to_user_id
  // would incorrectly block:
  //   • A user forwarding a received title to a different friend
  //     (same tmdb_id, different from_user_id)
  //   • Two different senders recommending the same title to the same person
  //     (same to_user_id + tmdb_id but different from_user_id)
  const { data: existing, error: findError } = await supabase
    .from('recommendations')
    .select(SELECT_COLS)
    .eq('from_user_id', senderId)    // must be the current sender
    .eq('to_user_id',   recipientId) // must be this specific recipient
    .eq('tmdb_id',      rec.tmdbId)
    .eq('media_type',   rec.type)
    .maybeSingle();

  if (findError) throw new Error(findError.message);

  // ── 2. Active duplicate — sender already sent this title to this friend ──
  if (existing && !existing.dismissed) {
    throw new Error("You've already recommended this title to this friend.");
  }

  // ── 3. Reverse duplicate — friend already sent this title to you ─────────
  // Key: (from_user_id = recipient, to_user_id = sender, tmdb_id, media_type).
  // Different from step 1: swapping sender/recipient in from/to blocks
  // "recommending back" to the friend who already sent you this title, while
  // still allowing the same title to a third friend (different to_user_id).
  // Only active rows; dismissed incoming recs do not block a new send.
  const { data: reverseIncoming, error: reverseError } = await supabase
    .from('recommendations')
    .select('id')
    .eq('from_user_id', recipientId)
    .eq('to_user_id',   senderId)
    .eq('tmdb_id',      rec.tmdbId)
    .eq('media_type',   rec.type)
    .eq('dismissed',    false)
    .maybeSingle();

  if (reverseError) throw new Error(reverseError.message);
  if (reverseIncoming) {
    throw new Error('This friend already recommended this title to you.');
  }

  // ── 4. Previously dismissed (same direction) — reactivate ───────────────
  if (existing && existing.dismissed) {
    const { data: updated, error: updateError } = await supabase
      .from('recommendations')
      .update({
        dismissed:     false,
        platforms:     [rec.platform],
        thumbnail_url: rec.thumbnail || null,
      })
      .eq('id', existing.id)
      .select(SELECT_COLS)
      // maybeSingle, not single — a silent RLS block returns 0 rows and
      // single() would throw PGRST116 with a confusing error message.
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) throw new Error('Could not reactivate recommendation — please try again.');
    return rowToRecommendation(updated);
  }

  // ── 5. No existing same-direction row — insert fresh ──────────────────────
  const { data, error } = await supabase
    .from('recommendations')
    .insert({
      from_user_id:  senderId,
      to_user_id:    recipientId,
      tmdb_id:       rec.tmdbId,
      media_type:    rec.type,
      title:         rec.title,
      thumbnail_url: rec.thumbnail || null,
      year:          rec.year,
      genres:        rec.genres,
      platforms:     [rec.platform],
      source_name:   rec.sourceName,
      dismissed:     false,
    })
    .select(SELECT_COLS)
    .single();

  if (error) {
    // 23505 = PostgreSQL unique_violation — the DB-level constraint fired.
    // This is a safety net for any path that bypasses the application check
    // above (e.g. a race condition or old duplicate data).
    if (error.code === '23505') {
      throw new Error("You've already recommended this title to this friend.");
    }
    throw new Error(error.message);
  }
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

export async function deleteRecommendation(id: string): Promise<void> {
  const { error } = await supabase
    .from('recommendations')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}
