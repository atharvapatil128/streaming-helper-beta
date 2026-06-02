import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  fetchRecommendations,
  fetchSentRecommendations,
  addRecommendation,
  dismissRecommendation,
  undoRecommendation,
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
  /**
   * Restore a previously dismissed recommendation.
   * Optimistically adds the item back to the visible list, then persists to DB.
   */
  undoDismiss: (rec: Recommendation) => Promise<void>;
  deleteSent: (id: string) => Promise<void>;
  /**
   * Silently re-fetch the received recommendations list in the background.
   * Does NOT set loading=true so there is no disruptive spinner. Used when
   * the user navigates into a recommendations view to pick up new items
   * without requiring a full page reload.
   */
  refetchReceived: () => void;
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

  // Resolve the signed-in user's ID and display name.
  // display_name is used as source_name so recipients see "Recommended by <your name>".
  // onAuthStateChange handles runtime sign-in (no page reload needed).
  useEffect(() => {
    async function resolveUser(uid: string | null, email: string | null) {
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
      } else {
        setSenderName('Me');
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) =>
      resolveUser(session?.user?.id ?? null, session?.user?.email ?? null)
    );

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        resolveUser(session?.user?.id ?? null, session?.user?.email ?? null);
      }
    );
    return () => subscription.unsubscribe();
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

  const undoDismiss = useCallback(
    async (rec: Recommendation) => {
      // Optimistically restore at the top of the list. The original position is
      // not tracked, but on the next full fetch the order will match created_at.
      setRecommendations((prev) => [rec, ...prev.filter((r) => r.id !== rec.id)]);
      try {
        await undoRecommendation(rec.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to restore recommendation.');
        if (userId) {
          fetchRecommendations(userId).then(setRecommendations).catch(() => null);
        }
      }
    },
    [userId]
  );

  // Silent background refetch — no loading state change so the UI doesn't
  // flash a spinner. Errors are swallowed; stale data is better than a crash.
  const refetchReceived = useCallback(() => {
    if (!userId) return;
    fetchRecommendations(userId)
      .then(setRecommendations)
      .catch(() => null);
  }, [userId]);

  return {
    recommendations,
    loading,
    error,
    sentRecommendations,
    sentLoading,
    sentError,
    add,
    dismiss,
    undoDismiss,
    deleteSent,
    refetchReceived,
  };
}
