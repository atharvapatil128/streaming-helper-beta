import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  claimUsernameRpc,
  changeUsernameRpc,
  UsernameRpcError,
} from '../../lib/usernames';

export interface Profile {
  /** Authenticated owner of this profile snapshot. Consumers must verify this
   *  matches the current auth user before acting on username state. */
  userId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** Canonical lowercase public handle. NULL until claimed (migration 021). */
  username: string | null;
  /** Timestamp of the last username claim/change; drives the 30-day cooldown. */
  usernameChangedAt: string | null;
}

export function useProfile() {
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [loading, setLoading]   = useState(true);
  /** True after the profile row for the CURRENT user finished loading. */
  const [loaded, setLoaded]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);

  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameError, setUsernameError]   = useState<string | null>(null);

  // Generation counter: incremented whenever the authenticated user changes
  // (sign-out, account switch). Async completions from a previous generation
  // must not touch state. Also guards unmount via mountedRef.
  const genRef      = useRef(0);
  const mountedRef  = useRef(true);
  // undefined = no auth state observed yet (distinct from null = signed out),
  // so the very first signed-out resolution still clears the loading state.
  const userIdRef   = useRef<string | null | undefined>(undefined);
  // Token-based lock serializing claim/change. Each operation stores a unique
  // token on start and clears the ref in `finally` ONLY if the ref still holds
  // its own token — so a stale operation from a previous account can never
  // release (or block) a newer account's operation after handleUser resets it.
  const usernameOpTokenRef = useRef<symbol | null>(null);

  const isCurrent = useCallback(
    (gen: number) => mountedRef.current && genRef.current === gen,
    []
  );

  const loadProfile = useCallback(async (userId: string, userEmail: string) => {
    const gen = genRef.current;
    setLoading(true);
    setLoaded(false);
    setError(null);
    try {
      // Own-row SELECT only — compatible with migration 022 RLS.
      const { data, error: dbError } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, username, username_changed_at')
        .eq('id', userId)
        .single();

      if (dbError) throw dbError;
      if (!isCurrent(gen)) return;

      setProfile({
        userId,
        email:             userEmail,
        displayName:       data?.display_name ?? null,
        avatarUrl:         data?.avatar_url ?? null,
        username:          data?.username ?? null,
        usernameChangedAt: data?.username_changed_at ?? null,
      });
      setLoaded(true);
    } catch (err) {
      if (!isCurrent(gen)) return;
      setError(err instanceof Error ? err.message : 'Failed to load profile.');
    } finally {
      if (isCurrent(gen)) setLoading(false);
    }
  }, [isCurrent]);

  // Track the authenticated user across page load AND runtime auth changes
  // (sign-in without reload, account switching, sign-out).
  useEffect(() => {
    // Effect-local cancellation flag. mountedRef alone is not sufficient under
    // React Strict Mode: cleanup runs, then the next effect instance sets the
    // SHARED ref back to true — after which a stale getSession() completion
    // from the first instance would pass a mountedRef-only check.
    let cancelled = false;
    mountedRef.current = true;

    const handleUser = (userId: string | null, userEmail: string | null) => {
      if (cancelled || !mountedRef.current) return;
      if (userIdRef.current === userId) return; // token refresh etc. — no reload

      userIdRef.current = userId;
      genRef.current += 1;
      // Invalidate any in-flight claim/change from the previous account so its
      // finally block can no longer clear the new account's lock.
      usernameOpTokenRef.current = null;

      // Reset all per-user state so nothing leaks across accounts.
      setProfile(null);
      setLoaded(false);
      setError(null);
      setSaving(false);
      setUsernameError(null);
      setUsernameSaving(false);

      if (userId) {
        loadProfile(userId, userEmail ?? '');
      } else {
        setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      handleUser(session?.user?.id ?? null, session?.user?.email ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (cancelled) return;
        handleUser(session?.user?.id ?? null, session?.user?.email ?? null);
      }
    );

    return () => {
      cancelled = true;
      mountedRef.current = false;
      genRef.current += 1;
      // Force the next effect instance to reload even when the session user ID
      // is unchanged (Strict Mode restart invalidates the in-flight load above).
      userIdRef.current = undefined;
      usernameOpTokenRef.current = null;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  /** Re-fetch the current user's profile row. */
  const refetch = useCallback(async (): Promise<void> => {
    const userId = userIdRef.current;
    if (!userId) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || session.user.id !== userId) return;
    await loadProfile(userId, session.user.email ?? '');
  }, [loadProfile]);

  /** Persist a new display name to the profiles table. */
  const updateDisplayName = useCallback(async (name: string): Promise<void> => {
    setSaving(true);
    setError(null);
    const gen = genRef.current;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not signed in.');

      const trimmed = name.trim() || null;

      // updated_at is maintained by a database trigger (migration 021).
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ display_name: trimmed })
        .eq('id', session.user.id);

      if (dbError) throw dbError;

      if (isCurrent(gen)) {
        setProfile((prev) => (prev ? { ...prev, displayName: trimmed } : prev));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save display name.';
      if (isCurrent(gen)) setError(msg);
      throw new Error(msg);
    } finally {
      if (isCurrent(gen)) setSaving(false);
    }
  }, [isCurrent]);

  /**
   * Shared runner for claim/change: token lock + generation guards.
   * The lock ref is cleared in `finally` only when it still holds THIS
   * operation's token, so a stale finish can't release a newer lock.
   */
  const runUsernameOp = useCallback(async (
    op: () => Promise<{ username: string; changedAt: string }>
  ): Promise<string> => {
    if (usernameOpTokenRef.current !== null) {
      throw new UsernameRpcError('UNEXPECTED');
    }
    const token = Symbol('username-op');
    usernameOpTokenRef.current = token;
    const gen = genRef.current;
    if (isCurrent(gen)) {
      setUsernameSaving(true);
      setUsernameError(null);
    }

    try {
      const result = await op();
      if (isCurrent(gen)) {
        setProfile((prev) =>
          prev
            ? { ...prev, username: result.username, usernameChangedAt: result.changedAt }
            : prev
        );
      }
      return result.username;
    } catch (err) {
      // Cross-tab race: the account already has a username the local snapshot
      // doesn't know about. Reconcile by refetching the real profile row so
      // stale local state (username: null) can't re-trigger claim prompts.
      if (
        err instanceof UsernameRpcError &&
        err.code === 'USERNAME_ALREADY_SET' &&
        isCurrent(gen)
      ) {
        await refetch().catch(() => { /* reconciliation is best-effort */ });
      }
      if (isCurrent(gen)) {
        setUsernameError(
          err instanceof UsernameRpcError
            ? err.message
            : "We couldn't save your username. Please try again."
        );
      }
      throw err;
    } finally {
      if (usernameOpTokenRef.current === token) {
        usernameOpTokenRef.current = null;
      }
      if (isCurrent(gen)) setUsernameSaving(false);
    }
  }, [isCurrent, refetch]);

  /**
   * Claim a first username through claim_username() (authoritative).
   * Throws UsernameRpcError so callers can branch on the stable code.
   */
  const claimUsername = useCallback(async (input: string): Promise<string> => {
    return runUsernameOp(async () => {
      const username = await claimUsernameRpc(input);
      return { username, changedAt: new Date().toISOString() };
    });
  }, [runUsernameOp]);

  /**
   * Change an existing username through change_username() (authoritative —
   * the database enforces the 30-day cooldown even if the client math is stale).
   */
  const changeUsername = useCallback(async (input: string): Promise<string> => {
    return runUsernameOp(() => changeUsernameRpc(input));
  }, [runUsernameOp]);

  const clearUsernameError = useCallback(() => setUsernameError(null), []);

  return {
    profile,
    loading,
    loaded,
    error,
    saving,
    updateDisplayName,
    usernameSaving,
    usernameError,
    clearUsernameError,
    claimUsername,
    changeUsername,
    refetch,
  };
}
