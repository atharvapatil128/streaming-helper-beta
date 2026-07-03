//import { useState } from 'react';
import React, { useState, useEffect } from "react";
import { Mail, Lock, Eye, EyeOff, Loader2, User, Users, Share2, Chrome, ArrowRight, Tv, AtSign, AlertCircle, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  validateUsername,
  savePendingSignupUsername,
} from '../../lib/usernames';
import IconMusic from '../../imports/IconMusic';

type AuthMode = 'signin' | 'signup' | 'forgot';

/** Client-side format state for the signup username field (no RPC while anonymous). */
type SignupUsernameFormatState = 'idle' | 'invalid' | 'formatValid';

const CHROME_EXTENSION_URL = 'https://chromewebstore.google.com/detail/fnbhllmhjamdfnfjlmipkcefbjnfnhej?utm_source=item-share-cb';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// ── Left panel — product explanation ─────────────────────────────────────────
// Rendered only on the sign-in / sign-up screen (not forgot or signupSent).
const steps = [
  {
    icon: Users,
    title: 'Add friends',
    desc: 'Invite people whose recommendations you trust.',
  },
  {
    icon: Share2,
    title: 'Share recommendations',
    desc: 'Send and receive shows or movies across platforms.',
  },
  {
    icon: Chrome,
    title: 'Use the extension',
    desc: 'Open Streaming Helper on Netflix, Prime Video, and more.',
  },
];

