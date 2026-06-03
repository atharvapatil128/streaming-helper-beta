import { useState, useRef, useEffect, useMemo } from 'react';
import { Tv, Settings, Bell, Plus, Grid3x3, List, X, LogOut, Loader2, AlertCircle, HelpCircle, Users } from 'lucide-react';
import IconMusic from '../imports/IconMusic';
import { FriendSidebar } from './components/FriendSidebar';
import { SearchBar } from './components/SearchBar';
import { SuggestionCard } from './components/SuggestionCard';
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
import { UpdatePasswordScreen } from './components/UpdatePasswordScreen';
import { PrivacyPage } from './components/PrivacyPage';
import { useAuth } from './hooks/useAuth';
import { useFriends } from './hooks/useFriends';
import { useFriendRequests } from './hooks/useFriendRequests';
import { useRecommendations } from './hooks/useRecommendations';
import { useNotificationReads } from './hooks/useNotificationReads';
import { recKey, friendRequestKey } from '../lib/notificationReads';
import { supabase } from '../lib/supabase';
import type { AppNotification, Recommendation } from '../types';

/** Shared main-area layout for Recommendations and Comfort List (padding + vertical rhythm). */
const DASHBOARD_MAIN_CONTENT_CLASS = 'p-4 sm:p-6 lg:p-8 space-y-6';

