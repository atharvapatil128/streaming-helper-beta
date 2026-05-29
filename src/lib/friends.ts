import { supabase } from './supabase';
import type { Friend } from '../types';

// ── Fetch accepted friends from the friendships table ───────────────────────
// Two queries to avoid Supabase join syntax ambiguity:
//   1. friendships rows for this user
//   2. profiles for each friend_id

export async function fetchFriends(userId: string): Promise<Friend[]> {
  const { data: rows, error } = await supabase
    .from('friendships')
    .select('id, friend_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const friendIds = rows.map((r) => r.friend_id);

  const { data: profiles, error: profilesErr } = await supabase
    .from('profiles')
    .select('id, display_name, email, avatar_url')
    .in('id', friendIds);

  if (profilesErr) throw new Error(profilesErr.message);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return rows.map((row) => {
    const p = profileMap.get(row.friend_id);
    return {
      id:                  row.id,
      friendUserId:        row.friend_id,
      name:                p?.display_name ?? p?.email?.split('@')[0] ?? 'Friend',
      avatar:              p?.avatar_url   ?? '',
      isActive:            false,
      recommendationCount: 0,
    };
  });
}

// ── Remove a friendship (both directions) via RPC ───────────────────────────
// Uses the remove_friend(target_friend_id) Postgres function (SECURITY DEFINER)
// which deletes both directed edges in one atomic statement, bypassing any
// RLS ambiguity that caused the reverse row to survive client-side deletes.
// currentUserId is kept as a parameter so the call-site (useFriends) doesn't
// need to change; it is no longer used here because auth.uid() inside the
// function is authoritative.

export async function removeFriend(
  _currentUserId: string,
  friendUserId:   string
): Promise<void> {
  const { error } = await supabase.rpc('remove_friend', {
    target_friend_id: friendUserId,
  });

  if (error) throw new Error(error.message);
}
