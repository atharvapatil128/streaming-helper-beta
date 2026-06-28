import { useEffect, useState, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { Loader2, Mail, Check, AlertCircle, UserPlus, LogIn } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import IconMusic from '../../imports/IconMusic';
import { AuthScreen } from './AuthScreen';
import { PENDING_INVITE_KEY } from '../../lib/invite';

const EXPLAINER =
  'Streaming Helper lets friends exchange movie and show recommendations and ' +
  'get a few useful picks when deciding what to watch.';

interface InvitePageProps {
  /** Parsed invite token, or null when the path token was missing/malformed. */
  token: string | null;
  user: User | null;
  authLoading: boolean;
}

// Result of lookup_invitation, reduced to a render state.
type LookupState =
  | { kind: 'loading' }
  | { kind: 'valid'; inviterName: string }
  | { kind: 'expired' }
  | { kind: 'unavailable' } // accepted / declined / revoked
  | { kind: 'invalid' }     // no matching token / bad token
  | { kind: 'error' };      // network / recoverable

// Maps respond_invitation RPC error text → user-facing message.
function mapRespondError(message: string): string {
  if (message.includes('AUTH_REQUIRED'))
    return 'Sign in to respond to this invitation.';
  if (message.includes('INVITATION_NOT_FOUND'))
    return 'This invitation link is invalid.';
  if (message.includes('INVITATION_NOT_PENDING'))
    return 'This invitation has already been used or is no longer available.';
  if (message.includes('INVITATION_EXPIRED'))
    return 'This invitation has expired. Ask your friend to send a new one.';
  if (message.includes('EMAIL_MISMATCH'))
    return 'This invitation was sent to a different email address. Sign in or create an account using the email that received the invitation.';
  if (message.includes('CANNOT_ACCEPT_OWN_INVITATION'))
    return "You can't accept your own invitation.";
  return 'Something went wrong. Please try again.';
}

// ── Visual shell — consistent with the auth experience ───────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden p-4"
      style={{ background: '#0a0a0f' }}
    >
      <div
        className="pointer-events-none absolute"
        style={{
          top: '-12%', left: '-8%', width: 520, height: 520, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(91,91,214,0.16) 0%, transparent 70%)',
          filter: 'blur(48px)',
        }}
      />
      <div className="relative z-10 w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-10 h-10 shrink-0"><IconMusic /></div>
          <span className="text-[#e4e4e7] text-base font-semibold tracking-tight">
            Streaming Helper
          </span>
        </div>
        <div
          style={{
            background: 'rgba(15,15,20,0.95)',
            border: '1px solid rgba(42,42,53,0.9)',
            borderRadius: 18,
            padding: '32px 28px',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

const PRIMARY_BTN =
  'w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors';
const GHOST_BTN =
  'w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1f1f28] hover:bg-[#2a2a35] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm text-[#e4e4e7] transition-colors';

export function InvitePage({ token, user, authLoading }: InvitePageProps) {
  const [lookup, setLookup]           = useState<LookupState>({ kind: 'loading' });
  const [authChoice, setAuthChoice]   = useState<'signup' | 'signin' | null>(null);
  const [responding, setResponding]   = useState<null | 'accept' | 'decline'>(null);
  const [respondError, setRespondError] = useState<string | null>(null);
  const [outcome, setOutcome]         = useState<null | { kind: 'accepted' | 'declined'; inviterName: string }>(null);

  // Persist the token so it survives refresh / auth changes. Never logged.
  useEffect(() => {
    if (token) {
      try { localStorage.setItem(PENDING_INVITE_KEY, token); } catch { /* ignore */ }
    }
  }, [token]);

  const clearToken = () => {
    try { localStorage.removeItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
  };

  // ── Public, pre-auth lookup (also re-run when authenticated) ───────────────
  const runLookup = useCallback(async () => {
    if (!token) { setLookup({ kind: 'invalid' }); return; }
    setLookup({ kind: 'loading' });
    try {
      const { data, error } = await supabase.rpc('lookup_invitation', { p_token: token });
      if (error) { setLookup({ kind: 'error' }); return; }
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) { setLookup({ kind: 'invalid' }); return; }
      if (row.status !== 'pending') { setLookup({ kind: 'unavailable' }); return; }
      if (row.is_expired) { setLookup({ kind: 'expired' }); return; }
      setLookup({ kind: 'valid', inviterName: (row.inviter_display_name || 'A friend') as string });
    } catch {
      setLookup({ kind: 'error' });
    }
  }, [token]);

  useEffect(() => { runLookup(); }, [runLookup]);

  // ── Accept / decline ───────────────────────────────────────────────────────
  const respond = async (action: 'accept' | 'decline') => {
    if (responding || !token) return;
    setRespondError(null);
    setResponding(action);
    try {
      const { error } = await supabase.rpc('respond_invitation', {
        p_token: token,
        p_action: action,
      });
      if (error) {
        // Recoverable failure: keep the token so the user can retry.
        setRespondError(mapRespondError(error.message ?? ''));
        return;
      }
      clearToken();
      const inviterName = lookup.kind === 'valid' ? lookup.inviterName : 'your friend';
      setOutcome({ kind: action === 'accept' ? 'accepted' : 'declined', inviterName });
    } catch {
      setRespondError('Something went wrong. Please try again.');
    } finally {
      setResponding(null);
    }
  };

  const goToDashboard = () => { window.location.assign('/'); };
  const signOutAndReset = async () => {
    await supabase.auth.signOut();
    // App re-renders with user=null; the public landing reappears.
  };

  // ── 1. Auth still resolving ────────────────────────────────────────────────
  if (authLoading) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="w-6 h-6 text-[#5b5bd6] animate-spin" />
          <p className="text-sm text-[#8b8b9e]">Loading invitation…</p>
        </div>
      </Shell>
    );
  }

  // ── 2. Terminal outcome (accepted / declined) ──────────────────────────────
  if (outcome) {
    return (
      <Shell>
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-[#5b5bd6]/20 rounded-full flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-[#5b5bd6]" />
          </div>
          {outcome.kind === 'accepted' ? (
            <>
              <p className="text-[#e4e4e7]">
                You and <span className="text-[#5b5bd6] font-medium">{outcome.inviterName}</span> are now connected.
              </p>
              <button onClick={goToDashboard} className={PRIMARY_BTN}>
                Continue to Streaming Helper
              </button>
            </>
          ) : (
            <>
              <p className="text-[#e4e4e7]">Invitation declined.</p>
              <button onClick={goToDashboard} className={PRIMARY_BTN}>
                Continue to Streaming Helper
              </button>
              <button onClick={signOutAndReset} className="text-sm text-[#8b8b9e] hover:text-[#e4e4e7] transition-colors">
                Sign out
              </button>
            </>
          )}
        </div>
      </Shell>
    );
  }

  // ── 3. Unauthenticated + chose an auth path → reuse AuthScreen ─────────────
  if (!user && authChoice) {
    return (
      <AuthScreen
        inviteToken={token ?? undefined}
        initialMode={authChoice}
        onBack={() => setAuthChoice(null)}
      />
    );
  }

  // ── Shared non-valid lookup messaging (used by both auth states) ───────────
  const renderNonValid = (): React.ReactNode => {
    switch (lookup.kind) {
      case 'loading':
        return (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="w-6 h-6 text-[#5b5bd6] animate-spin" />
            <p className="text-sm text-[#8b8b9e]">Loading invitation…</p>
          </div>
        );
      case 'expired':
        return (
          <div className="text-center space-y-4">
            <h2 className="text-lg text-[#e4e4e7]">This invitation has expired</h2>
            <p className="text-sm text-[#8b8b9e]">Ask your friend to send a new one.</p>
            <button onClick={goToDashboard} className={GHOST_BTN}>Go to Streaming Helper</button>
          </div>
        );
      case 'unavailable':
        return (
          <div className="text-center space-y-4">
            <h2 className="text-lg text-[#e4e4e7]">This invitation is no longer available</h2>
            <p className="text-sm text-[#8b8b9e]">It may have already been used or withdrawn.</p>
            <button onClick={goToDashboard} className={GHOST_BTN}>Go to Streaming Helper</button>
          </div>
        );
      case 'invalid':
        return (
          <div className="text-center space-y-4">
            <h2 className="text-lg text-[#e4e4e7]">This invitation link is invalid</h2>
            <p className="text-sm text-[#8b8b9e]">Double-check the link from your email.</p>
            <button onClick={goToDashboard} className={GHOST_BTN}>Go to Streaming Helper</button>
          </div>
        );
      case 'error':
      default:
        return (
          <div className="text-center space-y-4">
            <h2 className="text-lg text-[#e4e4e7]">Couldn't load this invitation</h2>
            <p className="text-sm text-[#8b8b9e]">Please check your connection and try again.</p>
            <button onClick={runLookup} className={PRIMARY_BTN}>Try again</button>
          </div>
        );
    }
  };

  // ── 4. Authenticated → accept / decline (when valid) ───────────────────────
  if (user) {
    if (lookup.kind !== 'valid') {
      return <Shell>{renderNonValid()}</Shell>;
    }
    return (
      <Shell>
        <div className="space-y-5">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-[#5b5bd6]/20 rounded-full flex items-center justify-center mx-auto">
              <UserPlus className="w-7 h-7 text-[#5b5bd6]" />
            </div>
            <h2 className="text-lg text-[#e4e4e7]">
              <span className="text-[#5b5bd6] font-medium">{lookup.inviterName}</span> invited you to connect.
            </h2>
            <p className="text-sm text-[#8b8b9e] leading-relaxed">{EXPLAINER}</p>
          </div>

          {respondError && (
            <div className="flex items-start gap-2 text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {respondError}
            </div>
          )}

          <div className="space-y-2">
            <button
              onClick={() => respond('accept')}
              disabled={responding !== null}
              className={PRIMARY_BTN}
            >
              {responding === 'accept'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Accepting…</>
                : <><Check className="w-4 h-4" /> Accept invitation</>}
            </button>
            <button
              onClick={() => respond('decline')}
              disabled={responding !== null}
              className={GHOST_BTN}
            >
              {responding === 'decline'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Declining…</>
                : 'Decline'}
            </button>
          </div>

          {/* If the signed-in email doesn't match, let them switch accounts. */}
          {respondError?.includes('different email') && (
            <button
              onClick={signOutAndReset}
              className="w-full text-sm text-[#8b8b9e] hover:text-[#e4e4e7] transition-colors"
            >
              Sign out and use a different account
            </button>
          )}

          <button
            onClick={goToDashboard}
            className="w-full text-xs text-[#6a6a7e] hover:text-[#8b8b9e] transition-colors"
          >
            Maybe later
          </button>
        </div>
      </Shell>
    );
  }

  // ── 5. Unauthenticated public landing ──────────────────────────────────────
  if (lookup.kind !== 'valid') {
    return <Shell>{renderNonValid()}</Shell>;
  }
  return (
    <Shell>
      <div className="space-y-5">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-[#5b5bd6]/20 rounded-full flex items-center justify-center mx-auto">
            <Mail className="w-7 h-7 text-[#5b5bd6]" />
          </div>
          <h2 className="text-lg text-[#e4e4e7]">
            <span className="text-[#5b5bd6] font-medium">{lookup.inviterName}</span> invited you to connect on Streaming Helper.
          </h2>
          <p className="text-sm text-[#8b8b9e] leading-relaxed">{EXPLAINER}</p>
        </div>

        <div className="space-y-2">
          <button onClick={() => setAuthChoice('signup')} className={PRIMARY_BTN}>
            <UserPlus className="w-4 h-4" /> Create account
          </button>
          <button onClick={() => setAuthChoice('signin')} className={GHOST_BTN}>
            <LogIn className="w-4 h-4" /> Sign in
          </button>
        </div>

        <p className="text-center text-xs text-[#6a6a7e] leading-relaxed">
          Use the email address that received this invitation.
        </p>
      </div>
    </Shell>
  );
}
