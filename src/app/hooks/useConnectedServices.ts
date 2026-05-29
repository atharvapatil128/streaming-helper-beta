import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  fetchConnectedServices,
  connectService,
  toggleConnectedService,
} from '../../lib/connectedServices';
import type { Permission } from '../../types';

export function useConnectedServices() {
  const [services, setServices]   = useState<Permission[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [userId, setUserId]       = useState<string | null>(null);

  // Resolve the current user once
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user.id ?? null);
    });
  }, []);

  // Load services whenever the userId is available
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetchConnectedServices(userId)
      .then(setServices)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId]);

  /** Toggle a service's connected status. Optimistically updates local state. */
  const toggle = useCallback(
    async (id: string) => {
      const target = services.find((s) => s.id === id);
      if (!target) return;

      const next = !target.isConnected;

      // Optimistic update
      setServices((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isConnected: next } : s))
      );

      try {
        await toggleConnectedService(id, next);
      } catch (err) {
        // Roll back on failure
        setError(err instanceof Error ? err.message : 'Failed to update service.');
        setServices((prev) =>
          prev.map((s) => (s.id === id ? { ...s, isConnected: target.isConnected } : s))
        );
      }
    },
    [services]
  );

  /** Add a new service (or reactivate a previously disconnected one). */
  const connect = useCallback(
    async (serviceName: string): Promise<void> => {
      if (!userId) throw new Error('Not signed in.');

      const updated = await connectService(userId, serviceName);

      setServices((prev) => {
        const existingIdx = prev.findIndex((s) => s.service === updated.service);
        if (existingIdx !== -1) {
          const next = [...prev];
          next[existingIdx] = updated;
          return next;
        }
        return [...prev, updated];
      });
    },
    [userId]
  );

  return { services, loading, error, toggle, connect };
}
