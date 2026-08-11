import { useState, useRef, useEffect, useMemo } from 'react';
import { Tv, Settings, Bell, Plus, Grid3x3, List, X, LogOut, Loader2, AlertCircle, HelpCircle, ListChecks, Users, ArrowUpRight, MoreHorizontal } from 'lucide-react';
import IconMusic from '../imports/IconMusic';
import { FriendSidebar } from './components/FriendSidebar';
import { SearchBar } from './components/SearchBar';
import { SuggestionCard } from './components/SuggestionCard';
import { SentRecommendationCard } from './components/SentRecommendationCard';
import { SentRecipientsDialog } from './components/SentRecipientsDialog';
import { FilterBar } from './components/FilterBar';
import { SettingsModal } from './components/SettingsModal';
import { AddFriendModal } from './components/AddFriendModal';
import { ManageFriendsModal } from './components/ManageFriendsModal';
import { AddRecommendationModal } from './components/AddRecommendationModal';
import { NotificationsDropdown } from './components/NotificationsDropdown';
import { FriendAvatar } from './components/FriendAvatar';
import { ComfortList } from './components/ComfortList';
import { DismissToast } from './components/DismissToast';
import { TitleDetailsModal } from './components/TitleDetailsModal';
import { OnboardingCard } from './components/OnboardingCard';
import { AuthScreen } from './components/AuthScreen';
import { AuthHandoffScreen } from './components/AuthHandoffScreen';
import { SignOutConfirmDialog } from './components/SignOutConfirmDialog';
import { UpdatePasswordScreen } from './components/UpdatePasswordScreen';
import { PrivacyPage } from './components/PrivacyPage';
import { InvitePage } from './components/InvitePage';
import { isInviteRoute, parseInviteToken } from '../lib/invite';
import {
  captureDeepLinkFromUrl,
  clearDeepLinkIntent,
  peekDeepLinkIntent,
} from '../lib/deepLinks';
import { fetchRecommendations } from '../lib/recommendations';
import {
  readPendingSignupUsername,
  clearPendingSignupUsername,
  UsernameRpcError,
} from '../lib/usernames';
import { UsernameClaimModal } from './components/UsernameClaimModal';
import { useAuth } from './hooks/useAuth';
import { useProfile } from './hooks/useProfile';
import { useFriends } from './hooks/useFriends';
import { useFriendRequests } from './hooks/useFriendRequests';
import { useRecommendations } from './hooks/useRecommendations';
import { useNotificationReads } from './hooks/useNotificationReads';
import { usePendingInvitations } from './hooks/usePendingInvitations';
import { useSentInvitations } from './hooks/useSentInvitations';
import { recKey, friendRequestKey } from '../lib/notificationReads';
import { supabase } from '../lib/supabase';
import type { AppNotification, Recommendation } from '../types';
import { HELP_PATH, MARKETING_PATH } from '../lib/productUrls';
import {
  groupSentRecommendations,
  type SentRecommendationGroup,
} from '../lib/sentRecommendationGroups';
import { trackAcquisitionEvent, trackMilestoneOnce } from '../lib/acquisitionAnalytics';
import { deriveActivationState } from '../lib/activationState';

