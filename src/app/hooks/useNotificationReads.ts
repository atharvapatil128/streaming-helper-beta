import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  fetchNotificationStates,
  markKeyRead,
  markKeysRead,
  dismissKey,
} from '../../lib/notificationReads';

interface UseNotificationReadsResult {
  /** Keys the user has read (e.g. "recommendation:<id>"). */
  readKeys:      ReadonlySet<string>;
  /** Keys the user has dismissed. Superset of readKeys — dismissing implies reading. */
  dismissedKeys: ReadonlySet<string>;
  loading: boolean;
  /** Mark a single key as read. Optimistic + persisted. */
  markRead:    (key: string) => Promise<void>;
  /** Mark multiple keys as read in one call. */
  markAllRead: (keys: string[]) => Promise<void>;
  /**
   * Dismiss a notification key — hides it from the dropdown.
   * Does NOT affect the underlying record (recommendation/friend request).
   */
  dismiss: (key: string) => Promise<void>;
}

export function useNotificationReads(): UseNotificationReadsResult {
  const [readKeys,      setReadKeys]      = useState<Set<string>>(new Set());
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading]             = useState(true);
  const [userId, setUserId]               = useState<string | null>(null);

  // Subscribe to auth so the hook re-fetches on login without a page reload.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUserId(session?.user?.id ?? null);
      }
    );
    return () => subscription.unsubscribe();
  }, []);

  // Load persisted state whenever the user changes.
  useEffect(() => {
    if (!userId) {
      setReadKeys(new Set());
      setDismissedKeys(new Set());
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchNotificationStates(userId)
      .then(({ readKeys: rk, dismissedKeys: dk }) => {
        setReadKeys(rk);
        setDismissedKeys(dk);
      })
      .catch(() => {
        // Non-fatal: fall back to empty sets (everything appears unread/visible).
        setReadKeys(new Set());
        setDismissedKeys(new Set());
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const markRead = useCallback(
    async (key: string) => {
      setReadKeys((prev) => new Set([...prev, key]));
      if (userId) {
        try { await markKeyRead(userId, key); } catch { /* non-fatal */ }
      }
    },
    [userId]
  );

  const markAllRead = useCallback(
    async (keys: string[]) => {
      if (keys.length === 0) return;
      setReadKeys((prev) => new Set([...prev, ...keys]));
      if (userId) {
        try { await markKeysRead(userId, keys); } catch { /* non-fatal */ }
      }
    },
    [userId]
  );

  const dismiss = useCallback(
    async (key: string) => {
      // Dismissing implies reading — update both sets optimistically.
      setReadKeys((prev)      => new Set([...prev, key]));
      setDismissedKeys((prev) => new Set([...prev, key]));
      if (userId) {
        try { await dismissKey(userId, key); } catch { /* non-fatal */ }
      }
    },
    [userId]
  );

  return { readKeys, dismissedKeys, loading, markRead, markAllRead, dismiss };
}
