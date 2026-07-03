import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export interface Profile {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export function useProfile() {
  const [profile, setProfile]   = useState<Profile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;

      if (!session?.user) {
        setLoading(false);
        return;
      }

      const user = session.user;
      try {
        const { data, error: dbError } = await supabase
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('id', user.id)
          .single();

        if (dbError) throw dbError;

        if (!cancelled) {
          setProfile({
            email:       user.email ?? '',
            displayName: data?.display_name ?? null,
            avatarUrl:   data?.avatar_url ?? null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load profile.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, []);

  /** Persist a new display name to the profiles table. */
  const updateDisplayName = useCallback(async (name: string): Promise<void> => {
    setSaving(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not signed in.');

      const trimmed = name.trim() || null;

      // updated_at is intentionally not sent: it is maintained by a database
      // trigger (migration 021), and the client-side UPDATE grant is limited
      // to display_name/avatar_url once migration 022 is applied.
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ display_name: trimmed })
        .eq('id', session.user.id);

      if (dbError) throw dbError;

      setProfile((prev) => (prev ? { ...prev, displayName: trimmed } : prev));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save display name.';
      setError(msg);
      throw new Error(msg);
    } finally {
      setSaving(false);
    }
  }, []);

  return { profile, loading, error, saving, updateDisplayName };
}
