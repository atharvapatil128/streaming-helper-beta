import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Loader2, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import IconMusic from '../../imports/IconMusic';

type AuthMode = 'signin' | 'signup' | 'forgot';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function AuthScreen() {
  const [mode, setMode]               = useState<AuthMode>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [signupSent, setSignupSent]   = useState(false);
  const [forgotSent, setForgotSent]   = useState(false);

  // ── Client-side validation ────────────────────────────────────────────────
  const validate = (): string | null => {
    if (mode === 'signup' && !displayName.trim()) return 'Display name is required.';
    if (!email.trim())       return 'Email address is required.';
    if (!isValidEmail(email)) return 'Enter a valid email address.';
    if (mode === 'forgot')   return null; // no password needed
    if (!password)           return 'Password is required.';
    if (mode === 'signup' && password.length < 6)
      return 'Password must be at least 6 characters.';
    return null;
  };

  // ── Submit handler ────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            // Passed into raw_user_meta_data; the handle_new_user trigger
            // reads display_name from there and writes it to profiles.
            data: { display_name: displayName.trim() },
          },
        });
        if (error) throw error;
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
      // Supabase can return "email rate limit exceeded" when too many reset
      // emails are requested in a short window. Show a human-friendly message.
      const message =
        mode === 'forgot' && raw.toLowerCase().includes('rate limit')
          ? 'Too many reset emails have been requested. Please wait a few minutes before trying again.'
          : raw;
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // ── Mode helpers ──────────────────────────────────────────────────────────
  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setSignupSent(false);
    setForgotSent(false);
    if (next !== 'signup') setDisplayName('');
  };

  // ── Signup confirmation screen (email sent) ───────────────────────────────
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

  // ── Shared logo header ────────────────────────────────────────────────────
  const logoSubtitle =
    mode === 'forgot'
      ? 'Reset your password'
      : mode === 'signup'
        ? 'Create a new account'
        : 'Sign in to your account';

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 mb-4">
            <IconMusic />
          </div>
          <h1 className="text-[#e4e4e7] text-xl">Streaming Helper</h1>
          <p className="text-sm text-[#8b8b9e] mt-1">{logoSubtitle}</p>
        </div>

        {/* Card */}
        <div className="bg-[#0f0f14] border border-[#1f1f28] rounded-2xl p-6">

          {/* ── Forgot password: success state ─────────────────────────── */}
          {forgotSent ? (
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

          /* ── Forgot password: email form ───────────────────────────────── */
          ) : mode === 'forgot' ? (
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
                      className="w-full bg-[#1a1a22] border border-[#2a2a35] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#e4e4e7] placeholder:text-[#8b8b9e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
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
                  className="w-full py-2.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors flex items-center justify-center gap-2"
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

          /* ── Sign in / Sign up ─────────────────────────────────────────── */
          ) : (
            <>
              {/* Mode toggle */}
              <div className="flex gap-1 p-1 bg-[#1a1a22] rounded-lg mb-6">
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className={`flex-1 py-2 rounded-md text-sm transition-colors ${
                    mode === 'signin'
                      ? 'bg-[#5b5bd6] text-white'
                      : 'text-[#8b8b9e] hover:text-[#e4e4e7]'
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className={`flex-1 py-2 rounded-md text-sm transition-colors ${
                    mode === 'signup'
                      ? 'bg-[#5b5bd6] text-white'
                      : 'text-[#8b8b9e] hover:text-[#e4e4e7]'
                  }`}
                >
                  Sign up
                </button>
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
                        className="w-full bg-[#1a1a22] border border-[#2a2a35] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#e4e4e7] placeholder:text-[#8b8b9e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
                      />
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
                      className="w-full bg-[#1a1a22] border border-[#2a2a35] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#e4e4e7] placeholder:text-[#8b8b9e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  {/* Label row — "Forgot password?" link sits on the right for sign-in */}
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
                      className="w-full bg-[#1a1a22] border border-[#2a2a35] rounded-lg pl-10 pr-10 py-2.5 text-sm text-[#e4e4e7] placeholder:text-[#8b8b9e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b8b9e] hover:text-[#e4e4e7] transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword
                        ? <EyeOff className="w-4 h-4" />
                        : <Eye className="w-4 h-4" />
                      }
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
                  className="w-full py-2.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white transition-colors flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading
                    ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
                    : (mode === 'signin' ? 'Sign in' : 'Create account')
                  }
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer link — only shown for sign in / sign up, not forgot */}
        {mode !== 'forgot' && !forgotSent && (
          <p className="text-center text-xs text-[#8b8b9e] mt-6">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
              className="text-[#5b5bd6] hover:text-[#7c7ce8] transition-colors"
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
