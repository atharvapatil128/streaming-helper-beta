import { supabase } from './supabase';
import type { Friend } from '../types';

// ── Fetch accepted friends via the safe RPC (migration 021) ─────────────────
// get_my_friend_profiles() joins friendships → profiles server-side
// (SECURITY DEFINER) and returns only safe fields — never friend emails.
// Rows are ordered by friendship created_at ascending, matching the previous
// client-side query. The userId parameter is kept for call-site compatibility;
// the RPC scopes to auth.uid() internally.

export async function fetchFriends(_userId: string): Promise<Friend[]> {
  const { data, error } = await supabase.rpc('get_my_friend_profiles');

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id:                  row.friendship_id,
    friendUserId:        row.friend_user_id,
    name:
      row.display_name ??
      (row.username ? `@${row.username}` : null) ??
      'Streaming Helper user',
    username:            row.username ?? null,
    avatar:              row.avatar_url ?? '',
    isActive:            false,
    recommendationCount: 0,
  }));
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
