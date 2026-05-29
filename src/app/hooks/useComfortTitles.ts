import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  fetchComfortTitles,
  addComfortTitle,
  removeComfortTitle,
  pinComfortTitle,
} from '../../lib/comfortTitles';
import type { ComfortTitle } from '../../types';

interface UseComfortTitlesResult {
  titles: ComfortTitle[];
  loading: boolean;
  error: string | null;
  add: (data: Omit<ComfortTitle, 'id' | 'isPinned'>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  pin: (id: string) => Promise<void>;
}

export function useComfortTitles(): UseComfortTitlesResult {
  const [titles, setTitles] = useState<ComfortTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Resolve the current user once on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user.id ?? null);
    });
  }, []);

  // Load titles whenever we have a user ID
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetchComfortTitles(userId)
      .then(setTitles)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId]);

  const add = useCallback(
    async (data: Omit<ComfortTitle, 'id' | 'isPinned'>) => {
      if (!userId) throw new Error('Not signed in');

      // Duplicate check (by tmdbId if available, otherwise by title)
      const isDuplicate = titles.some(
        (t) =>
          (data.tmdbId != null && t.tmdbId === data.tmdbId) ||
          t.title.toLowerCase() === data.title.toLowerCase()
      );
      if (isDuplicate) throw new Error(`"${data.title}" is already in your Comfort List.`);

      const saved = await addComfortTitle(userId, data);
      setTitles((prev) => [...prev, saved]);
    },
    [userId, titles]
  );

  const remove = useCallback(async (id: string) => {
    // Optimistic: remove from UI immediately
    setTitles((prev) => prev.filter((t) => t.id !== id));
    try {
      await removeComfortTitle(id);
    } catch (err) {
      // Roll back on failure and surface the error
      setError(err instanceof Error ? err.message : 'Failed to remove title.');
      // Re-fetch to restore correct state
      if (userId) {
        fetchComfortTitles(userId).then(setTitles).catch(() => null);
      }
    }
  }, [userId]);

  const pin = useCallback(async (id: string) => {
    // Optimistic: flip isPinned in UI immediately
    setTitles((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isPinned: true } : t))
    );
    try {
      await pinComfortTitle(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pin title.');
      if (userId) {
        fetchComfortTitles(userId).then(setTitles).catch(() => null);
      }
    }
  }, [userId]);

  return { titles, loading, error, add, remove, pin };
}
