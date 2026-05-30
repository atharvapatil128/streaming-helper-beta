import { supabase } from './supabase';

// ── Key helpers ─────────────────────────────────────────────────────────────
// Notification keys are stable string identifiers scoped to a type and ID.
// They map 1-to-1 with notification_reads.notification_key in the database.

export function recKey(recommendationId: string): string {
  return `recommendation:${recommendationId}`;
}

export function friendRequestKey(requestId: string): string {
  return `friend_request:${requestId}`;
}

// ── Data access ──────────────────────────────────────────────────────────────

/**
 * Fetch both read and dismissed state for all of the user's notifications.
 *
 * Every row in notification_reads is "read" (read_at is NOT NULL by default).
 * A row is additionally "dismissed" if dismissed_at is non-null.
 */
export async function fetchNotificationStates(userId: string): Promise<{
  readKeys:      Set<string>;
  dismissedKeys: Set<string>;
}> {
  const { data, error } = await supabase
    .from('notification_reads')
    .select('notification_key, dismissed_at')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);

  const readKeys      = new Set<string>();
  const dismissedKeys = new Set<string>();

  for (const row of (data ?? [])) {
    readKeys.add(row.notification_key);
    if (row.dismissed_at) dismissedKeys.add(row.notification_key);
  }

  return { readKeys, dismissedKeys };
}

/**
 * Mark a single notification key as read.
 * Uses ignoreDuplicates so an existing row (e.g. a dismissed one) is never overwritten.
 */
export async function markKeyRead(userId: string, key: string): Promise<void> {
  const { error } = await supabase
    .from('notification_reads')
    .upsert(
      { user_id: userId, notification_key: key },
      { onConflict: 'user_id,notification_key', ignoreDuplicates: true }
    );

  if (error) throw new Error(error.message);
}

/** Mark multiple notification keys as read in a single round-trip. */
export async function markKeysRead(userId: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;

  const { error } = await supabase
    .from('notification_reads')
    .upsert(
      keys.map((key) => ({ user_id: userId, notification_key: key })),
      { onConflict: 'user_id,notification_key', ignoreDuplicates: true }
    );

  if (error) throw new Error(error.message);
}

/**
 * Dismiss a notification.
 *
 * Sets dismissed_at (and read_at via DB default on new rows).
 * On conflict (row already exists from markRead), only dismissed_at is updated —
 * the existing read_at is preserved.
 *
 * Dismissing does NOT affect the underlying record:
 *   - recommendations stay in the dashboard
 *   - friend requests stay pending (can still be accepted/declined)
 */
export async function dismissKey(userId: string, key: string): Promise<void> {
  const { error } = await supabase
    .from('notification_reads')
    .upsert(
      {
        user_id:          userId,
        notification_key: key,
        dismissed_at:     new Date().toISOString(),
      },
      // No ignoreDuplicates — we WANT to update dismissed_at on existing rows.
      // Only columns in the payload are touched; read_at is left unchanged.
      { onConflict: 'user_id,notification_key' }
    );

  if (error) throw new Error(error.message);
}
