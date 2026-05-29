import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchFriends, removeFriend } from '../../lib/friends';
import type { Friend } from '../../types';

export function useFriends() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [userId, setUserId]   = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    setLoading(true);
    setError(null);

    fetchFriends(userId)
      .then(setFriends)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId]);

  /** Re-fetch the friends list from Supabase. Called after a request is accepted. */
  const refetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await fetchFriends(userId);
      setFriends(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load friends.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /** Remove a friendship (both directions) by the friendship row id. */
  const remove = useCallback(
    async (id: string) => {
      const target = friends.find((f) => f.id === id);
      if (!target || !userId) return;

      // Optimistic removal
      setFriends((prev) => prev.filter((f) => f.id !== id));

      try {
        await removeFriend(userId, target.friendUserId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove friend.');
        // Restore on failure
        if (userId) fetchFriends(userId).then(setFriends).catch(() => null);
      }
    },
    [friends, userId]
  );

  return { friends, loading, error, refetch, remove };
}
