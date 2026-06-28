import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, Loader2, AlertCircle, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import IconMusic from '../../imports/IconMusic';

/**
 * Shown for every visit to /update-password. Owns its entire state machine:
 *
 *   checking → (on mount) reads hash + waits for PASSWORD_RECOVERY event
 *     ├─ hash has error=... → invalid  (clean hash, show expired-link UI)
 *     ├─ PASSWORD_RECOVERY fires       → ready   (show password form)
 *     └─ any other auth event / direct visit / timeout → invalid
 *
 *   ready    → user submits new password → (success) → updated
 *   updated  → show success state, navigate to /
 *
 * pendingInviteToken (localStorage) is never touched here.
 */

type RecoveryState = 'checking' | 'invalid' | 'ready' | 'updated';

/** Read one URL-hash param without logging the full hash. */
function getHashParam(key: string): string | null {
  try {
    return new URLSearchParams(window.location.hash.replace(/^#/, '')).get(key);
  } catch { return null; }
}

/** True when the hash contains a Supabase auth-error fragment. */
function hashHasAuthError(): boolean {
  const h = window.location.hash;
  return h.includes('error=') || h.includes('error_code=');
}

export function UpdatePasswordScreen() {
  // Synchronous init: if the hash already has an error we can skip the
  // loading state entirely.
  const [recoveryState, setRecoveryState] = useState<RecoveryState>(() =>
    hashHasAuthError() ? 'invalid' : 'checking'
  );
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [cancelling, setCancelling]           = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  // ── Auth-state detection (mount only) ─────────────────────────────────────
  useEffect(() => {
    // Case A: error hash — clean the fragment, stay in 'invalid'.
    if (hashHasAuthError()) {
      if (import.meta.env.DEV) {
        const code = getHashParam('error_code') ?? getHashParam('error') ?? 'unknown';
        console.debug('[UpdatePasswordScreen] link error code:', code);
      }
      // Strip the sensitive fragment from the address bar.
      // Component stays mounted because App.tsx now routes by pathname only.
      window.history.replaceState({}, '', '/update-password');
      return;
    }

    // Case B/C: wait for the PASSWORD_RECOVERY auth event.
    // If a valid recovery token was in the URL, Supabase has already started
    // processing it; the event will fire momentarily.
    // Any non-recovery event (INITIAL_SESSION, SIGNED_IN, etc.) means there
    // is no valid recovery session — mark invalid after a brief delay so that
    // PASSWORD_RECOVERY can arrive right after if they fire in quick succession.
    let recoveryReceived = false;
    const pending: ReturnType<typeof setTimeout>[] = [];

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, _session) => {
        if (event === 'PASSWORD_RECOVERY') {
          recoveryReceived = true;
          // Supabase has consumed the recovery token — safe to clean the hash.
          window.history.replaceState({}, '', '/update-password');
          // Transition only out of 'checking'; never overwrite 'updated'.
          setRecoveryState((curr) => curr === 'checking' ? 'ready' : curr);
        } else if (event !== 'USER_UPDATED' && event !== 'TOKEN_REFRESHED') {
          // Non-recovery, non-update events → no valid recovery session.
          // Short delay in case PASSWORD_RECOVERY is about to arrive next.
          const t = setTimeout(() => {
            if (!recoveryReceived) {
              setRecoveryState((curr) => curr === 'checking' ? 'invalid' : curr);
            }
          }, 200);
          pending.push(t);
        }
      }
    );

    // Safety timeout: if the Supabase client never fires any event (rare edge
    // case), stop waiting after 5 s and show the invalid-link screen.
    const safety = setTimeout(() => {
      setRecoveryState((curr) => curr === 'checking' ? 'invalid' : curr);
    }, 5000);

    return () => {
      subscription.unsubscribe();
      pending.forEach(clearTimeout);
      clearTimeout(safety);
    };
  }, []); // mount only — intentional empty deps

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password)                    { setError('New password is required.');              return; }
    if (password.length < 6)          { setError('Password must be at least 6 characters.'); return; }
    if (!confirmPassword)             { setError('Please confirm your new password.');      return; }
    if (password !== confirmPassword) { setError('Passwords do not match.');                return; }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // Clean path before showing success so a reload lands on '/'.
      window.history.replaceState({}, '', '/');
      setRecoveryState('updated');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to update password. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    window.history.replaceState({}, '', '/');
    await supabase.auth.signOut().catch(() => null);
    // Full navigation so App re-evaluates pathname (now '/') and shows AuthScreen.
    window.location.assign('/');
  };

  const requestNewLink = () => {
    // Write a one-time hint so AuthScreen opens directly in forgot-password mode.
    try { sessionStorage.setItem('sh_auth_next', 'forgot'); } catch { /* ignore */ }
    window.location.assign('/');
  };

  const backToSignIn = () => { window.location.assign('/'); };

  // ── Render ────────────────────────────────────────────────────────────────

  // Loading: waiting for Supabase auth events to determine recovery validity.
  if (recoveryState === 'checking') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#5b5bd6] animate-spin" />
      </div>
    );
  }

  // Invalid / expired / direct-visit: show a clear error with next steps.
  if (recoveryState === 'invalid') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-[#ef4444]/15 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-[#ef4444]" />
          </div>
          <h2 className="text-xl text-[#e4e4e7] mb-3">
            This reset link is invalid or has expired
          </h2>
          <p className="text-sm text-[#8b8b9e] mb-6 leading-relaxed">
            Request a new password-reset link and use the newest email to
            continue.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={requestNewLink}
              className="w-full py-3 rounded-lg text-sm text-white font-semibold transition-all"
              style={{
                background: 'linear-gradient(135deg, #5b5bd6 0%, #7c7ce8 100%)',
                boxShadow: '0 4px 16px rgba(91,91,214,0.4)',
              }}
            >
              Request a new link
            </button>
            <button
              onClick={backToSignIn}
              className="w-full py-2.5 rounded-lg text-sm text-[#8b8b9e] hover:text-[#e4e4e7] transition-colors"
            >
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Updated: password changed successfully.
  if (recoveryState === 'updated') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 mb-4"><IconMusic /></div>
            <h1 className="text-[#e4e4e7] text-xl">Streaming Helper</h1>
          </div>
          <div className="bg-[#0f0f14] border border-[#1f1f28] rounded-2xl p-6 text-center">
            <div className="w-12 h-12 bg-[#4ade80]/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-6 h-6 text-[#4ade80]" />
            </div>
            <h2 className="text-lg text-[#e4e4e7] mb-2">Password updated</h2>
            <p className="text-sm text-[#8b8b9e] mb-5">
              Your password has been changed. Sign in with your new password.
            </p>
            <button
              onClick={() => window.location.assign('/')}
              className="w-full py-2.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] rounded-lg text-sm text-white transition-colors"
            >
              Continue to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Ready: valid recovery session confirmed — show the password form.
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 mb-4">
            <IconMusic />
          </div>
          <h1 className="text-[#e4e4e7] text-xl">Streaming Helper</h1>
          <p className="text-sm text-[#8b8b9e] mt-1">Set a new password</p>
        </div>

        {/* Card */}
        <div className="bg-[#0f0f14] border border-[#1f1f28] rounded-2xl p-6">
          <p className="text-sm text-[#8b8b9e] mb-5">
            Choose a new password for your account. It must be at least 6
            characters.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* New password */}
            <div>
              <label className="block text-xs text-[#8b8b9e] mb-1.5">
                New password <span className="text-[#ef4444]">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8b9e]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoFocus
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full bg-[#1a1a22] border border-[#2a2a35] rounded-lg pl-10 pr-10 py-2.5 text-sm text-[#e4e4e7] placeholder:text-[#8b8b9e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b8b9e] hover:text-[#e4e4e7] transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-xs text-[#8b8b9e] mb-1.5">
                Confirm password <span className="text-[#ef4444]">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8b9e]" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Same password again"
                  className="w-full bg-[#1a1a22] border border-[#2a2a35] rounded-lg pl-10 pr-10 py-2.5 text-sm text-[#e4e4e7] placeholder:text-[#8b8b9e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b8b9e] hover:text-[#e4e4e7] transition-colors"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || cancelling}
              className="w-full py-2.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Updating password…' : 'Set new password'}
            </button>
          </form>
        </div>

        {/* Cancel — signs out and navigates to sign-in */}
        <p className="text-center text-xs text-[#8b8b9e] mt-6">
          <button
            onClick={handleCancel}
            disabled={loading || cancelling}
            className="text-[#5b5bd6] hover:text-[#7c7ce8] disabled:opacity-50 transition-colors"
          >
            {cancelling ? 'Signing out…' : 'Cancel — back to sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
