import { useEffect, useRef, useState } from 'react';
import { X, UserPlus, Mail, Loader2, AlertCircle, Check, AtSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  EMAIL_NOT_FOUND_SENTINEL,
  USERNAME_NOT_FOUND_SENTINEL,
  friendRequestDisplayName,
} from '../../lib/friendRequests';
import type { FriendRequest } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface AddFriendModalProps {
  /**
   * Called with the raw identifier (username or email). Resolves to the created
   * FriendRequest on success. Throws EMAIL_NOT_FOUND for unknown emails
   * (invitation path), USERNAME_NOT_FOUND for unknown usernames (inline error),
   * or a friendly message for other failures.
   */
  onSend: (identifier: string) => Promise<FriendRequest>;
  onClose: () => void;
  /**
   * Called after a new email invitation is successfully sent (status === 'sent').
   * Used by App.tsx to refetch the sender's sent-invitations list so the new
   * row appears in Manage Friends without a page reload.
   * Not called for 'already_pending' since the row already exists.
   */
  onInvitationSent?: () => void;
}

/** Tracks which async phase is in progress (drives button label + disabled). */
type Phase = 'idle' | 'sending' | 'inviting';

interface InvitationResult {
  status: 'sent' | 'already_pending';
  expiresAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error-code → user-facing message
// ─────────────────────────────────────────────────────────────────────────────

function mapInviteErrorCode(code: string | undefined): string {
  switch (code) {
    case 'CANNOT_INVITE_SELF':
      return "You can't invite your own email address.";
    case 'RATE_LIMITED':
      return "You've reached today's invitation limit. Please try again later.";
    case 'EMAIL_SEND_FAILED':
      return "We couldn't send the invitation email. Please try again.";
    case 'UNAUTHENTICATED':
      return 'Your session has expired. Please sign in again.';
    case 'INVALID_EMAIL':
      return 'Enter a valid email address.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function AddFriendModal({ onSend, onClose, onInvitationSent }: AddFriendModalProps) {
  const [identifier, setIdentifier] = useState('');
  const [phase, setPhase]           = useState<Phase>('idle');
  const [error, setError]             = useState<string | null>(null);

  // Existing-account path
  const [sentRequest, setSentRequest] = useState<FriendRequest | null>(null);

  // Invitation path (email-only)
  const [invitedEmail, setInvitedEmail]         = useState<string | null>(null);
  const [invitationResult, setInvitationResult] = useState<InvitationResult | null>(null);

  const submittingRef = useRef(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleIdentifierChange = (value: string) => {
    setIdentifier(value);
    setError(null);
    // Do not carry invitation state from a prior email attempt into a new input.
    setInvitedEmail(null);
    setInvitationResult(null);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = identifier.trim();
    if (!trimmed) {
      setError('Enter a username or email address.');
      return;
    }
    if (submittingRef.current) return;

    submittingRef.current = true;
    setError(null);
    setPhase('sending');

    try {
      const request = await onSend(trimmed);
      setSentRequest(request);
      setIdentifier('');

    } catch (err) {
      if (!(err instanceof Error)) {
        setError('We couldn\'t send the friend request. Please try again.');
        return;
      }

      if (err.message === USERNAME_NOT_FOUND_SENTINEL) {
        setError('No account found with that username.');
        return;
      }

      if (err.message !== EMAIL_NOT_FOUND_SENTINEL) {
        setError(err.message);
        return;
      }

      // ── Invitation path (email branch only) ──────────────────────────────
      const inviteEmail = trimmed.toLowerCase();
      setPhase('inviting');
      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          'send-invitation',
          { body: { email: inviteEmail } },
        );

        if (fnError) {
          let code: string | undefined;
          try {
            const errBody = await (fnError as { context?: Response }).context?.json();
            code = (errBody as { code?: string })?.code;
          } catch { /* ignore parse error */ }

          if (code === 'ACCOUNT_EXISTS') {
            setError(
              'This person just joined Streaming Helper. Submit again to send them a friend request.',
            );
          } else {
            setError(mapInviteErrorCode(code));
          }
        } else if (data?.status === 'sent' || data?.status === 'already_pending') {
          setInvitedEmail(inviteEmail);
          setInvitationResult({
            status:    data.status as 'sent' | 'already_pending',
            expiresAt: (data.expiresAt as string) ?? '',
          });
          setIdentifier('');
          if (data.status === 'sent') {
            onInvitationSent?.();
          }
        } else {
          setError('Something went wrong. Please try again.');
        }
      } catch {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      submittingRef.current = false;
      setPhase('idle');
    }
  };

  // ── Navigation helpers ────────────────────────────────────────────────────
  const handleReset = () => {
    setSentRequest(null);
    setInvitedEmail(null);
    setInvitationResult(null);
    setError(null);
  };

  // ── Derived display values ────────────────────────────────────────────────
  const busy = phase !== 'idle';

  const subtitle =
    sentRequest                                       ? 'Request sent!' :
    invitationResult?.status === 'sent'               ? 'Invitation sent!' :
    invitationResult?.status === 'already_pending'    ? 'Already invited' :
    'Connect using their username or email';

  const buttonLabel =
    phase === 'sending'  ? 'Sending…' :
    phase === 'inviting' ? 'Sending invitation…' :
    null;

  const sentRecipientName = sentRequest ? friendRequestDisplayName(sentRequest) : null;
  const sentRecipientSecondary =
    sentRequest?.requesterName && sentRequest.requesterUsername
      ? `@${sentRequest.requesterUsername}`
      : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f0f14] border border-[#1f1f28] rounded-2xl w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#1f1f28]">
          <div>
            <h2 className="text-xl text-[#e4e4e7]">Add Friend</h2>
            <p className="text-sm text-[#8b8b9e] mt-1">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-[#1f1f28] rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-[#8b8b9e]" />
          </button>
        </div>

        {/* ── Existing-account success ────────────────────────────────────── */}
        {sentRequest ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-[#5b5bd6]/20 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-[#5b5bd6]" />
            </div>
            <div>
              <p className="text-[#e4e4e7] mb-1">Request sent to</p>
              <p className="text-sm text-[#5b5bd6] font-medium">{sentRecipientName}</p>
              {sentRecipientSecondary && (
                <p className="text-xs text-[#8b8b9e] mt-0.5">{sentRecipientSecondary}</p>
              )}
            </div>
            <p className="text-sm text-[#8b8b9e]">
              {"They'll see the request in their notifications."}
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleReset}
                className="flex-1 px-4 py-2.5 bg-[#1f1f28] hover:bg-[#2a2a35] rounded-lg text-sm text-[#e4e4e7] transition-colors"
              >
                Add another
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] rounded-lg text-sm text-white transition-colors"
              >
                Done
              </button>
            </div>
          </div>

        /* ── Invitation sent ──────────────────────────────────────────────── */
        ) : invitedEmail && invitationResult?.status === 'sent' ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-[#5b5bd6]/20 rounded-full flex items-center justify-center mx-auto">
              <Mail className="w-8 h-8 text-[#5b5bd6]" />
            </div>
            <div>
              <p className="text-[#e4e4e7] mb-1">Invitation sent to</p>
              <p className="text-sm text-[#5b5bd6] font-medium">{invitedEmail}</p>
            </div>
            <p className="text-sm text-[#8b8b9e] leading-relaxed">
              {"They'll receive an email from Streaming Helper. The invitation will remain available for 14 days."}
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleReset}
                className="flex-1 px-4 py-2.5 bg-[#1f1f28] hover:bg-[#2a2a35] rounded-lg text-sm text-[#e4e4e7] transition-colors"
              >
                Invite another
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] rounded-lg text-sm text-white transition-colors"
              >
                Done
              </button>
            </div>
          </div>

        /* ── Invitation already pending ───────────────────────────────────── */
        ) : invitedEmail && invitationResult?.status === 'already_pending' ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-[#2a2a35] rounded-full flex items-center justify-center mx-auto">
              <Mail className="w-8 h-8 text-[#8b8b9e]" />
            </div>
            <div>
              <p className="text-[#e4e4e7] mb-1">An invitation has already been sent to</p>
              <p className="text-sm text-[#5b5bd6] font-medium">{invitedEmail}</p>
            </div>
            <p className="text-sm text-[#8b8b9e] leading-relaxed">
              {'They can use the invitation email to join Streaming Helper.'}
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleReset}
                className="flex-1 px-4 py-2.5 bg-[#1f1f28] hover:bg-[#2a2a35] rounded-lg text-sm text-[#e4e4e7] transition-colors"
              >
                Invite another
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] rounded-lg text-sm text-white transition-colors"
              >
                Done
              </button>
            </div>
          </div>

        /* ── Identifier form ──────────────────────────────────────────────── */
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label htmlFor="add-friend-identifier" className="block text-xs text-[#8b8b9e] mb-1.5">
                Username or email <span className="text-[#ef4444]">*</span>
              </label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8b9e]" />
                <input
                  id="add-friend-identifier"
                  type="text"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  value={identifier}
                  onChange={(e) => handleIdentifierChange(e.target.value)}
                  placeholder="@username or friend@example.com"
                  aria-describedby="add-friend-helper add-friend-error"
                  className="w-full bg-[#1a1a22] border border-[#2a2a35] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#e4e4e7] placeholder:text-[#8b8b9e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
                />
              </div>
              <p id="add-friend-helper" className="text-xs text-[#8b8b9e] mt-1.5">
                Connect using their username, or enter an email address to invite them.
              </p>
            </div>

            {error && (
              <div
                id="add-friend-error"
                role="alert"
                aria-live="polite"
                className="flex items-start gap-2 text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2"
              >
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-[#1f1f28] hover:bg-[#2a2a35] rounded-lg text-sm text-[#e4e4e7] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !identifier.trim()}
                aria-busy={busy}
                className="flex-1 px-4 py-2.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors flex items-center justify-center gap-2"
              >
                {busy ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />{buttonLabel}</>
                ) : (
                  <><UserPlus className="w-4 h-4" /> Send Request</>
                )}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}
