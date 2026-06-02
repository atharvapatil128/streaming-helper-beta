import { useState } from 'react';
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import IconMusic from '../../imports/IconMusic';

/**
 * Shown when the user arrives via a Supabase "reset your password" email link.
 * useAuth detects this synchronously from window.location.pathname (/update-password)
 * AND via the PASSWORD_RECOVERY auth event.
 *
 * On success:  updateUser() → USER_UPDATED event → isPasswordRecovery=false in useAuth
 *              → App.tsx unmounts this screen and shows the dashboard.
 *              URL is also cleaned back to "/" so a reload doesn't re-trigger recovery.
 *
 * On cancel:   Signs the user out and cleans the URL, returning to the sign-in screen.
 */
export function UpdatePasswordScreen() {
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]       = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [cancelling, setCancelling]           = useState(false);
  const [error, setError]                     = useState<string | null>(null);

  // Clean the recovery hash/path from the URL so a hard-reload won't re-enter
  // recovery mode after the user has already acted on it.
  const cleanUrl = () => window.history.replaceState({}, '', '/');

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

      // Clean the URL before the auth event fires so a reload lands on "/".
      cleanUrl();
      // USER_UPDATED fires → isPasswordRecovery becomes false in useAuth
      // → App.tsx unmounts this screen and renders the main dashboard.
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
    cleanUrl();
    // Sign out so the recovery session is cleared and the sign-in screen appears.
    await supabase.auth.signOut().catch(() => null);
    // SIGNED_OUT event fires → user=null, isPasswordRecovery=false in useAuth
    // → App.tsx shows AuthScreen automatically.
    setCancelling(false);
  };

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

        {/* Cancel — signs out and returns to sign-in */}
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
