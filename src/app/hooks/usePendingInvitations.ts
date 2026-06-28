import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

// ── Public types ─────────────────────────────────────────────────────────────

export interface PendingInvitation {
  invitation_id: string;
  inviter_display_name: string;
  created_at: string;
  expires_at: string;
}

/** Outcome of a successful accept or decline, used by App.tsx for the toast. */
export interface InviteOutcome {
  kind: 'accepted' | 'declined';
  inviterName: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Maps stable backend error strings → user-facing copy + list-removal flag. */
function mapRespondError(message: string): { userMessage: string; removeFromList: boolean } {
  if (message.includes('AUTH_REQUIRED'))
    return { userMessage: 'Sign in to respond to this invitation.', removeFromList: false };
  if (message.includes('INVITATION_NOT_FOUND'))
    return { userMessage: 'This invitation is no longer available.', removeFromList: true };
  if (message.includes('INVITATION_NOT_PENDING'))
    return { userMessage: 'This invitation has already been handled.', removeFromList: true };
  if (message.includes('INVITATION_EXPIRED'))
    return { userMessage: 'This invitation has expired.', removeFromList: true };
  if (message.includes('EMAIL_MISMATCH'))
    return { userMessage: 'This invitation was sent to a different email address.', removeFromList: false };
  if (message.includes('CANNOT_ACCEPT_OWN_INVITATION'))
    return { userMessage: "You can't accept your own invitation.", removeFromList: true };
  // INVALID_ACTION should never reach the UI; treat as generic retryable.
  return { userMessage: 'Something went wrong. Please try again.', removeFromList: false };
}

/** Type-guard: validates that an RPC row has all required fields before use. */
function isValidInvitation(row: unknown): row is PendingInvitation {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.invitation_id === 'string' && r.invitation_id.length > 0 &&
    typeof r.inviter_display_name === 'string' &&
    typeof r.created_at === 'string' &&
    typeof r.expires_at === 'string'
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

interface UsePendingInvitationsOptions {
  /** Called after a successful accept so App can refetch friends. */
  onFriendshipCreated?: () => void;
}

export function usePendingInvitations({
  onFriendshipCreated,
}: UsePendingInvitationsOptions = {}) {
  const [invitations, setInvitations]   = useState<PendingInvitation[]>([]);
  const [loading, setLoading]           = useState(false);
  const [respondingIds, setRespondingIds] = useState<Set<string>>(new Set());
  const [errors, setErrors]             = useState<Record<string, string>>({});
  // Session-only dismissals — never persisted, never sent to the DB.
  const [sessionDismissed, setSessionDismissed] = useState<Set<string>>(new Set());
  const [lastOutcome, setLastOutcome]   = useState<InviteOutcome | null>(null);
  const [userId, setUserId]             = useState<string | null>(null);

  const onCreatedRef = useRef(onFriendshipCreated);
  useEffect(() => { onCreatedRef.current = onFriendshipCreated; });

  // ── Auth — same self-contained pattern as useFriendRequests ──────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  // Only runs when authenticated. A failed request silently no-ops so the
  // dashboard is never blocked.
  const fetchInvitations = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('list_my_pending_invitations');
      if (error) return; // network/auth error — swallow; dashboard unaffected
      const rows = Array.isArray(data) ? data : [];
      setInvitations(rows.filter(isValidInvitation));
    } catch {
      // network error — swallow
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchInvitations();
    } else {
      setInvitations([]);
      setErrors({});
    }
  }, [userId, fetchInvitations]);

  // ── Respond ───────────────────────────────────────────────────────────────
  const respond = useCallback(
    async (invitationId: string, action: 'accept' | 'decline') => {
      if (respondingIds.has(invitationId)) return; // prevent duplicate clicks

      // Capture name before optimistic removal
      const inv = invitations.find((i) => i.invitation_id === invitationId);
      const inviterName = inv?.inviter_display_name ?? 'your friend';

      setRespondingIds((prev) => {
        const next = new Set(prev); next.add(invitationId); return next;
      });
      setErrors((prev) => {
        const next = { ...prev }; delete next[invitationId]; return next;
      });

      try {
        const { error } = await supabase.rpc('respond_to_my_invitation', {
          p_invitation_id: invitationId,
          p_action: action,
        });

        if (error) {
          const { userMessage, removeFromList } = mapRespondError(error.message ?? '');
          if (removeFromList) {
            setInvitations((prev) => prev.filter((i) => i.invitation_id !== invitationId));
          } else {
            setErrors((prev) => ({ ...prev, [invitationId]: userMessage }));
          }
          return;
        }

        // Success — remove from list and surface outcome for the toast.
        setInvitations((prev) => prev.filter((i) => i.invitation_id !== invitationId));
        setLastOutcome({ kind: action === 'accept' ? 'accepted' : 'declined', inviterName });
        if (action === 'accept') onCreatedRef.current?.();
      } catch {
        // Network failure — keep the item visible so the user can retry.
        setErrors((prev) => ({
          ...prev,
          [invitationId]: 'Something went wrong. Please try again.',
        }));
      } finally {
        setRespondingIds((prev) => {
          const next = new Set(prev); next.delete(invitationId); return next;
        });
      }
    },
    [respondingIds, invitations],
  );

  const acceptInvitation = useCallback(
    (id: string) => respond(id, 'accept'), [respond],
  );
  const declineInvitation = useCallback(
    (id: string) => respond(id, 'decline'), [respond],
  );

  /** Hides the invitation for this browser session only — no DB change. */
  const dismissForSession = useCallback((id: string) => {
    setSessionDismissed((prev) => { const next = new Set(prev); next.add(id); return next; });
  }, []);

  const clearLastOutcome = useCallback(() => setLastOutcome(null), []);

  // Filter out session-dismissed items before exposing.
  const visibleInvitations = invitations.filter((i) => !sessionDismissed.has(i.invitation_id));

  return {
    invitations:        visibleInvitations,
    loading,
    respondingIds,
    errors,
    lastOutcome,
    acceptInvitation,
    declineInvitation,
    dismissForSession,
    clearLastOutcome,
    refetchInvitations: fetchInvitations,
  };
}
