import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  lookupProfileByEmail,
  sendFriendRequest,
  fetchIncomingRequests,
  fetchOutgoingRequests,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
} from '../../lib/friendRequests';
import type { FriendRequest } from '../../types';

interface UseFriendRequestsOptions {
  /** Called after a request is accepted and friendship rows are inserted. */
  onFriendshipCreated?: () => void;
}

export function useFriendRequests({ onFriendshipCreated }: UseFriendRequestsOptions = {}) {
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [error, setError]                       = useState<string | null>(null);
  const [userId, setUserId]                     = useState<string | null>(null);
  const [userEmail, setUserEmail]               = useState<string | null>(null);

  // Stable ref so acceptRequest callback doesn't stale-close over the prop
  const onCreatedRef = useRef(onFriendshipCreated);
  useEffect(() => { onCreatedRef.current = onFriendshipCreated; });

  // Resolve the current user once (store both id and email for self-request guard)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user.id ?? null);
      setUserEmail(session?.user.email?.toLowerCase() ?? null);
    });
  }, []);

  // Load both request lists when the user is known
  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    setLoading(true);
    setError(null);

    Promise.all([
      fetchIncomingRequests(userId),
      fetchOutgoingRequests(userId),
    ])
      .then(([incoming, outgoing]) => {
        setIncomingRequests(incoming);
        setOutgoingRequests(outgoing);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId]);

  /** Send a friend request by email. Looks up the profile first. */
  const sendRequest = useCallback(
    async (email: string): Promise<void> => {
      if (!userId) throw new Error('Not signed in.');

      const trimmed = email.trim().toLowerCase();

      // ── Client-side guards (fast, no DB round-trip) ───────────────────────

      // 1. Self-request check at the email level
      if (userEmail && trimmed === userEmail) {
        throw new Error("You can't send a friend request to yourself.");
      }

      // 2. Duplicate pending check against local state — covers the common
      //    "sent it twice" case without hitting the database at all.
      //    outgoingRequests stores the recipient email in the requesterEmail field.
      const alreadyPending = outgoingRequests.some(
        (r) => r.requesterEmail.toLowerCase() === trimmed
      );
      if (alreadyPending) {
        throw new Error('Friend request already sent.');
      }

      // ── DB lookup + insert ────────────────────────────────────────────────
      const profile = await lookupProfileByEmail(trimmed);

      const request = await sendFriendRequest(userId, trimmed, profile?.id ?? null);
      setOutgoingRequests((prev) => [request, ...prev]);
    },
    [userId, userEmail, outgoingRequests]
  );

  /** Accept an incoming request and insert both friendship rows. */
  const acceptRequest = useCallback(
    async (requestId: string, requesterId: string): Promise<void> => {
      if (!userId) throw new Error('Not signed in.');

      await acceptFriendRequest(requestId, requesterId, userId);

      // Remove from incoming list
      setIncomingRequests((prev) => prev.filter((r) => r.id !== requestId));

      // Notify parent to refetch friends list
      onCreatedRef.current?.();
    },
    [userId]
  );

  /** Decline an incoming request. */
  const declineRequest = useCallback(
    async (requestId: string): Promise<void> => {
      if (!userId) throw new Error('Not signed in.');

      await declineFriendRequest(requestId, userId);

      setIncomingRequests((prev) => prev.filter((r) => r.id !== requestId));
    },
    [userId]
  );

  /** Cancel an outgoing pending request. Optimistically removes from local state. */
  const cancelRequest = useCallback(
    async (requestId: string): Promise<void> => {
      if (!userId) throw new Error('Not signed in.');

      // Optimistic removal
      setOutgoingRequests((prev) => prev.filter((r) => r.id !== requestId));

      try {
        await cancelFriendRequest(requestId);
      } catch (err) {
        // Restore on failure
        fetchOutgoingRequests(userId)
          .then(setOutgoingRequests)
          .catch(() => null);
        throw err;
      }
    },
    [userId]
  );

  /**
   * Re-fetch both request lists from Supabase.
   * Call this after unfriending so stale accepted/pending entries disappear.
   */
  const refetch = useCallback(() => {
    if (!userId) return;
    Promise.all([
      fetchIncomingRequests(userId),
      fetchOutgoingRequests(userId),
    ])
      .then(([incoming, outgoing]) => {
        setIncomingRequests(incoming);
        setOutgoingRequests(outgoing);
      })
      .catch(() => null);
  }, [userId]);

  return {
    incomingRequests,
    outgoingRequests,
    loading,
    error,
    sendRequest,
    acceptRequest,
    declineRequest,
    cancelRequest,
    refetch,
  };
}
