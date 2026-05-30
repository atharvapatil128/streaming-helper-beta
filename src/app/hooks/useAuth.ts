import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

const RECOVERY_PATH = '/update-password';

interface AuthState {
  user: User | null;
  loading: boolean;
  /**
   * True when the app is handling a password-reset email link.
   *
   * Initialized SYNCHRONOUSLY from window.location.pathname so the guard in
   * App.tsx fires on the very first render — before any async getSession()
   * Promise resolves. This prevents getSession() from setting loading=false
   * (and rendering the dashboard) before the PASSWORD_RECOVERY event arrives.
   *
   * Also updated by onAuthStateChange for belt-and-suspenders reliability.
   */
  isPasswordRecovery: boolean;
}

export function useAuth(): AuthState {
  const [user, setUser]     = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Key fix: synchronous initialization from the URL ─────────────────────
  // If the user landed on /update-password, treat this as a recovery session
  // immediately — without waiting for any async event.  This prevents the
  // race where getSession() resolves first and renders the dashboard before
  // the PASSWORD_RECOVERY auth event fires.
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(
    () => window.location.pathname === RECOVERY_PATH
  );

  useEffect(() => {
    let mounted = true;

    if (import.meta.env.DEV) {
      console.debug('[useAuth] init — pathname:', window.location.pathname,
        '| isPasswordRecovery (sync):', window.location.pathname === RECOVERY_PATH);
    }

    // Resolve the current session. We still set user here so the rest of the
    // app has the correct user object once loading finishes.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      if (!mounted) return;
      setLoading(false);
    });

    // Keep state in sync. Also updates isPasswordRecovery via the auth event
    // so the flag is accurate even if the URL changes later.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      const recovery = event === 'PASSWORD_RECOVERY';

      if (import.meta.env.DEV && (recovery || window.location.pathname === RECOVERY_PATH)) {
        console.debug('[useAuth] auth event:', event,
          '| pathname:', window.location.pathname,
          '| isPasswordRecovery:', recovery);
      }

      setUser(session?.user ?? null);
      setLoading(false);
      setIsPasswordRecovery(recovery);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading, isPasswordRecovery };
}
