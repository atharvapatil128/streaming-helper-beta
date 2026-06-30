import { supabase } from './supabase';

export interface NotificationPreferences {
  recommendationEmailsEnabled: boolean;
  friendRequestEmailsEnabled: boolean;
}

type Row = {
  recommendation_emails_enabled: boolean;
  friend_request_emails_enabled: boolean;
};

function rowToPrefs(row: Row): NotificationPreferences {
  return {
    recommendationEmailsEnabled: row.recommendation_emails_enabled,
    friendRequestEmailsEnabled:  row.friend_request_emails_enabled,
  };
}

/** Fetch the authenticated user's preference row. Returns null if missing. */
export async function fetchNotificationPreferences(
  userId: string
): Promise<NotificationPreferences | null> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('recommendation_emails_enabled, friend_request_emails_enabled')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error('fetch failed');
  if (!data) return null;
  return rowToPrefs(data as Row);
}

/**
 * Create a default preference row for the current user (both enabled).
 * Idempotent — safe if the profile trigger already created a row.
 */
export async function ensureNotificationPreferences(
  userId: string
): Promise<NotificationPreferences> {
  const { error: insertErr } = await supabase
    .from('notification_preferences')
    .upsert(
      { user_id: userId },
      { onConflict: 'user_id', ignoreDuplicates: true }
    );

  if (insertErr) throw new Error('ensure failed');

  const prefs = await fetchNotificationPreferences(userId);
  if (prefs) return prefs;

  throw new Error('ensure failed');
}

type PreferenceColumn =
  | 'recommendation_emails_enabled'
  | 'friend_request_emails_enabled';

async function updatePreferenceColumn(
  userId: string,
  column: PreferenceColumn,
  enabled: boolean
): Promise<void> {
  const attemptUpdate = async () => {
    const { data, error } = await supabase
      .from('notification_preferences')
      .update({ [column]: enabled })
      .eq('user_id', userId)
      .select(column)
      .maybeSingle();

    if (error) throw new Error('update failed');
    return data;
  };

  let row = await attemptUpdate();
  if (!row) {
    await ensureNotificationPreferences(userId);
    row = await attemptUpdate();
  }

  if (!row) throw new Error('update failed');
}

/** Update only recommendation_emails_enabled for the current user. */
export async function updateRecommendationEmailsEnabled(
  userId: string,
  enabled: boolean
): Promise<void> {
  await updatePreferenceColumn(userId, 'recommendation_emails_enabled', enabled);
}

/** Update only friend_request_emails_enabled for the current user. */
export async function updateFriendRequestEmailsEnabled(
  userId: string,
  enabled: boolean
): Promise<void> {
  await updatePreferenceColumn(userId, 'friend_request_emails_enabled', enabled);
}
