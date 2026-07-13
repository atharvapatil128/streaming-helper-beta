import { supabase } from './supabase';
import { validateUsername, normalizeUsernameInput } from './usernames';
import type {
  SendFriendRequestResultRow,
  SendFriendRequestStatus,
} from './database.types';
import type { FriendRequest } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2A (Beta 2 usernames): all cross-user reads and friend-request
// creation go through the SECURITY DEFINER RPCs added in migration 021.
// Other users' email addresses are never available to this client.
//
// Direct table access below is limited to operations that stay allowed
// after migration 022:
//   • recipient accept/decline UPDATE (status, responded_at)
//   • requester cancellation DELETE
// ─────────────────────────────────────────────────────────────────────────────

// ── RPC error handling (lookup + send wrappers) ─────────────────────────────

const SEND_FAILURE_MESSAGE = 'We couldn\'t send the friend request. Please try again.';
const LOOKUP_FAILURE_MESSAGE = 'We couldn\'t complete that lookup. Please try again.';

// ── Friend identifier parsing (Add Friend) ───────────────────────────────────

export type ParsedFriendIdentifier =
  | { kind: 'username'; value: string }
  | { kind: 'email'; value: string };

/** Thrown by parseFriendIdentifier for client-side validation failures. */
export class FriendIdentifierValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FriendIdentifierValidationError';
  }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Parse a single Add Friend identifier into a username or email branch.
 *
 * Rules:
 * 1. Trim input.
 * 2. Leading `@` with no other `@` → username (strip the `@`).
 * 3. Otherwise, if input contains `@` → email.
 * 4. Otherwise → username.
 *
 * Usernames are validated via validateUsername(); emails must pass a basic
 * format check. Throws FriendIdentifierValidationError on invalid input.
 */
export function parseFriendIdentifier(raw: string): ParsedFriendIdentifier {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new FriendIdentifierValidationError('Enter a username or email address.');
  }

  if (trimmed.startsWith('@') && !trimmed.slice(1).includes('@')) {
    const validated = validateUsername(trimmed.slice(1));
    if (!validated.valid) throw new FriendIdentifierValidationError(validated.message);
    return { kind: 'username', value: validated.username };
  }

  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase();
    if (!isValidEmail(email)) {
      throw new FriendIdentifierValidationError('Enter a valid email address.');
    }
    return { kind: 'email', value: email };
  }

  const validated = validateUsername(trimmed);
  if (!validated.valid) throw new FriendIdentifierValidationError(validated.message);
  return { kind: 'username', value: validated.username };
}

function logRpcFailure(operation: string, code?: string): void {
  console.error(`[Streaming Helper] RPC ${operation} failed`, { code: code ?? 'unknown' });
}

function throwSanitizedRpcError(operation: string, error: { code?: string }, userMessage: string): never {
  logRpcFailure(operation, error.code);
  throw new Error(userMessage);
}

// ── Safe profile lookup (never returns email) ───────────────────────────────

export interface SafeProfile {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
}

/**
 * Exact-match, rate-limited (30/min) lookup by email via
 * lookup_profile_by_email(). Returns null when no account matches.
 */
export async function lookupProfileByEmail(email: string): Promise<SafeProfile | null> {
  const { data, error } = await supabase.rpc('lookup_profile_by_email', {
    p_email: email.trim(),
  });

  if (error) throwSanitizedRpcError('lookup_profile_by_email', error, LOOKUP_FAILURE_MESSAGE);

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;

  return {
    id:          row.id,
    displayName: row.display_name ?? null,
    username:    row.username ?? null,
    avatarUrl:   row.avatar_url ?? null,
  };
}

/**
 * Exact-match, rate-limited (30/min) lookup by username via
 * lookup_profile_by_username(). Returns null when no account matches.
 * Reserved for the upcoming username Add Friend phase — not wired into
 * the current UI.
 */
export async function lookupProfileByUsername(username: string): Promise<SafeProfile | null> {
  const { data, error } = await supabase.rpc('lookup_profile_by_username', {
    p_username: username.trim(),
  });

  if (error) throwSanitizedRpcError('lookup_profile_by_username', error, LOOKUP_FAILURE_MESSAGE);

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;

  return {
    id:          row.id,
    displayName: row.display_name ?? null,
    username:    row.username ?? null,
    avatarUrl:   row.avatar_url ?? null,
  };
}

// ── Display helper ───────────────────────────────────────────────────────────

/**
 * Standard display fallback for the other party of a friend request.
 * The safe RPCs never expose emails, so the order is:
 *   display name → @username → generic label.
 */
export function friendRequestDisplayName(
  req: Pick<FriendRequest, 'requesterName' | 'requesterUsername' | 'requesterEmail'>
): string {
  return (
    req.requesterName ??
    (req.requesterUsername ? `@${req.requesterUsername}` : null) ??
    // Legacy in-memory rows created before this phase may still carry an email.
    req.requesterEmail ??
    'Streaming Helper user'
  );
}

// ── Send-RPC status mapping ──────────────────────────────────────────────────

/**
 * Sentinel consumed by AddFriendModal: an unknown email falls through to the
 * email invitation flow instead of showing a red error.
 */
export const EMAIL_NOT_FOUND_SENTINEL = 'EMAIL_NOT_FOUND';

/**
 * Sentinel consumed by AddFriendModal: an unknown username shows an inline
 * no-account message and must never enter the invitation flow.
 */
export const USERNAME_NOT_FOUND_SENTINEL = 'USERNAME_NOT_FOUND';