export default function App() {
  const [authEntryMode, setAuthEntryMode] = useState<'forgot' | null>(
    new URLSearchParams(window.location.search).get('auth') === 'forgot'
      ? 'forgot'
      : null,
  );
  // ── All hooks must run unconditionally before any early returns ──
  const { user, loading: authLoading } = useAuth();
  // App-level own-profile state — the single authoritative source for the
  // current user's username (soft prompt, pending signup claim, Settings).
  const {
    profile: myProfile,
    loaded: myProfileLoaded,
    loading: myProfileLoading,
    usernameSaving,
    claimUsername: claimMyUsername,
    changeUsername: changeMyUsername,
  } = useProfile();
  // Ownership guard: during an account switch there can be a transient render
  // where `user` is the NEW account but `myProfile` is still the OLD account's
  // snapshot. No username logic (pending claim, soft prompt, Settings display)
  // may act on a profile that doesn't belong to the current auth user.
  const profileMatchesCurrentUser =
    !!user && !!myProfile && myProfile.userId === user.id;
  const { friends, loading: friendsLoading, error: friendsError, refetch: refetchFriends, remove: removeFriendFromDb } = useFriends();
  const {
    recommendations,
    loading: recsLoading,
    error: recsError,
    sentRecommendations,
    sentLoading,
    sentError,
    add: addRecommendation,
    dismiss: dismissRecommendation,
    undoDismiss: undoDismissRecommendation,
    deleteSent,
    refetchReceived: refetchRecommendations,
  } = useRecommendations();
  const {
    incomingRequests,
    outgoingRequests,
    sendRequest,
    acceptRequest,
    declineRequest,
    cancelRequest,
    refetch: refetchRequests,
  } = useFriendRequests({ onFriendshipCreated: refetchFriends });

  const {
    invitations:        pendingInvitations,
    respondingIds:      invitationRespondingIds,
    errors:             invitationErrors,
    lastOutcome:        inviteOutcome,
    acceptInvitation,
    declineInvitation,
    dismissForSession:  dismissInvitationForSession,
    clearLastOutcome:   clearInviteOutcome,
    refetchInvitations,
  } = usePendingInvitations({ onFriendshipCreated: refetchFriends });

  const {
    invitations:              sentInvitations,
    loading:                  sentInvitationsLoading,
    fetchError:               sentInvitationsFetchError,
    revokingIds:              revokingInvitationIds,
    revokeErrorById:          revokeInvitationErrorById,
    lastOutcome:        lastRevokeOutcome,
    clearLastOutcome:   clearLastRevokeOutcome,
    refetchSentInvitations,
    revokeInvitation,
  } = useSentInvitations();

  const {
    readKeys,
    dismissedKeys,
    markRead:    _markNotifRead,
    markAllRead: _markAllNotifsRead,
    dismiss:     _dismissNotif,
  } = useNotificationReads();

  const [activeView, setActiveView] = useState<'recommendations' | 'comfort'>('recommendations');
  const [selectedRec, setSelectedRec] = useState<{
    rec: Recommendation;
    variant: 'received' | 'sent';
  } | null>(null);
  const [recTab, setRecTab] = useState<'received' | 'sent'>('received');
  const [selectedFriend, setSelectedFriend] = useState<import('../types').Friend | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showManageFriends, setShowManageFriends] = useState(false);
  const [showAddRecommendation, setShowAddRecommendation] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  // Onboarding: session-only dismiss (resets on page refresh if user still has 0 friends).
  const [onboardingSessionDismissed, setOnboardingSessionDismissed] = useState(false);
  // Help/Guide button forces the card open regardless of friend count or dismiss state.
  const [showOnboardingHelp, setShowOnboardingHelp] = useState(false);
  // Mobile friends drawer (hidden on lg+).
  const [showFriendDrawer, setShowFriendDrawer] = useState(false);
  const [showMobileUtilityMenu, setShowMobileUtilityMenu] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [completedAuthHandoffKey, setCompletedAuthHandoffKey] = useState<string | null>(null);
  const [marketingHandoff, setMarketingHandoff] = useState(false);
  const [selectedSentGroupKey, setSelectedSentGroupKey] = useState<string | null>(null);
  const activation = useMemo(
    () => deriveActivationState({
      isLoading: friendsLoading || sentLoading || sentInvitationsLoading,
      friendCount: friends.length,
      pendingInvitationCount: sentInvitations.length,
      sentRecommendationCount: sentRecommendations.length,
    }),
    [friendsLoading, sentLoading, sentInvitationsLoading, friends.length, sentInvitations.length, sentRecommendations.length],
  );
  const needsFirstFriend =
    activation.status === 'needs_friend' || activation.status === 'waiting_for_friend';

  useEffect(() => {
    if (!showOnboardingHelp) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('getting-started-title')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showOnboardingHelp]);

  useEffect(() => {
    if (!user || friendsLoading || friends.length === 0) return;
    trackMilestoneOnce(user.id, 'friend_connected', { source: 'dashboard_observed' });
  }, [user?.id, friendsLoading, friends.length]);

  useEffect(() => {
    if (!user || sentLoading || sentRecommendations.length === 0) return;
    trackMilestoneOnce(user.id, 'first_recommendation_sent', {
      source: 'dashboard_observed',
    });
  }, [user?.id, sentLoading, sentRecommendations.length]);
  // Email deep-link / settings navigation state.
  const [settingsInitialSection, setSettingsInitialSection] = useState<
    'notifications' | undefined
  >(undefined);
  const [manageFriendsFocusIncoming, setManageFriendsFocusIncoming] = useState(false);
  const [highlightedRecId, setHighlightedRecId] = useState<string | null>(null);
  const [deepLinkMessage, setDeepLinkMessage] = useState<string | null>(null);
  const [deepLinkRecRefresh, setDeepLinkRecRefresh] = useState<
    'idle' | 'in-flight' | 'failed'
  >('idle');
  // Username claim modal — soft prompt or failed pending-signup claim.
  // (Settings renders its own claim/change modal locally.)
  const [usernameModal, setUsernameModal] = useState<
    | null
    | {
        source: 'soft-prompt' | 'pending-signup';
        ownerUserId: string;
        initialValue?: string;
        notice?: string;
      }
  >(null);

  const notificationsRef   = useRef<HTMLDivElement>(null);
  const friendDrawerRef = useRef<HTMLDivElement>(null);
  const friendDrawerTriggerRef = useRef<HTMLButtonElement>(null);
  const urlIntentCapturedRef = useRef(false);
  const deepLinkMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deepLinkPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deepLinkScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deepLinkRunGenRef = useRef(0);

  const authHandoffKey = authLoading
    ? null
    : user
      ? `user:${user.id}`
      : 'signed-out';
  const metadataDisplayName = [
    user?.user_metadata?.display_name,
    user?.user_metadata?.full_name,
    user?.user_metadata?.name,
  ].find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const authDisplayName =
    (profileMatchesCurrentUser ? myProfile?.displayName?.trim() : null) ||
    metadataDisplayName?.trim() ||
    user?.email?.split('@')[0] ||
    null;

  useEffect(() => {
    if (!authHandoffKey || completedAuthHandoffKey === authHandoffKey) return;

    const delay = user ? 650 : 420;
    const timer = window.setTimeout(() => {
      setCompletedAuthHandoffKey(authHandoffKey);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [authHandoffKey, completedAuthHandoffKey, user?.id]);

  useEffect(() => {
    if (!marketingHandoff) return;

    const timer = window.setTimeout(() => {
      window.location.assign(MARKETING_PATH);
    }, 520);

    return () => window.clearTimeout(timer);
  }, [marketingHandoff]);

  useEffect(() => {
    if (!showFriendDrawer) return;

    const drawer = friendDrawerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusableSelector =
      'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = Array.from(
      drawer?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    );
    focusable[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowFriendDrawer(false);
      if (event.key !== 'Tab' || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      friendDrawerTriggerRef.current?.focus();
    };
  }, [showFriendDrawer]);

  useEffect(() => {
    if (!showMobileUtilityMenu) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowMobileUtilityMenu(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showMobileUtilityMenu]);
  const deepLinkMountedRef = useRef(true);
  const authUserIdRef = useRef<string | null>(null);
  const prevAuthUserIdRef = useRef<string | null | undefined>(undefined);
  const deepLinkRecSetupDoneRef = useRef(false);
  // Pending-signup username auto-claim: one attempt per user+username per
  // page session. Set synchronously before the async call, so React Strict
  // Mode double-effects and rerenders can't trigger duplicate claims.
  const pendingUsernameClaimAttemptRef = useRef<string | null>(null);
  // Snackbar state for the "Recommendation dismissed / Undo" toast.
  const [dismissToast, setDismissToast]   = useState<Recommendation | null>(null);
  const dismissToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Auto-dismiss timer for the invitation outcome toast.
  const inviteOutcomeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  // Clear the dismiss-toast timer on unmount to prevent setState-after-unmount.
  useEffect(() => {
    return () => {
      if (dismissToastTimerRef.current) clearTimeout(dismissToastTimerRef.current);
    };
  }, []);

  // Auto-dismiss the invitation outcome toast after 5 s.
  useEffect(() => {
    if (!inviteOutcome) return;
    if (inviteOutcomeTimerRef.current) clearTimeout(inviteOutcomeTimerRef.current);
    inviteOutcomeTimerRef.current = setTimeout(() => {
      clearInviteOutcome();
      inviteOutcomeTimerRef.current = null;
    }, 5000);
    return () => {
      if (inviteOutcomeTimerRef.current) {
        clearTimeout(inviteOutcomeTimerRef.current);
        inviteOutcomeTimerRef.current = null;
      }
    };
  }, [inviteOutcome, clearInviteOutcome]);

  // Auto-dismiss the revoke outcome snackbar after 4 s.
  const revokeMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!lastRevokeOutcome) return;
    if (revokeMessageTimerRef.current) clearTimeout(revokeMessageTimerRef.current);
    revokeMessageTimerRef.current = setTimeout(() => {
      clearLastRevokeOutcome();
      revokeMessageTimerRef.current = null;
    }, 4000);
    return () => {
      if (revokeMessageTimerRef.current) {
        clearTimeout(revokeMessageTimerRef.current);
        revokeMessageTimerRef.current = null;
      }
    };
  }, [lastRevokeOutcome, clearLastRevokeOutcome]);

  const showDeepLinkSnackbar = (message: string) => {
    if (deepLinkMessageTimerRef.current) clearTimeout(deepLinkMessageTimerRef.current);
    setDeepLinkMessage(message);
    deepLinkMessageTimerRef.current = setTimeout(() => {
      setDeepLinkMessage(null);
      deepLinkMessageTimerRef.current = null;
    }, 5000);
  };

  const clearDeepLinkPollTimer = () => {
    if (deepLinkPollTimerRef.current) {
      clearTimeout(deepLinkPollTimerRef.current);
      deepLinkPollTimerRef.current = null;
    }
  };

  const clearDeepLinkScrollTimer = () => {
    if (deepLinkScrollTimerRef.current) {
      clearTimeout(deepLinkScrollTimerRef.current);
      deepLinkScrollTimerRef.current = null;
    }
  };

  const clearDeepLinkHighlightTimer = () => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
  };

  const isDeepLinkRunCurrent = (runGen: number, capturedUserId: string): boolean =>
    deepLinkMountedRef.current &&
    deepLinkRunGenRef.current === runGen &&
    authUserIdRef.current === capturedUserId;

  /** Cancel in-flight async work and return a new execution generation. */
  const beginDeepLinkRecRun = (): number => {
    deepLinkRunGenRef.current += 1;
    clearDeepLinkPollTimer();
    clearDeepLinkScrollTimer();
    clearDeepLinkHighlightTimer();
    if (deepLinkMountedRef.current) {
      setHighlightedRecId(null);
    }
    return deepLinkRunGenRef.current;
  };

  /** Invalidate pending recommendation deep-link work and reset local rec state. */
  const invalidateDeepLinkRun = () => {
    beginDeepLinkRecRun();
    if (deepLinkMountedRef.current) {
      setDeepLinkRecRefresh('idle');
    }
    deepLinkRecSetupDoneRef.current = false;
  };

  const resetDeepLinkRecState = () => {
    if (deepLinkMountedRef.current) {
      setDeepLinkRecRefresh('idle');
    }
    deepLinkRecSetupDoneRef.current = false;
  };

  const applyRecommendationHighlight = (
    rec: Recommendation,
    recommendationId: string,
    runGen: number,
    capturedUserId: string,
  ) => {
    if (!isDeepLinkRunCurrent(runGen, capturedUserId)) return;

    setHighlightedRecId(recommendationId);
    clearDeepLinkHighlightTimer();
    highlightTimerRef.current = setTimeout(() => {
      if (!isDeepLinkRunCurrent(runGen, capturedUserId)) return;
      setHighlightedRecId(null);
      highlightTimerRef.current = null;
    }, 3000);

    const scrollBehavior: ScrollBehavior =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    clearDeepLinkScrollTimer();
    deepLinkScrollTimerRef.current = setTimeout(() => {
      if (!isDeepLinkRunCurrent(runGen, capturedUserId)) return;
      document
        .querySelector(`[data-recommendation-id="${recommendationId}"]`)
        ?.scrollIntoView({ behavior: scrollBehavior, block: 'center' });
      deepLinkScrollTimerRef.current = null;
    }, 150);

    if (!isDeepLinkRunCurrent(runGen, capturedUserId)) return;
    setSelectedRec({ rec, variant: 'received' });
  };

  const highlightRecWhenInDom = (
    rec: Recommendation,
    recommendationId: string,
    runGen: number,
    capturedUserId: string,
  ) => {
    let attempts = 0;

    const tryHighlight = () => {
      if (!isDeepLinkRunCurrent(runGen, capturedUserId)) {
        clearDeepLinkPollTimer();
        return;
      }

      const el = document.querySelector(`[data-recommendation-id="${recommendationId}"]`);
      if (el) {
        clearDeepLinkPollTimer();
        applyRecommendationHighlight(rec, recommendationId, runGen, capturedUserId);
        return;
      }

      attempts += 1;
      if (attempts < 25) {
        clearDeepLinkPollTimer();
        deepLinkPollTimerRef.current = setTimeout(tryHighlight, 100);
      } else if (isDeepLinkRunCurrent(runGen, capturedUserId)) {
        setSelectedRec({ rec, variant: 'received' });
      }
    };

    clearDeepLinkPollTimer();
    deepLinkPollTimerRef.current = setTimeout(tryHighlight, 100);
  };

  // Capture email deep-link params once on load (dashboard root only).
  useEffect(() => {
    if (urlIntentCapturedRef.current) return;
    const path = window.location.pathname;
    if (
      path === '/privacy' ||
      isInviteRoute(path) ||
      path === '/update-password'
    ) return;
    urlIntentCapturedRef.current = true;
    captureDeepLinkFromUrl();
  }, []);

  // Consume the extension's recognized reset-request hint while preserving all
  // unrelated query parameters and the hash. No email or credential enters the URL.
  useEffect(() => {
    if (authEntryMode !== 'forgot') return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('auth') !== 'forgot') return;
    url.searchParams.delete('auth');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [authEntryMode]);

  // Keep a live ref of the authenticated user ID for async deep-link guards.
  useEffect(() => {
    authUserIdRef.current = user?.id ?? null;
  }, [user?.id]);

  // Invalidate async deep-link work when leaving an authenticated user (sign-out
  // or switch to a different user). Preserve intent across anonymous → sign-in.
  // Also discard any username claim modal owned by the previous account.
  useEffect(() => {
    if (authLoading) return;
    const prevId = prevAuthUserIdRef.current;
    const nextId = user?.id ?? null;
    if (prevId !== nextId) {
      setUsernameModal(null);
      pendingUsernameClaimAttemptRef.current = null;
    }
    if (prevId != null && prevId !== nextId) {
      invalidateDeepLinkRun();
      clearDeepLinkIntent();
    }
    prevAuthUserIdRef.current = nextId;
  }, [user, authLoading]);

  useEffect(() => {
    deepLinkMountedRef.current = true;
    return () => {
      deepLinkMountedRef.current = false;
      deepLinkRunGenRef.current += 1;
      clearDeepLinkPollTimer();
      clearDeepLinkScrollTimer();
      clearDeepLinkHighlightTimer();
      if (deepLinkMessageTimerRef.current) {
        clearTimeout(deepLinkMessageTimerRef.current);
        deepLinkMessageTimerRef.current = null;
      }
    };
  }, []);

  // ── Username: pending signup claim + soft prompt ──────────────────────────

  const isPublicRoute = (): boolean => {
    const path = window.location.pathname;
    return path === '/privacy' ||
      isInviteRoute(path) ||
      path === '/update-password' ||
      authEntryMode === 'forgot';
  };

  const usernamePromptDismissKey = (userId: string) =>
    `sh_username_prompt_dismissed:${userId}`;

  /** Dismissing any claim modal suppresses the automatic prompt for this
   *  browser session (per user — account switching resets it naturally). */
  const handleUsernameModalClose = () => {
    const ownerId = usernameModal?.ownerUserId;
    if (ownerId && user?.id === ownerId) {
      try {
        sessionStorage.setItem(usernamePromptDismissKey(ownerId), '1');
      } catch { /* sessionStorage unavailable — prompt may reappear */ }
    }
    setUsernameModal(null);
  };

  // Auto-claim a pending signup username once the confirmed account signs in
  // and its own profile has loaded. One attempt per user+username per page
  // session; the profile hook additionally serializes concurrent claims.
  useEffect(() => {
    if (!user || authLoading || !myProfileLoaded || !myProfile) return;
    // Never read/clear/claim a pending username against a profile snapshot
    // that belongs to a different (previous) account.
    if (!profileMatchesCurrentUser) return;
    const email = user.email?.trim().toLowerCase();
    if (!email) return;

    const pendingUsername = readPendingSignupUsername(email);
    if (!pendingUsername) return;

    // Already has a username (claimed elsewhere / previous session) — the
    // pending entry is stale. Remove it and do nothing else.
    if (myProfile.username) {
      clearPendingSignupUsername(email);
      return;
    }

    const attemptKey = `${user.id}:${pendingUsername}`;
    if (pendingUsernameClaimAttemptRef.current === attemptKey) return;
    pendingUsernameClaimAttemptRef.current = attemptKey; // sync guard (Strict Mode safe)

    const capturedUserId = user.id;
    void (async () => {
      try {
        await claimMyUsername(pendingUsername);
        clearPendingSignupUsername(email);
      } catch (err) {
        // Stale session or account switch — leave everything untouched.
        if (authUserIdRef.current !== capturedUserId) return;
        if (err instanceof UsernameRpcError) {
          if (err.code === 'USERNAME_UNAVAILABLE' || err.code === 'USERNAME_INVALID') {
            // Terminal for this value: drop the pending entry so it never
            // auto-retries, and let the user pick another name.
            clearPendingSignupUsername(email);
            if (!isPublicRoute()) {
              setUsernameModal({
                source: 'pending-signup',
                ownerUserId: capturedUserId,
                initialValue: pendingUsername,
                notice: 'That username is no longer available. Choose another.',
              });
            }
            return;
          }
          if (err.code === 'USERNAME_ALREADY_SET') {
            // Cross-tab race: the account already has a username. The profile
            // hook has refetched the real row (reconciliation), which also
            // keeps the soft prompt from firing on stale username-null state.
            clearPendingSignupUsername(email);
            return;
          }
        }
        // Transient failure (network etc.): keep the pending entry for a
        // future session; the attempt ref prevents looping in this one.
        // Manual claim remains available via the soft prompt and Settings.
      }
    })();
  }, [user, authLoading, myProfileLoaded, myProfile, profileMatchesCurrentUser, claimMyUsername]);

  // Soft claim prompt for authenticated users without a username. Dismissible,
  // session-suppressed per user, never rendered over public routes (those
  // early-return before the modal markup, and the guard below keeps state
  // clean), and never shown while the pending-signup flow owns the decision.
  useEffect(() => {
    if (!user || authLoading || !myProfileLoaded || !myProfile) return;
    // "No username yet" may only be decided from the current user's own
    // profile snapshot — never from a previous account's lingering state.
    if (!profileMatchesCurrentUser) return;
    if (myProfile.username) return;
    if (usernameModal) return;
    if (isPublicRoute()) return;

    // A pending signup username exists → the auto-claim effect owns this.
    const email = user.email?.trim().toLowerCase();
    if (email && readPendingSignupUsername(email)) return;

    try {
      if (sessionStorage.getItem(usernamePromptDismissKey(user.id)) === '1') return;
    } catch { /* ignore */ }

    setUsernameModal({ source: 'soft-prompt', ownerUserId: user.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, myProfileLoaded, myProfile, profileMatchesCurrentUser, usernameModal]);

  // Set of profile UUIDs for currently active friends.
  // Used to filter out recommendations from removed friends without touching the DB.
  const friendUserIdSet = useMemo(
    () => new Set(friends.map((f) => f.friendUserId)),
    [friends]
  );

  // Only show recommendations whose sender is still an active friend.
  // Recs from unfriended users are hidden immediately once the friends list
  // updates — no record is deleted from Supabase.
  const activeRecommendations = useMemo(
    () => recommendations.filter((r) => friendUserIdSet.has(r.fromUserId)),
    [recommendations, friendUserIdSet]
  );

  // Execute pending email deep-link intent once prerequisites are ready.
  // Intent stays in sessionStorage until terminal handling (peek, not consume).
  useEffect(() => {
    const intent = peekDeepLinkIntent();
    if (!intent || !user || authLoading) return;

    if (intent.kind === 'notification-settings') {
      setSettingsInitialSection('notifications');
      setShowSettings(true);
      clearDeepLinkIntent();
      return;
    }

    if (intent.kind === 'friend-requests') {
      refetchRequests();
      refetchFriends();
      setManageFriendsFocusIncoming(true);
      setShowManageFriends(true);
      clearDeepLinkIntent();
      return;
    }

    if (friendsLoading || recsLoading) return;

    if (friendsError) {
      invalidateDeepLinkRun();
      showDeepLinkSnackbar('We couldn\u2019t open that recommendation. Please try again.');
      clearDeepLinkIntent();
      return;
    }

    if (deepLinkRecRefresh === 'failed') {
      invalidateDeepLinkRun();
      showDeepLinkSnackbar('We couldn\u2019t open that recommendation. Please try again.');
      clearDeepLinkIntent();
      return;
    }

    if (!deepLinkRecSetupDoneRef.current) {
      setActiveView('recommendations');
      setRecTab('received');
      setSelectedFriend(null);
      setSearchQuery('');
      setSelectedGenre('all');
      setSelectedType('all');
      deepLinkRecSetupDoneRef.current = true;
    }

    const capturedUserId = user.id;
    const recommendationId = intent.recommendationId;

    const isRecVisible = (recs: Recommendation[]) => {
      const rec = recs.find(
        (r) => r.id === recommendationId && r.toUserId === capturedUserId
      );
      if (!rec) return { rec: null, visible: false };
      return { rec, visible: friendUserIdSet.has(rec.fromUserId) };
    };

    const current = isRecVisible(recommendations);
    if (current.rec && current.visible) {
      const runGen = beginDeepLinkRecRun();
      if (!isDeepLinkRunCurrent(runGen, capturedUserId)) return;
      clearDeepLinkIntent();
      resetDeepLinkRecState();
      applyRecommendationHighlight(current.rec, recommendationId, runGen, capturedUserId);
      return;
    }

    if (deepLinkRecRefresh === 'in-flight') return;

    const runGen = beginDeepLinkRecRun();
    if (!isDeepLinkRunCurrent(runGen, capturedUserId)) return;
    setDeepLinkRecRefresh('in-flight');
    fetchRecommendations(capturedUserId)
      .then((freshRecs) => {
        if (!isDeepLinkRunCurrent(runGen, capturedUserId)) return;
        const fresh = isRecVisible(freshRecs);
        refetchRecommendations();
        if (fresh.rec && fresh.visible) {
          clearDeepLinkIntent();
          resetDeepLinkRecState();
          highlightRecWhenInDom(fresh.rec, recommendationId, runGen, capturedUserId);
        } else {
          clearDeepLinkIntent();
          resetDeepLinkRecState();
          showDeepLinkSnackbar('This recommendation is no longer available.');
        }
      })
      .catch(() => {
        if (!isDeepLinkRunCurrent(runGen, capturedUserId)) return;
        setDeepLinkRecRefresh('failed');
      });
  }, [
    user,
    authLoading,
    friendsLoading,
    friendsError,
    recsLoading,
    recommendations,
    friendUserIdSet,
    deepLinkRecRefresh,
    refetchRecommendations,
    refetchRequests,
    refetchFriends,
  ]);

  // Derive unique genres from active recommendations only.
  const genres = useMemo(() => {
    const set = new Set<string>();
    activeRecommendations.forEach((r) => r.genres.forEach((g) => set.add(g)));
    return ['all', ...Array.from(set).sort()];
  }, [activeRecommendations]);

  // Enrich each friend with a live recommendation count.
  // Match by fromUserId (UUID) rather than sourceName (string) for accuracy.
  // Both useMemos must stay here — before any early returns (Rules of Hooks).
  const friendsWithCounts = useMemo(() => {
    return friends.map((friend) => ({
      ...friend,
      recommendationCount: activeRecommendations.filter(
        (r) => r.fromUserId === friend.friendUserId
      ).length,
    }));
  }, [friends, activeRecommendations]);

  // Derive plain ID sets from the persistent key-based readKeys / dismissedKeys.
  // These must be declared before `notifications` so the useMemo below can reference them.
  const readNotifIds = useMemo((): ReadonlySet<string> => {
    const ids = new Set<string>();
    readKeys.forEach((k) => {
      if (k.startsWith('recommendation:')) ids.add(k.slice('recommendation:'.length));
    });
    return ids;
  }, [readKeys]);

  const dismissedNotifIds = useMemo((): ReadonlySet<string> => {
    const ids = new Set<string>();
    dismissedKeys.forEach((k) => {
      if (k.startsWith('recommendation:')) ids.add(k.slice('recommendation:'.length));
      if (k.startsWith('friend_request:'))  ids.add(k.slice('friend_request:'.length));
    });
    return ids;
  }, [dismissedKeys]);

  // Derive in-app notifications from active, non-dismissed recommendations (capped at 8).
  // Filtering before the cap ensures dismissed items don't consume notification slots.
  const notifications = useMemo((): AppNotification[] =>
    activeRecommendations
      .filter((rec) => !dismissedNotifIds.has(rec.id))
      .slice(0, 8)
      .map((rec) => ({
        id:         rec.id,
        type:       'recommendation' as const,
        message:    `${rec.sourceName} recommended "${rec.title}"`,
        sourceName: rec.sourceName,
        itemTitle:  rec.title,
      })),
    [activeRecommendations, dismissedNotifIds]
  );

  // ── Dismiss-with-undo handlers (received recommendations only) ───────────
  const handleDismissReceived = (id: string) => {
    // Capture the full rec before the optimistic removal wipes it from state.
    const rec = recommendations.find((r) => r.id === id) ?? null;

    // Perform the soft-delete (optimistic removal + DB update).
    dismissRecommendation(id);

    if (rec) {
      // Replace any in-flight timer so rapid dismisses never stack.
      if (dismissToastTimerRef.current) clearTimeout(dismissToastTimerRef.current);
      setDismissToast(rec);
      dismissToastTimerRef.current = setTimeout(() => {
        setDismissToast(null);
        dismissToastTimerRef.current = null;
      }, 5000);
    }
  };

  const handleUndoDismiss = () => {
    if (dismissToastTimerRef.current) {
      clearTimeout(dismissToastTimerRef.current);
      dismissToastTimerRef.current = null;
    }
    if (dismissToast) {
      undoDismissRecommendation(dismissToast);
    }
    setDismissToast(null);
  };
  // ─────────────────────────────────────────────────────────────────────────

  // Wrappers that translate IDs → stable notification keys before persisting.
  const markNotifRead     = (id: string) => _markNotifRead(recKey(id));
  const markAllNotifsRead = ()           => _markAllNotifsRead(notifications.map((n) => recKey(n.id)));
  const dismissNotif      = (id: string, type: 'recommendation' | 'friend_request') =>
    _dismissNotif(type === 'recommendation' ? recKey(id) : friendRequestKey(id));

  // Unread count: recommendation notifications the user hasn't marked read,
  // plus pending incoming friend requests not yet dismissed,
  // plus pending email invitations discovered by verified-email match.
  const unreadNotifCount = notifications.filter((n) => !readNotifIds.has(n.id)).length;
  const totalConnectionCount = incomingRequests.length + pendingInvitations.length;

  // ── Public routes — visible without authentication ────────
  // Must come before the authLoading guard so the page renders
  // immediately for unauthenticated visitors.
  if (window.location.pathname === '/privacy') {
    return <PrivacyPage />;
  }

  // Invitation landing — must be detected before the AuthScreen/dashboard so it
  // works both pre-auth (public lookup) and post-auth (accept/decline). The page
  // owns its own loading/error states, so it renders even while auth resolves.
  if (isInviteRoute(window.location.pathname)) {
    return (
      <InvitePage
        token={parseInviteToken(window.location.pathname)}
        user={user}
        authLoading={authLoading}
      />
    );
  }

  // Password-recovery route — all /update-password visits are routed here.
  // The component owns its state machine: it detects error hashes, waits for
  // PASSWORD_RECOVERY, and shows the form only after a valid session is confirmed.
  // Placed before authLoading so the component renders immediately (it manages
  // its own checking/loading state internally).
  if (window.location.pathname === '/update-password') {
    return <UpdatePasswordScreen />;
  }

  // Public reset-request entry point used by the extension, including when the
  // companion website already has an authenticated session.
  if (authEntryMode === 'forgot') {
    return (
      <AuthScreen
        initialMode="forgot"
        onModeChange={(mode) => {
          if (mode !== 'forgot') setAuthEntryMode(null);
        }}
      />
    );
  }

  // ── Auth guards — AFTER every hook declaration ────────────
  if (authLoading) {
    return <AuthHandoffScreen mode="checking" />;
  }

  if (authHandoffKey && completedAuthHandoffKey !== authHandoffKey) {
    return (
      <AuthHandoffScreen
        mode={user ? 'dashboard' : 'login'}
        displayName={authDisplayName}
      />
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (marketingHandoff) {
    return <AuthHandoffScreen mode="marketing" />;
  }
  // ──────────────────────────────────────────────────────────

  const types = ['all', 'movie', 'series'];

  const filteredSuggestions = activeRecommendations.filter((rec) => {
    const matchesSearch = rec.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGenre = selectedGenre === 'all' || rec.genres.includes(selectedGenre);
    const matchesType = selectedType === 'all' || rec.type === selectedType;
    // Match by sender UUID — more reliable than display-name string matching
    const matchesFriend = !selectedFriend || rec.fromUserId === selectedFriend.friendUserId;
    return matchesSearch && matchesGenre && matchesType && matchesFriend;
  });

  // Sent tab: filter by title search + optional recipient (toUserId matches selectedFriend)
  const filteredSentSuggestions = sentRecommendations.filter((rec) => {
    const matchesSearch = rec.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedType === 'all' || rec.type === selectedType;
    const matchesGenre = selectedGenre === 'all' || rec.genres.includes(selectedGenre);
    const matchesFriend = !selectedFriend || rec.toUserId === selectedFriend.friendUserId;
    return matchesSearch && matchesType && matchesGenre && matchesFriend;
  });
  const filteredSentGroups = groupSentRecommendations(filteredSentSuggestions);
  const selectedSentGroup: SentRecommendationGroup | null =
    filteredSentGroups.find((group) => group.key === selectedSentGroupKey) ??
    null;

  const handleAddFriend = () => {
    setShowAddFriend(true);
  };

  const handleManageFriends = () => {
    // Refetch all lists on open so newly received requests, invitations,
    // and sent email invitations appear without a page reload.
    refetchRequests();
    refetchFriends();
    refetchInvitations();
    refetchSentInvitations();
    setShowManageFriends(true);
  };

  const requestSignOut = () => {
    setShowMobileUtilityMenu(false);
    setSignOutError(null);
    setShowSignOutConfirm(true);
  };

  const handleConfirmSignOut = async () => {
    setSignOutPending(true);
    setSignOutError(null);

    const { error } = await supabase.auth.signOut();
    if (error) {
      setSignOutError('We could not sign you out. Please try again.');
      setSignOutPending(false);
      return;
    }

    setShowSignOutConfirm(false);
    setSignOutPending(false);
  };

  return (
    <div className="dashboard-shell">

      {/* ── Desktop sidebar — always visible on lg+ ─────────────────────────── */}
      <div className="hidden lg:flex">
        <FriendSidebar
          friends={friendsWithCounts}
          loading={friendsLoading}
          error={friendsError}
          selectedFriend={selectedFriend}
          onSelectFriend={(friend) => {
            if (friend) setActiveView('recommendations');
            refetchRecommendations();
            setSelectedFriend(friend);
          }}
          onAddFriend={handleAddFriend}
          onManageFriends={handleManageFriends}
        />
      </div>

      {/* ── Mobile friends drawer ────────────────────────────────────────────── */}
      {showFriendDrawer && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/70 lg:hidden"
            onClick={() => setShowFriendDrawer(false)}
            aria-label="Close friends panel"
            tabIndex={-1}
          />
          {/* Drawer panel — slides in from the left */}
          <div
            ref={friendDrawerRef}
            className="fixed left-0 top-0 z-50 flex h-dvh overflow-hidden lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Filter recommendations by friend"
          >
            <FriendSidebar
              friends={friendsWithCounts}
              loading={friendsLoading}
              error={friendsError}
              selectedFriend={selectedFriend}
              onSelectFriend={(friend) => {
                if (friend) setActiveView('recommendations');
                refetchRecommendations();
                setSelectedFriend(friend);
                setShowFriendDrawer(false);
              }}
              onAddFriend={() => { setShowFriendDrawer(false); handleAddFriend(); }}
              onManageFriends={() => { setShowFriendDrawer(false); handleManageFriends(); }}
              onClose={() => setShowFriendDrawer(false)}
            />
          </div>
        </>
      )}

      <div className="dashboard-workspace">
        <header className="dashboard-header">
          <div className="dashboard-header-row">
            <div className="dashboard-header-brand-group">
              <a
                href={MARKETING_PATH}
                className="dashboard-brand"
                aria-label="About Streaming Helper"
                onClick={(event) => {
                  event.preventDefault();
                  setMarketingHandoff(true);
                }}
              >
                <div className="dashboard-brand-mark">
                  <IconMusic />
                </div>
                <div className="min-w-0">
                  <h1 className="dashboard-brand-title">Streaming Helper</h1>
                  <p className="dashboard-brand-copy">
                    {activeView === 'recommendations'
                      ? 'Recommendations from people you trust'
                      : 'Familiar titles, ready when you need them'}
                  </p>
                </div>
              </a>
            </div>

            <div className="dashboard-primary-nav" role="tablist" aria-label="Dashboard sections">
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'recommendations'}
                onClick={() => { refetchRecommendations(); setActiveView('recommendations'); }}
              >
                Recommendations
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeView === 'comfort'}
                onClick={() => setActiveView('comfort')}
              >
                Comfort List
              </button>
            </div>

            <div className="dashboard-utility">
              <a
                href={MARKETING_PATH}
                className="dashboard-site-link"
                onClick={(event) => {
                  event.preventDefault();
                  setMarketingHandoff(true);
                }}
              >
                About
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </a>
              <button
                type="button"
                onClick={() => setShowOnboardingHelp(true)}
                className={`dashboard-getting-started-trigger dashboard-desktop-utility${needsFirstFriend ? ' needs-attention' : ''}`}
                aria-label={needsFirstFriend ? 'Getting started: connect your first friend' : 'Open getting started guide'}
                aria-pressed={showOnboardingHelp}
                title="Getting started"
              >
                <ListChecks className="h-4 w-4" aria-hidden />
                <span className="dashboard-getting-started-label">Getting started</span>
                {needsFirstFriend && <span className="dashboard-attention-dot" aria-hidden />}
              </button>
              <a
                href={HELP_PATH}
                className="dashboard-icon-button dashboard-desktop-utility"
                aria-label="Help and support"
              >
                <HelpCircle className="h-5 w-5" aria-hidden />
              </a>
              <div className="relative" ref={notificationsRef}>
                <button
                  type="button"
                  onClick={() => {
                    // Refetch when opening so newly received requests and
                    // recommendation notification counts update without a page reload.
                    if (!showNotifications) {
                      refetchRequests();
                      refetchRecommendations();
                      refetchInvitations();
                    }
                    setShowNotifications(!showNotifications);
                  }}
                  className="dashboard-icon-button relative"
                  aria-label="Notifications"
                  aria-expanded={showNotifications}
                >
                  <Bell className="h-5 w-5" aria-hidden />
                  {(unreadNotifCount > 0 || totalConnectionCount > 0) && (
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#8f7cf6]" />
                  )}
                </button>
                {showNotifications && (
                  <NotificationsDropdown
                    notifications={notifications}
                    incomingRequests={incomingRequests.filter(
                      (r) => !dismissedNotifIds.has(r.id)
                    )}
                    readIds={readNotifIds}
                    loading={recsLoading}
                    onMarkRead={markNotifRead}
                    onMarkAllRead={markAllNotifsRead}
                    onDismiss={dismissNotif}
                    onAcceptRequest={acceptRequest}
                    onDeclineRequest={declineRequest}
                    onClose={() => setShowNotifications(false)}
                    pendingInvitations={pendingInvitations}
                    respondingInvitationIds={invitationRespondingIds}
                    invitationErrors={invitationErrors}
                    onAcceptInvitation={acceptInvitation}
                    onDeclineInvitation={declineInvitation}
                    onDismissInvitation={dismissInvitationForSession}
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="dashboard-icon-button dashboard-desktop-utility"
                aria-label="Settings"
              >
                <Settings className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={requestSignOut}
                className="dashboard-icon-button dashboard-signout-button dashboard-desktop-utility"
                aria-label="Sign out"
              >
                <LogOut className="h-5 w-5" aria-hidden />
              </button>
              <div className="relative sm:hidden">
                <button
                  type="button"
                  onClick={() => setShowMobileUtilityMenu((open) => !open)}
                  className="dashboard-icon-button"
                  aria-label="Open account menu"
                  aria-expanded={showMobileUtilityMenu}
                >
                  <MoreHorizontal className="h-5 w-5" aria-hidden />
                </button>
                {showMobileUtilityMenu && (
                  <div className="dashboard-mobile-menu" role="menu" aria-label="Account and help">
                    <a
                      href={MARKETING_PATH}
                      role="menuitem"
                      onClick={(event) => {
                        event.preventDefault();
                        setShowMobileUtilityMenu(false);
                        setMarketingHandoff(true);
                      }}
                    >
                      <ArrowUpRight className="h-4 w-4" aria-hidden />
                      About Streaming Helper
                    </a>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowMobileUtilityMenu(false);
                        setShowOnboardingHelp(true);
                      }}
                    >
                      <ListChecks className="h-4 w-4" aria-hidden />
                      Getting started
                      {needsFirstFriend && <span className="dashboard-menu-attention-dot" aria-hidden />}
                    </button>
                    <a
                      href={HELP_PATH}
                      role="menuitem"
                      onClick={() => setShowMobileUtilityMenu(false)}
                    >
                      <HelpCircle className="h-4 w-4" aria-hidden />
                      Help and support
                    </a>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowMobileUtilityMenu(false);
                        setShowSettings(true);
                      }}
                    >
                      <Settings className="h-4 w-4" aria-hidden />
                      Settings
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={requestSignOut}
                      className="dashboard-mobile-signout"
                    >
                      <LogOut className="h-4 w-4" aria-hidden />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="dashboard-main">
          <div className="dashboard-content">
            <div className="dashboard-content-flow">
            {/* ── Onboarding card — global: renders on both Recommendations and Comfort List ──
                 Auto-shown: user has 0 friends and hasn't dismissed this session.
                 Help (?) button: shown regardless of active tab, friend count, or dismiss state. */}
            {(showOnboardingHelp ||
              (!onboardingSessionDismissed && activation.status !== 'loading' && activation.status !== 'activated')
            ) && (
              <OnboardingCard
                activation={activation}
                onAddFriend={() => {
                  trackAcquisitionEvent('activation_step_clicked', { action: 'add_friend', state: activation.status });
                  setShowOnboardingHelp(false);
                  handleAddFriend();
                }}
                onRecommend={() => {
                  trackAcquisitionEvent('activation_step_clicked', { action: 'send_recommendation', state: activation.status });
                  setShowOnboardingHelp(false);
                  setActiveView('recommendations');
                  setShowAddRecommendation(true);
                }}
                onExtensionClick={() => trackAcquisitionEvent('extension_install_clicked', { source: 'activation_checklist' })}
                onDismiss={() => {
                  setOnboardingSessionDismissed(true);
                  setShowOnboardingHelp(false);
                }}
              />
            )}

            {activeView === 'recommendations' ? (
              <>
                <div className="dashboard-page-header">
                  <div className="min-w-0">
                    {selectedFriend ? (
                      <div className="dashboard-friend-context">
                        <FriendAvatar
                          name={selectedFriend.name}
                          avatar={selectedFriend.avatar}
                          className="h-10 w-10 shrink-0"
                        />
                        <div className="dashboard-friend-context-copy">
                          <div className="dashboard-friend-context-label">
                            {recTab === 'received' ? 'Recommendations from' : 'Recommendations sent to'}
                          </div>
                          <div className="dashboard-friend-context-name truncate">{selectedFriend.name}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedFriend(null)}
                          className="dashboard-icon-button"
                          aria-label={`Clear ${selectedFriend.name} filter`}
                        >
                          <X className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    ) : (
                      <h2 className="dashboard-page-title">Recommendations</h2>
                    )}
                    <p className="dashboard-page-copy" aria-live="polite">
                      {recTab === 'received'
                        ? `${filteredSuggestions.length} ${filteredSuggestions.length === 1 ? 'title' : 'titles'} ready to explore`
                        : `${filteredSentGroups.length} ${filteredSentGroups.length === 1 ? 'title' : 'titles'} sent`}
                    </p>
                    <button
                      ref={friendDrawerTriggerRef}
                      type="button"
                      onClick={() => setShowFriendDrawer(true)}
                      className="dashboard-friend-filter-trigger lg:hidden"
                      aria-label="Open friend filter"
                    >
                      <Users className="h-4 w-4" aria-hidden />
                      Filter by friend
                    </button>
                  </div>

                  <div className="dashboard-actions">
                    <div className="dashboard-segmented" aria-label="Recommendation direction">
                      <button
                        type="button"
                        onClick={() => setRecTab('received')}
                        aria-pressed={recTab === 'received'}
                      >
                        Received
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecTab('sent')}
                        aria-pressed={recTab === 'sent'}
                      >
                        Sent
                      </button>
                    </div>
                    <div className="dashboard-segmented" aria-label="Recommendation layout">
                      <button
                        type="button"
                        onClick={() => setViewMode('grid')}
                        aria-label="Grid view"
                        aria-pressed={viewMode === 'grid'}
                      >
                        <Grid3x3 className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('list')}
                        aria-label="List view"
                        aria-pressed={viewMode === 'list'}
                      >
                        <List className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddRecommendation(true)}
                      className="dashboard-primary-action"
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      <span className="truncate">
                        {selectedFriend ? `Recommend to ${selectedFriend.name}` : 'Recommend a title'}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="dashboard-tools">
                  <SearchBar
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder={selectedFriend ? `Search ${selectedFriend.name}'s recommendations...` : 'Search all recommendations...'}
                  />
                  <FilterBar
                    genres={genres}
                    types={types}
                    selectedGenre={selectedGenre}
                    selectedType={selectedType}
                    onGenreChange={setSelectedGenre}
                    onTypeChange={setSelectedType}
                  />
                </div>

                {/* ── Received tab ──────────────────────────────────────── */}
                {recTab === 'received' && (
                  <>
                    {recsLoading && (
                      <div className="dashboard-state" role="status">
                        <Loader2 className="h-6 w-6 animate-spin text-[#8f7cf6]" aria-hidden />
                        <span className="sr-only">Loading recommendations</span>
                      </div>
                    )}
                    {!recsLoading && recsError && (
                      <div className="flex items-start gap-2 rounded-xl border border-[#ff7d86]/20 bg-[#ff7d86]/10 px-4 py-3 text-sm text-[#ff9aa1]" role="alert">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        {recsError}
                      </div>
                    )}
                    {!recsLoading && !recsError && filteredSuggestions.length > 0 && (
                      <div className={viewMode === 'grid' ? 'dashboard-card-grid' : 'dashboard-card-list'}>
                        {filteredSuggestions.map((suggestion) => (
                          <SuggestionCard
                            key={suggestion.id}
                            suggestion={suggestion}
                            onRemove={handleDismissReceived}
                            onCardClick={(rec) => setSelectedRec({ rec, variant: 'received' })}
                            viewMode={viewMode}
                            cardVariant="received"
                            highlighted={highlightedRecId === suggestion.id}
                          />
                        ))}
                      </div>
                    )}
                    {!recsLoading && !recsError && filteredSuggestions.length === 0 && (
                      <div className="dashboard-empty">
                        <div className="dashboard-empty-icon">
                          <Tv className="h-6 w-6" aria-hidden />
                        </div>
                        <h3>No recommendations found</h3>
                        <p>
                          {selectedFriend
                            ? `${selectedFriend.name} hasn't sent you any recommendations matching these filters`
                            : activeRecommendations.length === 0
                              ? friends.length === 0
                                ? 'Add friends to start exchanging recommendations.'
                                : 'Recommendations from friends will appear here.'
                              : 'Try adjusting your filters'}
                        </p>
                        {selectedFriend && (
                          <button
                            type="button"
                            onClick={() => setSelectedFriend(null)}
                            className="dashboard-secondary-action mt-4"
                          >
                            View all received
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* ── Sent tab ───────────────────────────────────────────── */}
                {recTab === 'sent' && (
                  <>
                    {sentLoading && (
                      <div className="dashboard-state" role="status">
                        <Loader2 className="h-6 w-6 animate-spin text-[#8f7cf6]" aria-hidden />
                        <span className="sr-only">Loading sent recommendations</span>
                      </div>
                    )}
                    {!sentLoading && sentError && (
                      <div className="flex items-start gap-2 rounded-xl border border-[#ff7d86]/20 bg-[#ff7d86]/10 px-4 py-3 text-sm text-[#ff9aa1]" role="alert">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        {sentError}
                      </div>
                    )}
                    {!sentLoading && !sentError && filteredSentGroups.length > 0 && (
                      <div className={viewMode === 'grid' ? 'dashboard-card-grid' : 'dashboard-card-list'}>
                        {filteredSentGroups.map((group) => (
                          <SentRecommendationCard
                            key={group.key}
                            group={group}
                            onOpen={setSelectedSentGroupKey}
                            viewMode={viewMode}
                          />
                        ))}
                      </div>
                    )}
                    {!sentLoading && !sentError && filteredSentGroups.length === 0 && (
                      <div className="dashboard-empty">
                        <div className="dashboard-empty-icon">
                          <Tv className="h-6 w-6" aria-hidden />
                        </div>
                        <h3>No sent recommendations</h3>
                        <p>
                          {selectedFriend
                            ? `You haven't recommended anything to ${selectedFriend.name} yet`
                            : friends.length === 0
                              ? 'Add friends first, then start sending recommendations.'
                              : 'Titles you recommend to friends will appear here.'}
                        </p>
                        {selectedFriend && (
                          <button
                            type="button"
                            onClick={() => setSelectedFriend(null)}
                            className="dashboard-secondary-action mt-4"
                          >
                            View all sent
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <ComfortList />
            )}
            </div>
          </div>
        </main>
      </div>

      {showSettings && (
        <SettingsModal
          initialSection={settingsInitialSection}
          onClose={() => {
            setShowSettings(false);
            setSettingsInitialSection(undefined);
          }}
          username={profileMatchesCurrentUser ? myProfile?.username ?? null : null}
          usernameChangedAt={profileMatchesCurrentUser ? myProfile?.usernameChangedAt ?? null : null}
          usernameLoading={myProfileLoading || !myProfileLoaded || !profileMatchesCurrentUser}
          usernameSaving={usernameSaving}
          onClaimUsername={async (u) => { await claimMyUsername(u); }}
          onChangeUsername={async (u) => { await changeMyUsername(u); }}
        />
      )}

      {showAddFriend && (
        <AddFriendModal
          onSend={sendRequest}
          onClose={() => setShowAddFriend(false)}
          onInvitationSent={refetchSentInvitations}
        />
      )}

      {showManageFriends && (
        <ManageFriendsModal
          friends={friendsWithCounts}
          incomingRequests={incomingRequests}
          outgoingRequests={outgoingRequests}
          focusIncomingRequests={manageFriendsFocusIncoming}
          onClose={() => {
            setShowManageFriends(false);
            setManageFriendsFocusIncoming(false);
          }}
          onAddFriend={() => {
            setShowManageFriends(false);
            setShowAddFriend(true);
          }}
          onRemoveFriend={(id) => {
            removeFriendFromDb(id);
            refetchRequests();
          }}
          onAcceptRequest={acceptRequest}
          onDeclineRequest={declineRequest}
          onCancelRequest={cancelRequest}
          pendingInvitations={pendingInvitations}
          respondingInvitationIds={invitationRespondingIds}
          invitationErrors={invitationErrors}
          onAcceptInvitation={acceptInvitation}
          onDeclineInvitation={declineInvitation}
          onDismissInvitation={dismissInvitationForSession}
          sentInvitations={sentInvitations}
          sentInvitationsLoading={sentInvitationsLoading}
          sentInvitationsFetchError={sentInvitationsFetchError}
          revokingInvitationIds={revokingInvitationIds}
          revokeInvitationErrorById={revokeInvitationErrorById}
          onRevokeInvitation={revokeInvitation}
          onRetryFetchSentInvitations={refetchSentInvitations}
        />
      )}

      {showAddRecommendation && (
        <AddRecommendationModal
          friends={friends}
          preselectedFriend={selectedFriend}
          onAdd={addRecommendation}
          onClose={() => setShowAddRecommendation(false)}
        />
      )}

      {/* Username claim modal — soft prompt or failed pending-signup claim.
          Always dismissible; never blocks the dashboard. */}
      {usernameModal &&
        user &&
        profileMatchesCurrentUser &&
        usernameModal.ownerUserId === user.id && (
        <UsernameClaimModal
          mode="claim"
          initialValue={usernameModal.initialValue}
          notice={usernameModal.notice}
          saving={usernameSaving}
          onSubmit={async (u) => { await claimMyUsername(u); }}
          onClose={handleUsernameModalClose}
        />
      )}

      {/* Title details modal — opened by clicking any recommendation card */}
      {selectedRec && (
        <TitleDetailsModal
          recommendation={selectedRec.rec}
          cardVariant={selectedRec.variant}
          onClose={() => setSelectedRec(null)}
        />
      )}

      {selectedSentGroup && (
        <SentRecipientsDialog
          group={selectedSentGroup}
          onClose={() => setSelectedSentGroupKey(null)}
          onRemoveRecipient={(recommendationId, groupSize) => {
            if (groupSize === 1) setSelectedSentGroupKey(null);
            deleteSent(recommendationId);
          }}
        />
      )}

      {showSignOutConfirm && (
        <SignOutConfirmDialog
          displayName={authDisplayName}
          pending={signOutPending}
          error={signOutError}
          onCancel={() => {
            if (signOutPending) return;
            setSignOutError(null);
            setShowSignOutConfirm(false);
          }}
          onConfirm={handleConfirmSignOut}
        />
      )}

      <div className="dashboard-toast-viewport" aria-label="Status messages">
        {/* Dismiss-with-undo snackbar — only for received recommendations */}
        {dismissToast && (
          <DismissToast
            message="Recommendation dismissed"
            onUndo={handleUndoDismiss}
            onClose={() => {
              if (dismissToastTimerRef.current) {
                clearTimeout(dismissToastTimerRef.current);
                dismissToastTimerRef.current = null;
              }
              setDismissToast(null);
            }}
          />
        )}

        {/* Revoke outcome snackbar — covers success and terminal errors; auto-dismisses after 4 s */}
        {lastRevokeOutcome && (
          <div role="status" aria-live="polite" className="dashboard-toast">
            <span>{lastRevokeOutcome.message}</span>
            <div className="dashboard-toast-divider" />
            <button
              type="button"
              onClick={() => {
                if (revokeMessageTimerRef.current) {
                  clearTimeout(revokeMessageTimerRef.current);
                  revokeMessageTimerRef.current = null;
                }
                clearLastRevokeOutcome();
              }}
              className="dashboard-toast-close"
              aria-label="Close"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}

        {/* Invitation outcome snackbar — auto-dismisses after 5 s */}
        {inviteOutcome && (
          <div role="status" aria-live="polite" className="dashboard-toast">
            <span>
              {inviteOutcome.kind === 'accepted'
                ? `You and ${inviteOutcome.inviterName} are now connected.`
                : 'Invitation declined.'}
            </span>
            <div className="dashboard-toast-divider" />
            <button
              type="button"
              onClick={() => {
                if (inviteOutcomeTimerRef.current) {
                  clearTimeout(inviteOutcomeTimerRef.current);
                  inviteOutcomeTimerRef.current = null;
                }
                clearInviteOutcome();
              }}
              className="dashboard-toast-close"
              aria-label="Close"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}

        {/* Email deep-link outcome snackbar — auto-dismisses after 5 s */}
        {deepLinkMessage && (
          <div role="status" aria-live="polite" className="dashboard-toast">
            <span>{deepLinkMessage}</span>
            <div className="dashboard-toast-divider" />
            <button
              type="button"
              onClick={() => {
                if (deepLinkMessageTimerRef.current) {
                  clearTimeout(deepLinkMessageTimerRef.current);
                  deepLinkMessageTimerRef.current = null;
                }
                setDeepLinkMessage(null);
              }}
              className="dashboard-toast-close"
              aria-label="Close"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
