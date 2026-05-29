import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  fetchRecommendations,
  fetchSentRecommendations,
  addRecommendation,
  dismissRecommendation,
  deleteRecommendation,
} from '../../lib/recommendations';
import type { Recommendation } from '../../types';

/** Fields the caller must supply when recommending a title. */
export interface AddPayload {
  tmdbId: number;
  title: string;
  type: 'movie' | 'series';
  thumbnail: string;
  year: string | null;
  genres: string[];
  platform: string;
  /** Profile UUID of the friend who will receive this recommendation. */
  recipientUserId: string;
}

interface UseRecommendationsResult {
  recommendations: Recommendation[];
  loading: boolean;
  error: string | null;
  sentRecommendations: Recommendation[];
  sentLoading: boolean;
  sentError: string | null;
  add: (rec: AddPayload) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  deleteSent: (id: string) => Promise<void>;
}

export function useRecommendations(): UseRecommendationsResult {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState<string | null>(null);
  const [sentRecommendations, setSentRecommendations] = useState<Recommendation[]>([]);
  const [sentLoading, setSentLoading]         = useState(true);
  const [sentError, setSentError]             = useState<string | null>(null);
  const [userId, setUserId]                   = useState<string | null>(null);
  const [senderName, setSenderName]           = useState<string>('Me');

  // Resolve the signed-in user's ID and display name once.
  // display_name is used as source_name so recipients see "Recommended by <your name>".
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const uid   = session?.user.id    ?? null;
      const email = session?.user.email ?? null;
      setUserId(uid);

      if (uid) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', uid)
          .maybeSingle();

        setSenderName(
          profile?.display_name ??
          email?.split('@')[0]  ??
          'Me'
        );
      }
    });
  }, []);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setSentLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    fetchRecommendations(userId)
      .then(setRecommendations)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));

    setSentLoading(true);
    setSentError(null);
    fetchSentRecommendations(userId)
      .then(setSentRecommendations)
      .catch((err: Error) => setSentError(err.message))
      .finally(() => setSentLoading(false));
  }, [userId]);

  const add = useCallback(
    async (rec: AddPayload) => {
      if (!userId) throw new Error('Not signed in');

      const saved = await addRecommendation(
        userId,
        rec.recipientUserId,
        {
          tmdbId:     rec.tmdbId,
          title:      rec.title,
          type:       rec.type,
          thumbnail:  rec.thumbnail,
          year:       rec.year,
          genres:     rec.genres,
          platform:   rec.platform,
          sourceName: senderName,
        }
      );

      // Add to the sent list immediately (optimistic). The recipient's inbox
      // will update on their next load — no real-time subscription yet.
      // sourceName on the saved row is the sender's name; for the sent list
      // we need the recipient's name. Re-fetch sent list to get the right label.
      if (userId) {
        fetchSentRecommendations(userId)
          .then(setSentRecommendations)
          .catch(() => null);
      }
    },
    [userId, senderName]
  );

  /** Hard-delete a recommendation the current user sent. */
  const deleteSent = useCallback(
    async (id: string) => {
      setSentRecommendations((prev) => prev.filter((r) => r.id !== id));
      try {
        await deleteRecommendation(id);
      } catch (err) {
        setSentError(err instanceof Error ? err.message : 'Failed to delete recommendation.');
        if (userId) {
          fetchSentRecommendations(userId).then(setSentRecommendations).catch(() => null);
        }
      }
    },
    [userId]
  );

  const dismiss = useCallback(
    async (id: string) => {
      // Optimistic removal from the visible list
      setRecommendations((prev) => prev.filter((r) => r.id !== id));
      try {
        await dismissRecommendation(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to dismiss recommendation.');
        // Re-fetch to restore correct state
        if (userId) {
          fetchRecommendations(userId).then(setRecommendations).catch(() => null);
        }
      }
    },
    [userId]
  );

  return {
    recommendations,
    loading,
    error,
    sentRecommendations,
    sentLoading,
    sentError,
    add,
    dismiss,
    deleteSent,
  };
}