export default function App() {
  // ── All hooks must run unconditionally before any early returns ──
  const { user, loading: authLoading, isPasswordRecovery } = useAuth();
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

  const notificationsRef   = useRef<HTMLDivElement>(null);
  // Snackbar state for the "Recommendation dismissed / Undo" toast.
  const [dismissToast, setDismissToast]   = useState<Recommendation | null>(null);
  const dismissToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // plus pending incoming friend requests not yet dismissed.
  const unreadNotifCount = notifications.filter((n) => !readNotifIds.has(n.id)).length;

  // ── Public routes — visible without authentication ────────
  // Must come before the authLoading guard so the page renders
  // immediately for unauthenticated visitors.
  if (window.location.pathname === '/privacy') {
    return <PrivacyPage />;
  }

  // ── Auth guards — AFTER every hook declaration ────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#5b5bd6] animate-spin" />
      </div>
    );
  }

  // User arrived via a password-reset email link. Show the update-password
  // form instead of the main app until they set a new password.
  // isPasswordRecovery is initialized synchronously from window.location.pathname
  // in useAuth so this guard fires on the first render — before getSession()
  // resolves — preventing the dashboard from flashing.
  if (import.meta.env.DEV) {
    if (isPasswordRecovery || window.location.pathname === '/update-password') {
      console.debug('[App] recovery guard —',
        'pathname:', window.location.pathname,
        '| isPasswordRecovery:', isPasswordRecovery,
        '| user:', !!user,
        '| showing UpdatePasswordScreen:', !!(user && isPasswordRecovery));
    }
  }
  if (user && isPasswordRecovery) {
    return <UpdatePasswordScreen />;
  }

  if (!user) {
    return <AuthScreen />;
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
    const matchesFriend = !selectedFriend || rec.toUserId === selectedFriend.friendUserId;
    return matchesSearch && matchesType && matchesFriend;
  });

  const handleAddFriend = () => {
    setShowAddFriend(true);
  };

  const handleManageFriends = () => {
    // Refetch both lists on open so newly received requests appear without a page reload.
    refetchRequests();
    refetchFriends();
    setShowManageFriends(true);
  };

  return (
    <div className="size-full flex bg-[#0a0a0f] text-[#e4e4e7]">

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
          <div
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={() => setShowFriendDrawer(false)}
          />
          {/* Drawer panel — slides in from the left */}
          <div className="fixed left-0 top-0 h-full z-50 flex lg:hidden overflow-y-auto">
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

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="border-b border-[#1f1f28] bg-[#0f0f14] px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <div className="flex items-center justify-between mb-4 lg:mb-6">
            <div className="flex items-center gap-3">
              {/* Mobile: Friends drawer trigger */}
              <button
                onClick={() => setShowFriendDrawer(true)}
                className="lg:hidden p-2 hover:bg-[#1f1f28] rounded-lg transition-colors"
                title="Friends"
                aria-label="Open friends panel"
              >
                <Users className="w-5 h-5 text-[#8b8b9e]" />
              </button>
              <div className="w-10 h-10">
                <IconMusic />
              </div>
              <div>
                <h1 className="text-[#e4e4e7]">Streaming Helper</h1>
                <p className="text-sm text-[#8b8b9e] hidden sm:block">
                  {activeView === 'recommendations'
                    ? 'Curate recommendations from friends'
                    : 'Your personal comfort rewatch collection'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setShowOnboardingHelp(true)}
                className="p-2 hover:bg-[#1f1f28] rounded-lg transition-colors"
                title="Getting started guide"
              >
                <HelpCircle className="w-5 h-5 text-[#8b8b9e]" />
              </button>
              <div className="relative" ref={notificationsRef}>
                <button
                  onClick={() => {
                    // Refetch when opening so newly received requests and
                    // recommendation notification counts update without a page reload.
                    if (!showNotifications) {
                      refetchRequests();
                      refetchRecommendations();
                    }
                    setShowNotifications(!showNotifications);
                  }}
                  className="p-2 hover:bg-[#1f1f28] rounded-lg transition-colors relative"
                >
                  <Bell className="w-5 h-5 text-[#8b8b9e]" />
                  {(unreadNotifCount > 0 || incomingRequests.length > 0) && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-[#5b5bd6] rounded-full" />
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
                  />
                )}
              </div>
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 hover:bg-[#1f1f28] rounded-lg transition-colors"
                title="Settings"
              >
                <Settings className="w-5 h-5 text-[#8b8b9e]" />
              </button>
              <button
                onClick={() => supabase.auth.signOut()}
                className="p-2 hover:bg-[#1f1f28] rounded-lg transition-colors"
                title="Sign out"
              >
                <LogOut className="w-5 h-5 text-[#8b8b9e]" />
              </button>
            </div>
          </div>

          <div className="flex gap-1 px-1">
            <button
              onClick={() => { refetchRecommendations(); setActiveView('recommendations'); }}
              className={`px-6 py-2 rounded-t-lg transition-all ${
                activeView === 'recommendations'
                  ? 'bg-gradient-to-br from-[#5b5bd6] to-[#7c7ce8] text-white'
                  : 'text-[#8b8b9e] hover:text-[#e4e4e7] hover:bg-[#1f1f28]'
              }`}
            >
              Recommendations
            </button>
            <button
              onClick={() => setActiveView('comfort')}
              className={`px-6 py-2 rounded-t-lg transition-all ${
                activeView === 'comfort'
                  ? 'bg-gradient-to-br from-[#5b5bd6] to-[#7c7ce8] text-white'
                  : 'text-[#8b8b9e] hover:text-[#e4e4e7] hover:bg-[#1f1f28]'
              }`}
            >
              Comfort List
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className={DASHBOARD_MAIN_CONTENT_CLASS}>
            {/* ── Onboarding card — global: renders on both Recommendations and Comfort List ──
                 Auto-shown: user has 0 friends and hasn't dismissed this session.
                 Help (?) button: shown regardless of active tab, friend count, or dismiss state. */}
            {(showOnboardingHelp ||
              (!onboardingSessionDismissed && !friendsLoading && friends.length === 0)
            ) && (
              <OnboardingCard
                onAddFriend={() => {
                  setShowOnboardingHelp(false);
                  handleAddFriend();
                }}
                onOpenComfort={() => {
                  setShowOnboardingHelp(false);
                  setActiveView('comfort');
                }}
                onDismiss={() => {
                  setOnboardingSessionDismissed(true);
                  setShowOnboardingHelp(false);
                }}
              />
            )}

            {activeView === 'recommendations' ? (
              <>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    {selectedFriend ? (
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex items-center gap-3 px-4 py-2 bg-[#1f1f28] border border-[#2a2a35] rounded-lg">
                          <FriendAvatar
                            name={selectedFriend.name}
                            avatar={selectedFriend.avatar}
                            className="w-8 h-8"
                          />
                          <div>
                            <div className="text-sm text-[#8b8b9e]">
                              {recTab === 'received' ? 'Recommendations from' : 'Recommendations sent to'}
                            </div>
                            <div className="text-[#e4e4e7] font-medium">{selectedFriend.name}</div>
                          </div>
                          <button
                            onClick={() => setSelectedFriend(null)}
                            className="ml-2 p-1 hover:bg-[#2a2a35] rounded transition-colors"
                            title="Clear filter"
                          >
                            <X className="w-4 h-4 text-[#8b8b9e]" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <h2 className="text-xl text-[#e4e4e7] mb-1">All Recommendations</h2>
                    )}
                    <p className="text-sm text-[#8b8b9e]">
                      {recTab === 'received'
                        ? `${filteredSuggestions.length} ${filteredSuggestions.length === 1 ? 'title' : 'titles'} to explore`
                        : `${filteredSentSuggestions.length} ${filteredSentSuggestions.length === 1 ? 'title' : 'titles'} sent`
                      }
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    {/* Received / Sent segmented control */}
                    <div className="flex items-center gap-1 bg-[#1f1f28] rounded-lg p-1">
                      <button
                        onClick={() => setRecTab('received')}
                        className={`px-3 py-1.5 rounded text-sm transition-colors ${
                          recTab === 'received' ? 'bg-[#2a2a35] text-[#e4e4e7]' : 'text-[#8b8b9e] hover:text-[#e4e4e7]'
                        }`}
                      >
                        Received
                      </button>
                      <button
                        onClick={() => setRecTab('sent')}
                        className={`px-3 py-1.5 rounded text-sm transition-colors ${
                          recTab === 'sent' ? 'bg-[#2a2a35] text-[#e4e4e7]' : 'text-[#8b8b9e] hover:text-[#e4e4e7]'
                        }`}
                      >
                        Sent
                      </button>
                    </div>
                    <div className="flex items-center gap-1 bg-[#1f1f28] rounded-lg p-1">
                      <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2 rounded transition-colors ${
                          viewMode === 'grid' ? 'bg-[#2a2a35] text-[#e4e4e7]' : 'text-[#8b8b9e] hover:text-[#e4e4e7]'
                        }`}
                      >
                        <Grid3x3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setViewMode('list')}
                        className={`p-2 rounded transition-colors ${
                          viewMode === 'list' ? 'bg-[#2a2a35] text-[#e4e4e7]' : 'text-[#8b8b9e] hover:text-[#e4e4e7]'
                        }`}
                      >
                        <List className="w-4 h-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => setShowAddRecommendation(true)}
                      className="px-4 py-2 bg-[#5b5bd6] hover:bg-[#7c7ce8] rounded-lg flex items-center gap-2 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      {selectedFriend ? `Recommend to ${selectedFriend.name}` : 'Recommend Title'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <SearchBar
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder={selectedFriend ? `Search ${selectedFriend.name}'s recommendations...` : 'Search all recommendations...'}
                  />
                </div>

                <FilterBar
                  genres={genres}
                  types={types}
                  selectedGenre={selectedGenre}
                  selectedType={selectedType}
                  onGenreChange={setSelectedGenre}
                  onTypeChange={setSelectedType}
                />

                {/* ── Received tab ──────────────────────────────────────── */}
                {recTab === 'received' && (
                  <>
                    {recsLoading && (
                      <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-6 h-6 text-[#5b5bd6] animate-spin" />
                      </div>
                    )}
                    {!recsLoading && recsError && (
                      <div className="flex items-start gap-2 text-sm text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-xl px-4 py-3">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        {recsError}
                      </div>
                    )}
                    {!recsLoading && !recsError && filteredSuggestions.length > 0 && (
                      <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
                        {filteredSuggestions.map((suggestion) => (
                          <SuggestionCard
                            key={suggestion.id}
                            suggestion={suggestion}
                            onRemove={handleDismissReceived}
                            onCardClick={(rec) => setSelectedRec({ rec, variant: 'received' })}
                            viewMode={viewMode}
                            cardVariant="received"
                          />
                        ))}
                      </div>
                    )}
                    {!recsLoading && !recsError && filteredSuggestions.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-16 h-16 bg-[#1f1f28] rounded-2xl flex items-center justify-center mb-4">
                          <Tv className="w-8 h-8 text-[#8b8b9e]" />
                        </div>
                        <h3 className="text-[#e4e4e7] mb-2">No recommendations found</h3>
                        <p className="text-sm text-[#8b8b9e] max-w-md">
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
                            onClick={() => setSelectedFriend(null)}
                            className="mt-4 px-4 py-2 bg-[#5b5bd6] hover:bg-[#7c7ce8] rounded-lg text-sm transition-colors"
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
                      <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-6 h-6 text-[#5b5bd6] animate-spin" />
                      </div>
                    )}
                    {!sentLoading && sentError && (
                      <div className="flex items-start gap-2 text-sm text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-xl px-4 py-3">
                        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        {sentError}
                      </div>
                    )}
                    {!sentLoading && !sentError && filteredSentSuggestions.length > 0 && (
                      <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
                        {filteredSentSuggestions.map((suggestion) => (
                          <SuggestionCard
                            key={suggestion.id}
                            suggestion={suggestion}
                            onRemove={deleteSent}
                            onCardClick={(rec) => setSelectedRec({ rec, variant: 'sent' })}
                            viewMode={viewMode}
                            cardVariant="sent"
                          />
                        ))}
                      </div>
                    )}
                    {!sentLoading && !sentError && filteredSentSuggestions.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-16 h-16 bg-[#1f1f28] rounded-2xl flex items-center justify-center mb-4">
                          <Tv className="w-8 h-8 text-[#8b8b9e]" />
                        </div>
                        <h3 className="text-[#e4e4e7] mb-2">No sent recommendations</h3>
                        <p className="text-sm text-[#8b8b9e] max-w-md">
                          {selectedFriend
                            ? `You haven't recommended anything to ${selectedFriend.name} yet`
                            : friends.length === 0
                              ? 'Add friends first, then start sending recommendations.'
                              : 'Titles you recommend to friends will appear here.'}
                        </p>
                        {selectedFriend && (
                          <button
                            onClick={() => setSelectedFriend(null)}
                            className="mt-4 px-4 py-2 bg-[#5b5bd6] hover:bg-[#7c7ce8] rounded-lg text-sm transition-colors"
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
        </main>
      </div>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
        />
      )}

      {showAddFriend && (
        <AddFriendModal
          onSend={sendRequest}
          onClose={() => setShowAddFriend(false)}
        />
      )}

      {showManageFriends && (
        <ManageFriendsModal
          friends={friendsWithCounts}
          incomingRequests={incomingRequests}
          outgoingRequests={outgoingRequests}
          onClose={() => setShowManageFriends(false)}
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

      {/* Title details modal — opened by clicking any recommendation card */}
      {selectedRec && (
        <TitleDetailsModal
          recommendation={selectedRec.rec}
          cardVariant={selectedRec.variant}
          onClose={() => setSelectedRec(null)}
        />
      )}

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
    </div>
  );
}
