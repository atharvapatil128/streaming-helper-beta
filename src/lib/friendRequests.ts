import { supabase } from './supabase';
import type { FriendRequest } from '../types';

// ── Profile lookup ───────────────────────────────────────────────────────────
// Uses the permissive SELECT policy added in migration 006.

export async function lookupProfileByEmail(
  email: string
): Promise<{ id: string; displayName: string | null } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .ilike('email', email.trim())
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? { id: data.id, displayName: data.display_name ?? null } : null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type RequestRow = {
  id: string;
  requester_id: string;
  recipient_email: string;
  status: string;
  created_at: string;
};

function rowToRequest(
  row: RequestRow,
  requesterName?: string | null,
  requesterEmail?: string | null
): FriendRequest {
  return {
    id:             row.id,
    requesterId:    row.requester_id,
    requesterName:  requesterName ?? null,
    requesterEmail: requesterEmail ?? row.recipient_email,
    status:         row.status as 'pending' | 'accepted' | 'declined',
    createdAt:      row.created_at,
  };
}

// ── Send a request ───────────────────────────────────────────────────────────

export async function sendFriendRequest(
  requesterId: string,
  recipientEmail: string,
  recipientId: string | null
): Promise<FriendRequest> {
  const normalised = recipientEmail.toLowerCase().trim();

  // Guard: don't allow sending to yourself (ID-level — email-level is caught in the hook)
  if (recipientId && recipientId === requesterId) {
    throw new Error("You can't send a friend request to yourself.");
  }

  // Guard: already friends?
  if (recipientId) {
    const { data: friendship } = await supabase
      .from('friendships')
      .select('id')
      .eq('user_id', requesterId)
      .eq('friend_id', recipientId)
      .maybeSingle();

    if (friendship) throw new Error('You are already friends with this person.');
  }

  // Guard: pending request already exists to this email?
  // This is the authoritative DB check — the hook's local-state check is just
  // a fast path to avoid the round-trip in the common case.
  const { data: pendingRow } = await supabase
    .from('friend_requests')
    .select('id')
    .eq('requester_id', requesterId)
    .ilike('recipient_email', normalised)
    .eq('status', 'pending')
    .maybeSingle();

  if (pendingRow) {
    throw new Error('Friend request already sent.');
  }

  const { data, error } = await supabase
    .from('friend_requests')
    .insert({
      requester_id:    requesterId,
      recipient_id:    recipientId,
      recipient_email: normalised,
      status:          'pending',
    })
    .select('id, requester_id, recipient_email, status, created_at')
    .single();

  if (error) {
    // Fallback for the rare race-condition where two inserts land simultaneously
    if (error.code === '23505') {
      throw new Error('Friend request already sent.');
    }
    throw new Error(error.message);
  }

  return rowToRequest(data);
}

// ── Fetch incoming (pending) requests ────────────────────────────────────────

export async function fetchIncomingRequests(userId: string): Promise<FriendRequest[]> {
  const { data: rows, error } = await supabase
    .from('friend_requests')
    .select('id, requester_id, recipient_email, status, created_at')
    .eq('recipient_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  // Batch-fetch requester profiles so we can show a display name
  const requesterIds = rows.map((r) => r.requester_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, email')
    .in('id', requesterIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  return rows.map((row) => {
    const p = profileMap.get(row.requester_id);
    return rowToRequest(
      row,
      p?.display_name ?? p?.email?.split('@')[0] ?? null,
      p?.email ?? null
    );
  });
}

// ── Fetch outgoing (pending) requests ─────────────────────────────────────────

export async function fetchOutgoingRequests(userId: string): Promise<FriendRequest[]> {
  const { data, error } = await supabase
    .from('friend_requests')
    .select('id, requester_id, recipient_email, status, created_at')
    .eq('requester_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => rowToRequest(row, null, row.recipient_email));
}

// ── Accept ────────────────────────────────────────────────────────────────────
// 1. Mark request accepted  (RLS: recipient_id = currentUserId)
// 2. Insert both friendship rows:
//    (user=currentUser, friend=requester) — user_id = auth.uid()
//    (user=requester,   friend=currentUser) — friend_id = auth.uid(), allowed by "either party" policy

export async function acceptFriendRequest(
  requestId: string,
  requesterId: string,
  currentUserId: string
): Promise<void> {
  const { data: updated, error: updateErr } = await supabase
    .from('friend_requests')
    .update({ status: 'accepted', responded_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('recipient_id', currentUserId)
    .select('id');

  if (updateErr) throw new Error(updateErr.message);
  if (!updated || updated.length === 0) {
    throw new Error('Could not accept request — permission denied or not found.');
  }

  const { error: friendshipErr } = await supabase
    .from('friendships')
    .insert([
      { user_id: currentUserId, friend_id: requesterId },
      { user_id: requesterId,   friend_id: currentUserId },
    ]);

  if (friendshipErr) throw new Error(friendshipErr.message);
}

// ── Cancel (requester deletes their own pending request) ─────────────────────

export async function cancelFriendRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('friend_requests')
    .delete()
    .eq('id', requestId)
    .eq('status', 'pending');

  if (error) throw new Error(error.message);
}

// ── Decline ───────────────────────────────────────────────────────────────────

export async function declineFriendRequest(
  requestId: string,
  currentUserId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('friend_requests')
    .update({ status: 'declined', responded_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('recipient_id', currentUserId)
    .select('id');

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error('Could not decline request — permission denied or not found.');
  }
}