function LeftPanel() {
  return (
    <div className="flex-1 flex flex-col gap-9 lg:pr-4">
      {/* Logo + wordmark */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 shrink-0">
          <IconMusic />
        </div>
        <span className="text-[#e4e4e7] text-xl font-semibold tracking-tight select-none">
          Streaming Helper
        </span>
      </div>

      {/* Headline */}
      <div className="flex flex-col gap-5">
        <h1
          className="font-bold leading-tight tracking-tight"
          style={{ fontSize: 'clamp(30px, 3.2vw, 48px)', letterSpacing: '-0.03em', color: '#e4e4e7' }}
        >
          Friend-powered
          <br />
          <span
            style={{
              background: 'linear-gradient(135deg, #7c7ce8 0%, #5b5bd6 50%, #a78bfa 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            recommendations
          </span>
          <br />
          while you stream.
        </h1>
        <p className="text-[#8b8b9e] text-[15px] leading-relaxed max-w-[420px]">
          Add friends, save comfort titles, and use the Chrome extension to decide what
          to watch without endless scrolling.
        </p>
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-5">
        {steps.map(({ icon: Icon, title, desc }, i) => (
          <div key={title} className="flex items-start gap-4">
            <div
              className="shrink-0 flex items-center justify-center mt-0.5"
              style={{
                width: 40,
                height: 40,
                borderRadius: 11,
                background: 'rgba(91,91,214,0.14)',
                border: '1px solid rgba(91,91,214,0.28)',
              }}
            >
              <Icon size={18} color="#7c7ce8" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[15px] font-medium text-[#e4e4e7]">
                <span className="text-[#5b5bd6] font-semibold">{i + 1}.</span>{' '}
                {title}
              </span>
              <span className="text-[14px] text-[#6b6b7e] leading-snug">{desc}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Chrome Extension CTA */}
      <div className="flex flex-col gap-2">
        <a
          href={CHROME_EXTENSION_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2.5 w-fit transition-all"
          style={{
            background: 'rgba(91,91,214,0.13)',
            border: '1px solid rgba(91,91,214,0.32)',
            borderRadius: 10,
            padding: '10px 16px',
            color: '#c4c4e8',
            fontSize: 14,
            fontWeight: 500,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(91,91,214,0.22)';
            (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(91,91,214,0.5)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(91,91,214,0.13)';
            (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(91,91,214,0.32)';
          }}
        >
          <Chrome size={16} color="#7c7ce8" />
          Get the Chrome Extension
        </a>
        <span className="text-[12px] text-[#4a4a5e]"></span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface AuthScreenProps {
  /** When set, this is an invitation signup/login. Used to scope emailRedirectTo
   *  back to the invite landing page. Ordinary auth leaves this undefined. */
  inviteToken?: string;
  /** Initial auth mode (defaults to 'signin'). */
  initialMode?: AuthMode;
  /** Optional back affordance (e.g. return to the invitation landing screen). */
  onBack?: () => void;
}

export function AuthScreen({ inviteToken, initialMode, onBack }: AuthScreenProps = {}) {
  // Read a one-time sessionStorage hint written by UpdatePasswordScreen's
  // "Request a new link" action. Consumed immediately so it only fires once.
  const [mode, setMode] = useState<AuthMode>(() => {
    if (initialMode) return initialMode;
    try {
      const hint = sessionStorage.getItem('sh_auth_next');
      if (hint === 'forgot' || hint === 'signin' || hint === 'signup') {
        sessionStorage.removeItem('sh_auth_next');
        return hint as AuthMode;
      }
    } catch { /* ignore — sessionStorage unavailable */ }
    return 'signin';
  });
  const [displayName, setDisplayName] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [usernameFormatState, setUsernameFormatState] =
    useState<SignupUsernameFormatState>('idle');
  const [usernameValidationMessage, setUsernameValidationMessage] =
    useState<string | null>(null);
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [signupSent, setSignupSent]   = useState(false);
  const [forgotSent, setForgotSent]   = useState(false);
  // Set when signup detects the email already belongs to a confirmed account.
  // With email confirmation enabled, Supabase returns a fake user (no error)
  // with identities: [] instead of the real object. With confirmation disabled
  // it returns the "User already registered" error.
  const [existingAccount, setExistingAccount] = useState(false);

  // ── Signup username: client-side format validation only ───────────────────
  // check_username_available requires an authenticated session (migration 021).
  // Availability is confirmed authoritatively by claim_username() after email
  // verification — no username RPCs are made during anonymous signup.
  useEffect(() => {
    if (mode !== 'signup') return;

    if (!signupUsername.trim()) {
      setUsernameFormatState('idle');
      setUsernameValidationMessage(null);
      return;
    }

    const validated = validateUsername(signupUsername);
    if (!validated.valid) {
      setUsernameFormatState('invalid');
      setUsernameValidationMessage(validated.message);
      return;
    }

    setUsernameValidationMessage(null);
    setUsernameFormatState('formatValid');
  }, [signupUsername, mode]);

  // ── Client-side validation ─────────────────────────────────────────────────
  const validate = (): string | null => {
    if (mode === 'signup' && !displayName.trim()) return 'Display name is required.';
    if (mode === 'signup') {
      const validated = validateUsername(signupUsername);
      if (!validated.valid) return validated.message;
    }
    if (!email.trim())        return 'Email address is required.';
    if (!isValidEmail(email)) return 'Enter a valid email address.';
    if (mode === 'forgot')    return null;
    if (!password)            return 'Password is required.';
    if (mode === 'signup' && password.length < 6)
      return 'Password must be at least 6 characters.';
    return null;
  };

  // ── Submit handler ─────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    try {
      if (mode === 'signup') {
        // Invitation signups return to /invite/{token} after email confirmation,
        // using the CURRENT origin (localhost in dev, production domain in prod).
        // Ordinary signups leave emailRedirectTo unset (unchanged behavior).
        const options: { data: Record<string, string>; emailRedirectTo?: string } = {
          // Passed into raw_user_meta_data; the handle_new_user trigger
          // reads display_name from there and writes it to profiles.
          data: { display_name: displayName.trim() },
        };
        if (inviteToken) {
          options.emailRedirectTo = `${window.location.origin}/invite/${inviteToken}`;
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options,
        });
        // Fallback: email confirmation disabled → Supabase returns this error.
        if (error) {
          if (error.message === 'User already registered') {
            setExistingAccount(true);
            return;
          }
          throw error;
        }
        // Primary signal (email confirmation enabled): Supabase returns a fake
        // user object with identities: [] to avoid leaking whether an account
        // exists. An empty identities array is the documented indicator.
        if (data.user?.identities?.length === 0) {
          setExistingAccount(true);
          return;
        }
        // Persist the desired username locally (scoped to this signup email)
        // so the post-confirmation session can claim it through
        // claim_username(). It is NOT sent as signup metadata — the username
        // is only authoritative once claimed after authentication.
        const desiredUsername = validateUsername(signupUsername);
        if (desiredUsername.valid) {
          savePendingSignupUsername(email.trim(), desiredUsername.username);
        }
        setSignupSent(true);

      } else if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        // useAuth in App.tsx picks up the session via onAuthStateChange.

      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${window.location.origin}/update-password` }
        );
        if (error) throw error;
        setForgotSent(true);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Something went wrong.';
      const message =
        mode === 'forgot' && raw.toLowerCase().includes('rate limit')
          ? 'Too many reset emails have been requested. Please wait a few minutes before trying again.'
          : raw;
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // ── Mode helpers ───────────────────────────────────────────────────────────
  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setSignupSent(false);
    setForgotSent(false);
    setExistingAccount(false);
    if (next !== 'signup') {
      setDisplayName('');
      setSignupUsername('');
      setUsernameFormatState('idle');
      setUsernameValidationMessage(null);
    }
  };

  // ── Existing-account screen — shown when signup detects a duplicate email ──
  // Email is preserved so Sign in / Reset password can reuse it.
  // inviteToken prop is unchanged — invitation context is never lost.
  if (existingAccount) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        {onBack && (
          <button
            onClick={onBack}
            className="absolute top-5 left-5 z-20 text-sm text-[#8b8b9e] hover:text-[#e4e4e7] transition-colors"
          >
            ← Back to invitation
          </button>
        )}
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-[#5b5bd6]/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <User className="w-8 h-8 text-[#5b5bd6]" />
          </div>
          <h2 className="text-xl text-[#e4e4e7] mb-3">You already have an account</h2>
          <p className="text-sm text-[#8b8b9e] mb-6 leading-relaxed">
            An account already exists with{' '}
            <span className="text-[#e4e4e7]">{email}</span>.{' '}
            Sign in instead, or reset your password if you can't remember it.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                // Preserve email; switch to sign-in.
                setExistingAccount(false);
                setMode('signin');
                setError(null);
                setSignupSent(false);
                setForgotSent(false);
              }}
              className="w-full py-3 rounded-lg text-sm text-white font-semibold transition-all"
              style={{
                background: 'linear-gradient(135deg, #5b5bd6 0%, #7c7ce8 100%)',
                boxShadow: '0 4px 16px rgba(91,91,214,0.4)',
              }}
            >
              Sign in
            </button>
            <button
              onClick={() => {
                // Preserve email; switch to forgot-password.
                setExistingAccount(false);
                setMode('forgot');
                setError(null);
                setSignupSent(false);
                setForgotSent(false);
              }}
              className="w-full py-2.5 rounded-lg text-sm text-[#e4e4e7] bg-[#1f1f28] hover:bg-[#2a2a35] transition-colors"
            >
              Reset password
            </button>
            <button
              onClick={() => {
                // Clear email; return to signup so a different address can be entered.
                setExistingAccount(false);
                setMode('signup');
                setEmail('');
                setError(null);
              }}
              className="text-sm text-[#8b8b9e] hover:text-[#e4e4e7] transition-colors py-1"
            >
              Use another email
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Signup confirmation screen — full-page, no product panel needed ────────
  if (signupSent) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-[#5b5bd6]/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Mail className="w-8 h-8 text-[#5b5bd6]" />
          </div>
          <h2 className="text-xl text-[#e4e4e7] mb-3">Check your email</h2>
          <p className="text-sm text-[#8b8b9e] mb-6 leading-relaxed">
            We sent a confirmation link to{' '}
            <span className="text-[#e4e4e7]">{email}</span>.{' '}
            Click it to activate your account, then come back and sign in.
          </p>
          <button
            onClick={() => switchMode('signin')}
            className="text-sm text-[#5b5bd6] hover:text-[#7c7ce8] transition-colors"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  // ── Right column — auth card content ──────────────────────────────────────
  const cardContent = (() => {
    // Forgot password: success state
    if (forgotSent) {
      return (
        <div className="text-center py-2">
          <div className="w-12 h-12 bg-[#5b5bd6]/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Mail className="w-6 h-6 text-[#5b5bd6]" />
          </div>
          <h3 className="text-[#e4e4e7] mb-2">Reset link sent</h3>
          <p className="text-sm text-[#8b8b9e] mb-6 leading-relaxed">
            If an account exists for{' '}
            <span className="text-[#e4e4e7]">{email}</span>, we've sent a
            password reset link. Check your inbox.
          </p>
          <button
            onClick={() => switchMode('signin')}
            className="text-sm text-[#5b5bd6] hover:text-[#7c7ce8] transition-colors"
          >
            Back to sign in
          </button>
        </div>
      );
    }

    // Forgot password: email form
    if (mode === 'forgot') {
      return (
        <>
          <p className="text-sm text-[#8b8b9e] mb-5">
            Enter the email address for your account and we'll send a
            password reset link.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-[#8b8b9e] mb-1.5">
                Email address <span className="text-[#ef4444]">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8b9e]" />
                <input
                  type="email"
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-[#0a0a0f] border border-[#2a2a35] rounded-lg pl-10 pr-4 py-3 text-sm text-[#e4e4e7] placeholder:text-[#5b5b6e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg text-sm text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
              style={{
                background: 'linear-gradient(135deg, #5b5bd6 0%, #7c7ce8 100%)',
                boxShadow: '0 4px 16px rgba(91,91,214,0.4)',
              }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="w-full text-sm text-[#8b8b9e] hover:text-[#e4e4e7] transition-colors py-1"
            >
              Back to sign in
            </button>
          </form>
        </>
      );
    }

    // Sign in / Sign up
    return (
      <>
        {/* Card accent row */}
        <div className="flex items-center gap-2 mb-6">
          <div
            className="flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #5b5bd6, #7c7ce8)',
            }}
          >
            <Tv size={15} color="#fff" />
          </div>
          <span className="text-[#c4c4d4] text-sm font-medium">
            {mode === 'signin' ? 'Welcome back' : 'Get started free'}
          </span>
        </div>

        {/* Tab switcher */}
        <div
          className="flex mb-6"
          style={{
            background: '#0a0a0f',
            border: '1px solid #1f1f28',
            borderRadius: 10,
            padding: 3,
          }}
        >
          {(['signin', 'signup'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchMode(t)}
              className="flex-1 py-2 text-sm font-medium rounded-lg transition-all"
              style={{
                background: mode === t
                  ? 'linear-gradient(135deg, #5b5bd6, #7c7ce8)'
                  : 'transparent',
                color: mode === t ? '#fff' : '#6b6b7e',
                boxShadow: mode === t ? '0 2px 8px rgba(91,91,214,0.35)' : 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {t === 'signin' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Display name — signup only */}
          {mode === 'signup' && (
            <div>
              <label className="block text-xs text-[#8b8b9e] mb-1.5">
                Display name <span className="text-[#ef4444]">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8b9e]" />
                <input
                  type="text"
                  autoFocus
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How friends will see you"
                  className="w-full bg-[#0a0a0f] border border-[#2a2a35] rounded-lg pl-10 pr-4 py-3 text-sm text-[#e4e4e7] placeholder:text-[#5b5b6e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
                />
              </div>
            </div>
          )}

          {/* Username — signup only */}
          {mode === 'signup' && (
            <div>
              <label htmlFor="signup-username" className="block text-xs text-[#8b8b9e] mb-1.5">
                Username <span className="text-[#ef4444]">*</span>
              </label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8b9e]" />
                <input
                  id="signup-username"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={30}
                  value={signupUsername}
                  onChange={(e) => setSignupUsername(e.target.value.toLowerCase())}
                  placeholder="your_username"
                  aria-describedby="signup-username-status"
                  className="w-full bg-[#0a0a0f] border border-[#2a2a35] rounded-lg pl-10 pr-4 py-3 text-sm text-[#e4e4e7] placeholder:text-[#5b5b6e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
                />
              </div>
              <p className="text-xs text-[#5b5b6e] mt-1.5">
                Your public handle for connecting with friends — 3–30 lowercase
                letters, numbers, or underscores.
              </p>
              {/* Format feedback — aria-live, icon + text (not color alone) */}
              <div id="signup-username-status" aria-live="polite" className="min-h-[18px] mt-1">
                {usernameFormatState === 'formatValid' && (
                  <span className="flex items-center gap-1.5 text-xs text-[#8b8b9e]">
                    <Info className="w-3 h-3 flex-shrink-0" />
                    Format looks good. Availability will be confirmed after you verify your email.
                  </span>
                )}
                {usernameFormatState === 'invalid' && usernameValidationMessage && (
                  <span className="flex items-center gap-1.5 text-xs text-[#ef4444]">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    {usernameValidationMessage}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs text-[#8b8b9e] mb-1.5">
              Email address <span className="text-[#ef4444]">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8b9e]" />
              <input
                type="email"
                autoFocus={mode === 'signin'}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-[#0a0a0f] border border-[#2a2a35] rounded-lg pl-10 pr-4 py-3 text-sm text-[#e4e4e7] placeholder:text-[#5b5b6e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-[#8b8b9e]">
                Password <span className="text-[#ef4444]">*</span>
              </label>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(null); }}
                  className="text-xs text-[#5b5bd6] hover:text-[#7c7ce8] transition-colors"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8b9e]" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={mode === 'signup' ? 6 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                className="w-full bg-[#0a0a0f] border border-[#2a2a35] rounded-lg pl-10 pr-10 py-3 text-sm text-[#e4e4e7] placeholder:text-[#5b5b6e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
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

          {/* Error */}
          {error && (
            <p className="text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg text-sm text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1 transition-all"
            style={{
              background: 'linear-gradient(135deg, #5b5bd6 0%, #7c7ce8 100%)',
              boxShadow: '0 4px 16px rgba(91,91,214,0.4)',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" />{mode === 'signin' ? 'Signing in…' : 'Creating account…'}</>
              : <>{mode === 'signin' ? 'Sign in' : 'Create account'}<ArrowRight size={15} /></>
            }
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-[#1f1f28]" />
          <span className="text-[11px] text-[#3a3a48]">or</span>
          <div className="flex-1 h-px bg-[#1f1f28]" />
        </div>

        {/* Switch tab hint */}
        <p className="text-center text-xs text-[#5a5a6a] leading-relaxed">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
            className="text-[#7c7ce8] hover:text-[#9090ee] font-medium transition-colors"
          >
            {mode === 'signin' ? 'Sign up for free' : 'Sign in'}
          </button>
        </p>

        {/* TOS note */}
        <p className="text-center text-[11px] text-[#3a3a48] mt-4 leading-relaxed">
          By continuing you agree to our{' '}
          <span className="text-[#5b5bd6]">Terms of Service</span> and{' '}
          <a href="/privacy" className="text-[#5b5bd6] hover:text-[#7c7ce8] underline underline-offset-2 transition-colors">
            Privacy Policy
          </a>.
        </p>

        {/* Copyright */}
        <p className="text-center text-[10px] text-[#2e2e3a] mt-3">
          &copy; 2026 Atharva Patil. All rights reserved.
        </p>
      </>
    );
  })();

  // ── Two-column layout shell ────────────────────────────────────────────────
  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden"
      style={{ background: '#0a0a0f' }}
    >
      {/* Optional back affordance — only shown when launched from the invite flow */}
      {onBack && (
        <button
          onClick={onBack}
          className="absolute top-5 left-5 z-20 text-sm text-[#8b8b9e] hover:text-[#e4e4e7] transition-colors"
        >
          ← Back to invitation
        </button>
      )}

      {/* Background blurred orbs — pure visual, pointer-events: none */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: '-12%', left: '-8%',
          width: 520, height: 520,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(91,91,214,0.18) 0%, transparent 70%)',
          filter: 'blur(48px)',
        }}
      />
      <div
        className="pointer-events-none absolute"
        style={{
          bottom: '-10%', right: '-6%',
          width: 440, height: 440,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,124,232,0.14) 0%, transparent 70%)',
          filter: 'blur(56px)',
        }}
      />
      <div
        className="pointer-events-none absolute"
        style={{
          top: '55%', left: '30%',
          width: 300, height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(91,91,214,0.07) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      <div className="relative z-10 w-full max-w-[1400px] mx-auto px-8 lg:px-16 py-10 flex flex-col lg:flex-row items-center gap-10 lg:gap-28">

        {/* Left column — product explanation; hidden on mobile to keep the form accessible */}
        <div className="hidden lg:flex flex-1">
          <LeftPanel />
        </div>

        {/* Right column — auth card */}
        <div className="w-full lg:w-auto shrink-0" style={{ maxWidth: 460 }}>
          {/* Mobile logo — shown only when left panel is hidden */}
          <div className="flex lg:hidden items-center gap-3 mb-6 justify-center">
            <div className="w-9 h-9 shrink-0">
              <IconMusic />
            </div>
            <span className="text-[#e4e4e7] text-base font-semibold tracking-tight">
              Streaming Helper
            </span>
          </div>

          <div
            style={{
              background: 'rgba(15,15,20,0.95)',
              border: '1px solid rgba(42,42,53,0.9)',
              borderRadius: 18,
              padding: '36px 32px',
              backdropFilter: 'blur(24px)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {cardContent}
          </div>
        </div>
      </div>
    </div>
  );
}
