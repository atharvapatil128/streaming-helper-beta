import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  sendFriendRequestByEmail,
  sendFriendRequestByUsername,
  parseFriendIdentifier,
  FriendIdentifierValidationError,
  fetchIncomingRequests,
  fetchOutgoingRequests,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
} from '../../lib/friendRequests';
import type { FriendRequest } from '../../types';

interface UseFriendRequestsOptions {
  /** Called after the acceptance RPC atomically creates the friendship. */
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

  // Resolve the current user (store both id and email for self-request guard).
  // onAuthStateChange handles the runtime login case (user signs in without
  // a page reload). getSession handles page load with an existing session.
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
      setUserEmail(session?.user?.email?.toLowerCase() ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUserId(session?.user?.id ?? null);
        setUserEmail(session?.user?.email?.toLowerCase() ?? null);
      }
    );
    return () => subscription.unsubscribe();
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

  /** Send a friend request by username or email via the authoritative send RPC. */
  const sendRequest = useCallback(
    async (identifier: string): Promise<FriendRequest> => {
      if (!userId) throw new Error('Not signed in.');

      let parsed;
      try {
        parsed = parseFriendIdentifier(identifier);
      } catch (err) {
        if (err instanceof FriendIdentifierValidationError) throw err;
        throw new Error('Enter a username or email address.');
      }

      if (parsed.kind === 'username') {
        const request = await sendFriendRequestByUsername(userId, parsed.value);
        setOutgoingRequests((prev) => [request, ...prev]);
        return request;
      }

      // ── Email branch ─────────────────────────────────────────────────────
      // Local self-request guard (fast, no rate-limit burn). The RPC also
      // enforces CANNOT_REQUEST_SELF.
      if (userEmail && parsed.value === userEmail) {
        throw new Error("You can't send a friend request to yourself.");
      }

      const request = await sendFriendRequestByEmail(userId, parsed.value);
      setOutgoingRequests((prev) => [request, ...prev]);
      return request;
    },
    [userId, userEmail]
  );

  /** Accept an incoming request through the authoritative database RPC. */
  const acceptRequest = useCallback(
    async (requestId: string): Promise<void> => {
      if (!userId) throw new Error('Not signed in.');

      await acceptFriendRequest(requestId);

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
