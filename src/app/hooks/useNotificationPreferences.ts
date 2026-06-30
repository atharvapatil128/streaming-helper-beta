import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ensureNotificationPreferences,
  fetchNotificationPreferences,
  updateFriendRequestEmailsEnabled,
  updateRecommendationEmailsEnabled,
} from '../../lib/notificationPreferences';

const PREF_UPDATE_ERROR =
  'Your email preference couldn\u2019t be updated. Please try again.';
const PREF_LOAD_ERROR =
  'Could not load notification preferences.';

export function useNotificationPreferences() {
  const [recommendationEmailsEnabled, setRecommendationEmailsEnabled] = useState<boolean | null>(null);
  const [friendRequestEmailsEnabled, setFriendRequestEmailsEnabled]   = useState<boolean | null>(null);
  const [loading, setLoading]   = useState(true);
  const [loaded, setLoaded]     = useState(false);
  const [savingField, setSavingField] = useState<'recommendation' | 'friend_request' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [userId, setUserId]     = useState<string | null>(null);

  const fetchGenRef = useRef(0);
  const writeGenRef = useRef(0);
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Invalidate in-flight work when the authenticated user changes or signs out.
  useEffect(() => {
    if (prevUserIdRef.current === userId) return;
    prevUserIdRef.current = userId;

    fetchGenRef.current += 1;
    writeGenRef.current += 1;
    setSavingField(null);
    setSaveError(null);
    setLoadError(null);
    setLoaded(false);
    setRecommendationEmailsEnabled(null);
    setFriendRequestEmailsEnabled(null);

    if (!userId) {
      setLoading(false);
    }
  }, [userId]);

  const refetch = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setLoaded(false);
      setRecommendationEmailsEnabled(null);
      setFriendRequestEmailsEnabled(null);
      setLoadError(null);
      setSaveError(null);
      return;
    }

    const gen = ++fetchGenRef.current;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setLoaded(false);
    setRecommendationEmailsEnabled(null);
    setFriendRequestEmailsEnabled(null);

    try {
      let prefs = await fetchNotificationPreferences(userId);
      if (!prefs) prefs = await ensureNotificationPreferences(userId);
      if (gen !== fetchGenRef.current) return;
      setRecommendationEmailsEnabled(prefs.recommendationEmailsEnabled);
      setFriendRequestEmailsEnabled(prefs.friendRequestEmailsEnabled);
      setLoaded(true);
    } catch {
      if (gen !== fetchGenRef.current) return;
      setLoadError(PREF_LOAD_ERROR);
      setLoaded(false);
    } finally {
      if (gen === fetchGenRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const updateRecommendationEmailsEnabledFn = useCallback(
    async (value: boolean) => {
      if (!userId || !loaded || savingField) return;

      const prev = recommendationEmailsEnabled;
      const gen = ++writeGenRef.current;
      setSavingField('recommendation');
      setSaveError(null);
      setRecommendationEmailsEnabled(value);

      try {
        await updateRecommendationEmailsEnabled(userId, value);
        if (gen !== writeGenRef.current) return;
      } catch {
        if (gen !== writeGenRef.current) return;
        setRecommendationEmailsEnabled(prev);
        setSaveError(PREF_UPDATE_ERROR);
      } finally {
        if (gen === writeGenRef.current) setSavingField(null);
      }
    },
    [userId, loaded, savingField, recommendationEmailsEnabled]
  );

  const updateFriendRequestEmailsEnabledFn = useCallback(
    async (value: boolean) => {
      if (!userId || !loaded || savingField) return;

      const prev = friendRequestEmailsEnabled;
      const gen = ++writeGenRef.current;
      setSavingField('friend_request');
      setSaveError(null);
      setFriendRequestEmailsEnabled(value);

      try {
        await updateFriendRequestEmailsEnabled(userId, value);
        if (gen !== writeGenRef.current) return;
      } catch {
        if (gen !== writeGenRef.current) return;
        setFriendRequestEmailsEnabled(prev);
        setSaveError(PREF_UPDATE_ERROR);
      } finally {
        if (gen === writeGenRef.current) setSavingField(null);
      }
    },
    [userId, loaded, savingField, friendRequestEmailsEnabled]
  );

  return {
    recommendationEmailsEnabled,
    friendRequestEmailsEnabled,
    loading,
    loaded,
    saving: savingField !== null,
    savingField,
    loadError,
    saveError,
    updateRecommendationEmailsEnabled: updateRecommendationEmailsEnabledFn,
    updateFriendRequestEmailsEnabled:  updateFriendRequestEmailsEnabledFn,
    refetch,
  };
}
