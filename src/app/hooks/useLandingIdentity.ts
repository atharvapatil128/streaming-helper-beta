import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type { LandingIdentity } from '../../lib/landingIdentity';

/**
 * Lightweight identity lookup for public pages. It reads only the current
 * browser session and that user's own profile row; it does not gate rendering
 * or alter the dashboard authentication flow.
 */
export function useLandingIdentity(): LandingIdentity {
  const [identity, setIdentity] = useState<LandingIdentity>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    let currentUserId: string | null | undefined;

    const resolveUser = (user: User | null) => {
      const userId = user?.id ?? null;
      if (currentUserId === userId) return;

      currentUserId = userId;
      const requestGeneration = ++generation;

      if (!user) {
        setIdentity({ status: 'signed-out' });
        return;
      }

      setIdentity({ status: 'checking' });
      void supabase
        .from('profiles')
        .select('display_name, username')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled || generation !== requestGeneration) return;
          setIdentity({
            status: 'signed-in',
            displayName: data?.display_name ?? null,
            username: data?.username ?? null,
          });
        })
        .catch(() => {
          if (cancelled || generation !== requestGeneration) return;
          setIdentity({
            status: 'signed-in',
            displayName: null,
            username: null,
          });
        });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => resolveUser(session?.user ?? null),
    );

    void supabase.auth.getSession()
      .then(({ data: { session } }) => resolveUser(session?.user ?? null))
      .catch(() => resolveUser(null));

    return () => {
      cancelled = true;
      generation += 1;
      subscription.unsubscribe();
    };
  }, []);

  return identity;
}

