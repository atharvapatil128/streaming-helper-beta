import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

// ── Public types ─────────────────────────────────────────────────────────────

export interface SentInvitation {
  id: string;
  invitee_email: string;
  created_at: string;
  expires_at: string;
}

/**
 * Global outcome surfaced as a snackbar in App.tsx.
 * Used for success and for terminal errors that remove the row (so there is
 * no longer an inline anchor to display the message on).
 */
export interface RevokeOutcome {
  kind: 'success' | 'info' | 'error';
  message: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Maps stable backend error codes returned by revoke_my_invitation.
 *
 * Terminal errors (removeFromList: true) always carry a globalMessage so the
 * snackbar can show why the row disappeared. Non-terminal errors (keep the row)
 * carry an inlineMessage for the per-row error display and no globalMessage.
 */
function mapRevokeError(message: string): {
  removeFromList: boolean;
  inlineMessage:  string | null;   // shown on the row; only set for retryable errors
  globalMessage:  string | null;   // shown in the snackbar; only set for terminal errors
} {
  if (message.includes('INVITATION_NOT_FOUND'))
    return {
      removeFromList: true,
      inlineMessage:  null,
      globalMessage:  'This invitation is no longer available.',
    };
  if (message.includes('INVITATION_NOT_PENDING'))
    return {
      removeFromList: true,
      inlineMessage:  null,
      globalMessage:  'This invitation has already been handled.',
    };
  if (message.includes('AUTH_REQUIRED'))
    return {
      removeFromList: false,
      inlineMessage:  'Sign in to manage your invitations.',
      globalMessage:  null,
    };
  // Network / unknown — keep the row so the user can retry.
  return {
    removeFromList: false,
    inlineMessage:  'Something went wrong. Please try again.',
    globalMessage:  null,
  };
}

/** Type-guard: validates a raw DB row before placing it in state. */
function isValidSentInvitation(row: unknown): row is SentInvitation {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.id === 'string' && r.id.length > 0 &&
    typeof r.invitee_email === 'string' && r.invitee_email.length > 0 &&
    typeof r.created_at === 'string' &&
    typeof r.expires_at === 'string'
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSentInvitations() {
  const [invitations, setInvitations]         = useState<SentInvitation[]>([]);
  const [loading, setLoading]                 = useState(false);
  const [fetchError, setFetchError]           = useState<string | null>(null);
  const [revokingIds, setRevokingIds]         = useState<Set<string>>(new Set());
  const [revokeErrorById, setRevokeErrorById] = useState<Record<string, string>>({});
  const [lastOutcome, setLastOutcome]         = useState<RevokeOutcome | null>(null);
  const [userId, setUserId]                   = useState<string | null>(null);

  // ── Auth — same self-contained pattern as usePendingInvitations ───────────
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
  // Queries only the authenticated user's own pending rows (RLS restricts the
  // table further, but the explicit inviter_id filter is a defence-in-depth
  // guard against future policy changes and documents intent clearly).
  const fetchSentInvitations = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setFetchError(null);
    try {
      const { data, error } = await supabase
        .from('invitations')
        .select('id, invitee_email, created_at, expires_at')
        .eq('inviter_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        setFetchError('Could not load sent invitations.');
        return;
      }
      const rows = Array.isArray(data) ? data : [];
      setInvitations(rows.filter(isValidSentInvitation));
    } catch {
      setFetchError('Could not load sent invitations.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchSentInvitations();
    } else {
      setInvitations([]);
      setFetchError(null);
    }
  }, [userId, fetchSentInvitations]);

  // ── Revoke ────────────────────────────────────────────────────────────────
  const revokeInvitation = useCallback(async (invitationId: string) => {
    if (revokingIds.has(invitationId)) return; // prevent duplicate clicks

    setRevokingIds((prev) => { const next = new Set(prev); next.add(invitationId); return next; });
    setRevokeErrorById((prev) => { const next = { ...prev }; delete next[invitationId]; return next; });

    try {
      const { error } = await supabase.rpc('revoke_my_invitation', {
        p_invitation_id: invitationId,
      });

      if (error) {
        const { removeFromList, inlineMessage, globalMessage } =
          mapRevokeError(error.message ?? '');

        if (removeFromList) {
          // Terminal error: row is going away, so inline display is impossible.
          // Surface the reason as a global snackbar instead.
          setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
          if (globalMessage) {
            setLastOutcome({ kind: 'info', message: globalMessage });
          }
        } else {
          // Non-terminal / retryable: keep the row, show error inline.
          if (inlineMessage) {
            setRevokeErrorById((prev) => ({ ...prev, [invitationId]: inlineMessage }));
          }
        }
        return;
      }

      // Success — remove row and surface a brief confirmation snackbar.
      setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
      setLastOutcome({ kind: 'success', message: 'Invitation canceled.' });
    } catch {
      // Network failure — keep the row visible so the user can retry.
      setRevokeErrorById((prev) => ({
        ...prev,
        [invitationId]: 'Something went wrong. Please try again.',
      }));
    } finally {
      setRevokingIds((prev) => { const next = new Set(prev); next.delete(invitationId); return next; });
    }
  }, [revokingIds]);

  const clearLastOutcome = useCallback(() => setLastOutcome(null), []);

  return {
    invitations,
    loading,
    fetchError,
    revokingIds,
    revokeErrorById,
    lastOutcome,
    clearLastOutcome,
    refetchSentInvitations: fetchSentInvitations,
    revokeInvitation,
  };
}