function throwForStatus(status: SendFriendRequestStatus, viaEmail: boolean): never {
  switch (status) {
    case 'RECIPIENT_NOT_FOUND':
      throw new Error(viaEmail ? EMAIL_NOT_FOUND_SENTINEL : USERNAME_NOT_FOUND_SENTINEL);
    case 'EMAIL_INVALID':
      throw new Error('Enter a valid email address.');
    case 'USERNAME_INVALID':
      throw new Error('Use 3–30 characters with lowercase letters, numbers, or underscores.');
    case 'CANNOT_REQUEST_SELF':
      throw new Error("You can't send a friend request to yourself.");
    case 'ALREADY_FRIENDS':
      throw new Error('You are already friends with this person.');
    case 'REQUEST_ALREADY_PENDING':
      throw new Error('Friend request already sent.');
    case 'RATE_LIMITED':
      throw new Error("You're sending requests too quickly. Please try again later.");
    case 'UNAUTHENTICATED':
      throw new Error('Your session has expired. Please sign in again.');
    default:
      throw new Error(SEND_FAILURE_MESSAGE);
  }
}

function sentRowToRequest(row: SendFriendRequestResultRow, requesterId: string): FriendRequest {
  if (row.status !== 'SENT' || !row.request_id || !row.recipient_id) {
    console.error('[Streaming Helper] RPC send_friend_request returned incomplete SENT row', {
      status: row.status,
      hasRequestId: !!row.request_id,
      hasRecipientId: !!row.recipient_id,
    });
    throw new Error(SEND_FAILURE_MESSAGE);
  }

  return {
    id:                row.request_id,
    requesterId,
    requesterName:     row.recipient_display_name ?? null,
    requesterUsername: row.recipient_username ?? null,
    requesterEmail:    null,
    recipientId:       row.recipient_id,
    status:            'pending',
    createdAt:         new Date().toISOString(),
  };
}

// ── Send a request by email (normal Add Friend path) ────────────────────────
// Replaces the direct friend_requests INSERT. The RPC resolves the recipient
// and their authoritative email internally, enforces self/friends/duplicate
// checks and the 5-per-minute / 20-per-day submission limits, and returns a
// stable status. The recipient's email is never returned to the browser.

export async function sendFriendRequestByEmail(
  requesterId: string,
  recipientEmail: string
): Promise<FriendRequest> {
  const { data, error } = await supabase.rpc('send_friend_request_by_email', {
    p_email: recipientEmail.toLowerCase().trim(),
  });

  if (error) throwSanitizedRpcError('send_friend_request_by_email', error, SEND_FAILURE_MESSAGE);

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new Error(SEND_FAILURE_MESSAGE);
  if (row.status !== 'SENT') throwForStatus(row.status, true);

  return sentRowToRequest(row, requesterId);
}

// ── Send a request by username (Add Friend primary path) ───────────────────
// Replaces any lookup-then-insert pattern. The RPC resolves the recipient
// internally, enforces self/friends/duplicate checks and rate limits, and
// never returns the recipient's email.

export async function sendFriendRequestByUsername(
  requesterId: string,
  recipientUsername: string
): Promise<FriendRequest> {
  const { data, error } = await supabase.rpc('send_friend_request_by_username', {
    p_username: normalizeUsernameInput(recipientUsername),
  });

  if (error) throwSanitizedRpcError('send_friend_request_by_username', error, SEND_FAILURE_MESSAGE);

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new Error(SEND_FAILURE_MESSAGE);
  if (row.status !== 'SENT') throwForStatus(row.status, false);

  return sentRowToRequest(row, requesterId);
}

// ── Fetch incoming (pending) requests ────────────────────────────────────────
// get_incoming_friend_requests_safe() returns pending requests addressed to
// auth.uid() with requester display fields — never the requester's email.

export async function fetchIncomingRequests(_userId: string): Promise<FriendRequest[]> {
  const { data, error } = await supabase.rpc('get_incoming_friend_requests_safe');

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id:                row.id,
    requesterId:       row.requester_id,
    requesterName:     row.requester_display_name ?? null,
    requesterUsername: row.requester_username ?? null,
    requesterEmail:    null,
    recipientId:       null,
    status:            row.status as 'pending' | 'accepted' | 'declined',
    createdAt:         row.created_at,
  }));
}

// ── Fetch outgoing (pending) requests ─────────────────────────────────────────
// get_my_sent_friend_requests_safe() returns pending requests created by
// auth.uid() with recipient display fields — never the recipient's email.
// The other-party fields are stored in the requesterName/requesterUsername
// slots, matching the existing outgoing-row convention used by the UI.

export async function fetchOutgoingRequests(userId: string): Promise<FriendRequest[]> {
  const { data, error } = await supabase.rpc('get_my_sent_friend_requests_safe');

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id:                row.id,
    requesterId:       userId,
    requesterName:     row.recipient_display_name ?? null,
    requesterUsername: row.recipient_username ?? null,
    requesterEmail:    null,
    recipientId:       row.recipient_id ?? null,
    status:            row.status as 'pending' | 'accepted' | 'declined',
    createdAt:         row.created_at,
  }));
}

// ── Accept ────────────────────────────────────────────────────────────────────
// Direct UPDATE remains allowed after migration 022: recipients keep UPDATE
// on (status, responded_at) and SELECT on safe columns. 1. Mark request
// accepted (RLS: recipient_id = currentUserId). 2. Insert both friendship rows.

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
// Direct DELETE remains allowed after migration 022 (requester DELETE policy).
// No RETURNING of restricted columns.

export async function cancelFriendRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('friend_requests')
    .delete()
    .eq('id', requestId)
    .eq('status', 'pending');

  if (error) throw new Error(error.message);
}

// ── Decline ───────────────────────────────────────────────────────────────────
// Direct UPDATE remains allowed after migration 022 (recipient UPDATE policy,
// status/responded_at column grants only).

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
