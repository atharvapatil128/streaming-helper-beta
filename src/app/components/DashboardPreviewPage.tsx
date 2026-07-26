/*
 * THESIS: Let reviewers operate the redesigned dashboard without weakening auth.
 * OWN-WORLD: The production dashboard's matte graphite control surface.
 * STORY: Move between trusted recommendations, comfort titles, and account controls.
 * FIRST VIEWPORT: One product header, one floating context bar, and useful title cards.
 * FORM: A non-production, sample-data rendering of the approved dashboard branch.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  Grid3x3,
  Heart,
  LayoutList,
  LockKeyhole,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import IconMusic from '../../imports/IconMusic';
import { mockSuggestions } from '../../data/mockSuggestions';
import type { Friend, Recommendation } from '../../types';
import { FriendAvatar } from './FriendAvatar';
import { FilterBar } from './FilterBar';
import { SearchBar } from './SearchBar';
import { SuggestionCard } from './SuggestionCard';

type PreviewView = 'recommendations' | 'comfort';
type PreviewPanel = 'notifications' | 'settings' | null;
type SettingsSection = 'services' | 'privacy' | 'notifications' | 'account';

const previewRecommendations: Recommendation[] = mockSuggestions
  .slice(0, 8)
  .map((suggestion, index) => ({
    id: `preview-${suggestion.id}`,
    tmdbId: index + 1,
    title: suggestion.title,
    type: suggestion.type,
    thumbnail: suggestion.thumbnail,
    year: suggestion.year,
    rating: suggestion.rating,
    duration: suggestion.duration,
    genres: suggestion.genres,
    platforms: suggestion.platforms,
    sourceName: suggestion.recommendedBy[0]?.name ?? 'A friend',
    fromUserId: `preview-friend-${suggestion.recommendedBy[0]?.name ?? index}`,
    toUserId: 'preview-viewer',
    dismissed: false,
  }));

const previewFriends: Friend[] = [
  {
    id: 'preview-sarah',
    friendUserId: 'preview-sarah',
    name: 'Sarah Chen',
    username: 'sarahwatches',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&h=96&fit=crop',
    isActive: true,
    recommendationCount: 5,
  },
  {
    id: 'preview-marcus',
    friendUserId: 'preview-marcus',
    name: 'Marcus Johnson',
    username: 'marcusj',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=96&h=96&fit=crop',
    isActive: false,
    recommendationCount: 3,
  },
  {
    id: 'preview-emily',
    friendUserId: 'preview-emily',
    name: 'Emily Rodriguez',
    username: 'emilyr',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=96&h=96&fit=crop',
    isActive: true,
    recommendationCount: 0,
  },
];

const comfortTitles = [
  {
    id: 'comfort-abbott',
    title: 'Abbott Elementary',
    note: 'Warm and familiar',
    type: 'Series',
    image: 'https://image.tmdb.org/t/p/w500/nBe1e3JJEZ6veGrVXNF0fRoLu56.jpg',
  },
  {
    id: 'comfort-schitts',
    title: "Schitt's Creek",
    note: 'A dependable favorite',
    type: 'Series',
    image: 'https://image.tmdb.org/t/p/w500/iRfSzrPS5VYWQv7KVSEg2BZZL6C.jpg',
  },
  {
    id: 'comfort-parks',
    title: 'Parks and Recreation',
    note: 'Easy to return to',
    type: 'Series',
    image: 'https://image.tmdb.org/t/p/w500/5IOj62y2Eb2ngyYmEn1IJ7bFhzH.jpg',
  },
];

const settingsSections: Array<{
  id: SettingsSection;
  label: string;
  icon: typeof Settings;
}> = [
  { id: 'services', label: 'Connected Services', icon: Sparkles },
  { id: 'privacy', label: 'Privacy & Sharing', icon: ShieldCheck },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'account', label: 'Account', icon: UserRound },
];

function readInitialState() {
  const params = new URLSearchParams(window.location.search);
  const view: PreviewView = params.get('view') === 'comfort' ? 'comfort' : 'recommendations';
  const panelValue = params.get('panel');
  const panel: PreviewPanel =
    panelValue === 'notifications' || panelValue === 'settings' ? panelValue : null;
  const sectionValue = params.get('section');
  const section: SettingsSection =
    sectionValue === 'privacy' ||
    sectionValue === 'notifications' ||
    sectionValue === 'account'
      ? sectionValue
      : 'services';
  return { view, panel, section };
}

export function DashboardPreviewPage() {
  const initialState = useMemo(readInitialState, []);
  const [activeView, setActiveView] = useState<PreviewView>(initialState.view);
  const [activePanel, setActivePanel] = useState<PreviewPanel>(initialState.panel);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(initialState.section);
  const [recommendations, setRecommendations] = useState(previewRecommendations);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [friendSearch, setFriendSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [direction, setDirection] = useState<'received' | 'sent'>('received');
  const [comfortFilter, setComfortFilter] = useState<'all' | 'pinned'>('all');
  const [comfortPick, setComfortPick] = useState<string | null>(null);
  const [notificationsRead, setNotificationsRead] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('view', activeView);
    if (activePanel) params.set('panel', activePanel);
    else params.delete('panel');
    if (activePanel === 'settings') params.set('section', settingsSection);
    else params.delete('section');
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, [activeView, activePanel, settingsSection]);

  useEffect(() => {
    if (!activePanel) return;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActivePanel(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [activePanel]);

  const genres = useMemo(
    () => ['all', ...Array.from(new Set(recommendations.flatMap((item) => item.genres))).sort()],
    [recommendations],
  );

  const visibleFriends = previewFriends.filter((friend) =>
    friend.name.toLowerCase().includes(friendSearch.toLowerCase()),
  );

  const visibleRecommendations = recommendations.filter((recommendation) => {
    const matchesDirection = direction === 'received' || recommendation.sourceName === 'Sarah Chen';
    const matchesFriend = !selectedFriend || recommendation.sourceName === selectedFriend.name;
    const matchesSearch = recommendation.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedType === 'all' || recommendation.type === selectedType;
    const matchesGenre = selectedGenre === 'all' || recommendation.genres.includes(selectedGenre);
    return matchesDirection && matchesFriend && matchesSearch && matchesType && matchesGenre;
  });

  const openPanel = (panel: Exclude<PreviewPanel, null>) => {
    setActivePanel((current) => (current === panel ? null : panel));
  };

  return (
    <div className="dashboard-preview-shell">
      <header className="dashboard-preview-header">
        <div className="dashboard-preview-header-inner">
          <a href="/" className="dashboard-brand" aria-label="Go to Streaming Helper website">
            <div className="dashboard-brand-mark">
              <IconMusic />
            </div>
            <div className="min-w-0">
              <h1 className="dashboard-brand-title">Streaming Helper</h1>
              <p className="dashboard-brand-copy">Recommendations from people you trust</p>
            </div>
          </a>

          <nav className="dashboard-preview-primary-nav" aria-label="Dashboard sections">
            <button
              type="button"
              aria-current={activeView === 'recommendations' ? 'page' : undefined}
              onClick={() => setActiveView('recommendations')}
            >
              Recommendations
            </button>
            <button
              type="button"
              aria-current={activeView === 'comfort' ? 'page' : undefined}
              onClick={() => setActiveView('comfort')}
            >
              Comfort List
            </button>
          </nav>

          <div className="dashboard-preview-utility">
            <span className="dashboard-preview-badge">Sample-data preview</span>
            <a href="/" className="dashboard-site-link">
              Website
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </a>
            <button
              type="button"
              className="dashboard-icon-button dashboard-preview-icon-button"
              aria-label="Preview notifications"
              aria-expanded={activePanel === 'notifications'}
              onClick={() => openPanel('notifications')}
            >
              <Bell className="h-5 w-5" aria-hidden />
              {!notificationsRead && <span className="dashboard-preview-alert-dot" />}
            </button>
            <button
              type="button"
              className="dashboard-icon-button dashboard-preview-icon-button"
              aria-label="Preview settings"
              aria-expanded={activePanel === 'settings'}
              onClick={() => openPanel('settings')}
            >
              <Settings className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <div className="dashboard-preview-context-wrap">
        {activeView === 'recommendations' ? (
          <div className="dashboard-preview-context-bar" aria-label="Filter recommendations by friend">
            <div className="dashboard-preview-context-label">
              <Users className="h-4 w-4" aria-hidden />
              <span>Friends</span>
            </div>
            <div className="dashboard-preview-chip-row">
              <button
                type="button"
                className="dashboard-preview-person-chip"
                aria-pressed={!selectedFriend}
                onClick={() => setSelectedFriend(null)}
              >
                <span className="dashboard-preview-all-avatar">All</span>
                All friends
              </button>
              {visibleFriends.map((friend) => (
                <button
                  type="button"
                  key={friend.id}
                  className="dashboard-preview-person-chip"
                  aria-pressed={selectedFriend?.id === friend.id}
                  onClick={() => setSelectedFriend(friend)}
                >
                  <span className="relative shrink-0">
                    <FriendAvatar name={friend.name} avatar={friend.avatar} className="h-7 w-7" />
                    {friend.isActive && <span className="dashboard-preview-online-dot" />}
                  </span>
                  {friend.name.split(' ')[0]}
                </button>
              ))}
            </div>
            <label className="dashboard-preview-context-search">
              <Search className="h-4 w-4" aria-hidden />
              <span className="sr-only">Search friends</span>
              <input
                type="search"
                value={friendSearch}
                onChange={(event) => setFriendSearch(event.target.value)}
                placeholder="Search friends"
              />
            </label>
            <button type="button" className="dashboard-preview-context-link">Manage</button>
            <button type="button" className="dashboard-preview-context-action" disabled title="Disabled in sample preview">
              <Plus className="h-4 w-4" aria-hidden />
              Add friend
            </button>
          </div>
        ) : (
          <div className="dashboard-preview-context-bar" aria-label="Comfort list controls">
            <div className="dashboard-preview-context-label">
              <Heart className="h-4 w-4" aria-hidden />
              <span>Comfort</span>
            </div>
            <div className="dashboard-preview-chip-row">
              <button
                type="button"
                className="dashboard-preview-filter-chip"
                aria-pressed={comfortFilter === 'all'}
                onClick={() => setComfortFilter('all')}
              >
                All titles
              </button>
              <button
                type="button"
                className="dashboard-preview-filter-chip"
                aria-pressed={comfortFilter === 'pinned'}
                onClick={() => setComfortFilter('pinned')}
              >
                Pinned
              </button>
            </div>
            <span className="dashboard-preview-context-spacer" />
            <button
              type="button"
              className="dashboard-preview-context-link"
              onClick={() => {
                const next = comfortTitles[Math.floor(Math.random() * comfortTitles.length)];
                setComfortPick(next.id);
              }}
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              Pick for me
            </button>
            <button type="button" className="dashboard-preview-context-action" disabled title="Disabled in sample preview">
              <Plus className="h-4 w-4" aria-hidden />
              Add comfort title
            </button>
          </div>
        )}
      </div>

      <main className="dashboard-preview-main">
        {activeView === 'recommendations' ? (
          <div className="dashboard-content-flow">
            <div className="dashboard-page-header">
              <div>
                <p className="dashboard-preview-eyebrow">Your watch inbox</p>
                <h2 className="dashboard-page-title">
                  {selectedFriend ? `From ${selectedFriend.name}` : 'Recommendations'}
                </h2>
                <p className="dashboard-page-copy" aria-live="polite">
                  {visibleRecommendations.length} titles ready when you are
                </p>
              </div>

              <div className="dashboard-actions">
                <div className="dashboard-segmented" aria-label="Recommendation direction">
                  <button type="button" onClick={() => setDirection('received')} aria-pressed={direction === 'received'}>
                    Received
                  </button>
                  <button type="button" onClick={() => setDirection('sent')} aria-pressed={direction === 'sent'}>
                    Sent
                  </button>
                </div>
                <div className="dashboard-segmented" aria-label="Recommendation layout">
                  <button type="button" onClick={() => setViewMode('grid')} aria-label="Grid view" aria-pressed={viewMode === 'grid'}>
                    <Grid3x3 className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" onClick={() => setViewMode('list')} aria-label="List view" aria-pressed={viewMode === 'list'}>
                    <LayoutList className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <button type="button" className="dashboard-primary-action" disabled title="Disabled in sample preview">
                  <Plus className="h-4 w-4" aria-hidden />
                  Recommend a title
                </button>
              </div>
            </div>

            <div className="dashboard-tools">
              <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search sample recommendations" />
              <FilterBar
                genres={genres}
                types={['all', 'movie', 'series']}
                selectedGenre={selectedGenre}
                selectedType={selectedType}
                onGenreChange={setSelectedGenre}
                onTypeChange={setSelectedType}
              />
            </div>

            {visibleRecommendations.length > 0 ? (
              <div className={viewMode === 'grid' ? 'dashboard-card-grid' : 'dashboard-card-list'}>
                {visibleRecommendations.map((recommendation) => (
                  <SuggestionCard
                    key={recommendation.id}
                    suggestion={recommendation}
                    viewMode={viewMode}
                    cardVariant={direction}
                    onRemove={(id) => setRecommendations((current) => current.filter((item) => item.id !== id))}
                  />
                ))}
              </div>
            ) : (
              <div className="dashboard-empty">
                <h3>No sample titles match</h3>
                <p>Clear a friend, title, type, or genre filter to see the preview recommendations again.</p>
              </div>
            )}
          </div>
        ) : (
          <section className="dashboard-content-flow" aria-labelledby="comfort-heading">
            <div className="dashboard-page-header">
              <div>
                <p className="dashboard-preview-eyebrow">Familiar favorites</p>
                <h2 id="comfort-heading" className="dashboard-page-title">Comfort List</h2>
                <p className="dashboard-page-copy">The titles you can always come back to.</p>
              </div>
              {comfortPick && (
                <div className="dashboard-preview-pick-notice" aria-live="polite">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  Tonight’s pick is highlighted
                </div>
              )}
            </div>
            <div className="dashboard-preview-comfort-grid">
              {comfortTitles
                .filter((_, index) => comfortFilter === 'all' || index === 0)
                .map((title) => (
                  <article
                    key={title.id}
                    className="dashboard-preview-comfort-card"
                    data-picked={comfortPick === title.id}
                  >
                    <img src={title.image} alt="" />
                    <div>
                      <span>{title.type}</span>
                      <h3>{title.title}</h3>
                      <p>{title.note}</p>
                    </div>
                    <button type="button" aria-label={`Open ${title.title} preview`}>
                      <ChevronRight className="h-5 w-5" aria-hidden />
                    </button>
                  </article>
                ))}
            </div>
          </section>
        )}
      </main>

      {activePanel === 'notifications' && (
        <>
          <button
            type="button"
            className="dashboard-preview-backdrop"
            aria-label="Close notifications"
            onClick={() => setActivePanel(null)}
          />
          <section className="dashboard-preview-notifications" role="dialog" aria-label="Notifications preview">
            <div className="dashboard-preview-panel-head">
              <div>
                <p className="dashboard-preview-eyebrow">Recent activity</p>
                <h2>Notifications</h2>
              </div>
              <button ref={closeButtonRef} type="button" aria-label="Close notifications" onClick={() => setActivePanel(null)}>
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="dashboard-preview-notification-list">
              <article>
                <FriendAvatar name="Sarah Chen" avatar={previewFriends[0].avatar} className="h-9 w-9" />
                <div>
                  <strong>Sarah recommended The Bear</strong>
                  <p>Ready in your recommendations · 8 minutes ago</p>
                </div>
                {!notificationsRead && <span />}
              </article>
              <article>
                <FriendAvatar name="Marcus Johnson" avatar={previewFriends[1].avatar} className="h-9 w-9" />
                <div>
                  <strong>Marcus accepted your friend request</strong>
                  <p>You can now exchange recommendations · Yesterday</p>
                </div>
              </article>
            </div>
            <button
              type="button"
              className="dashboard-preview-panel-action"
              onClick={() => setNotificationsRead(true)}
              disabled={notificationsRead}
            >
              <Check className="h-4 w-4" aria-hidden />
              {notificationsRead ? 'All caught up' : 'Mark all as read'}
            </button>
          </section>
        </>
      )}

      {activePanel === 'settings' && (
        <>
          <button
            type="button"
            className="dashboard-preview-backdrop"
            aria-label="Close settings"
            onClick={() => setActivePanel(null)}
          />
          <section className="dashboard-preview-settings" role="dialog" aria-modal="true" aria-label="Settings preview">
            <div className="dashboard-preview-panel-head">
              <div>
                <p className="dashboard-preview-eyebrow">Sample account</p>
                <h2>Settings</h2>
              </div>
              <button ref={closeButtonRef} type="button" aria-label="Close settings" onClick={() => setActivePanel(null)}>
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="dashboard-preview-settings-layout">
              <nav aria-label="Settings sections">
                {settingsSections.map(({ id, label, icon: Icon }) => (
                  <button
                    type="button"
                    key={id}
                    aria-current={settingsSection === id ? 'page' : undefined}
                    onClick={() => setSettingsSection(id)}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </button>
                ))}
              </nav>

              <div className="dashboard-preview-settings-content">
                {settingsSection === 'services' && (
                  <>
                    <h3>Connected Services</h3>
                    <p>Streaming Helper works beside supported streaming sites. It does not connect to or read your streaming accounts.</p>
                    <div className="dashboard-preview-settings-card">
                      <Sparkles className="h-5 w-5" aria-hidden />
                      <div><strong>Chrome extension</strong><span>Enabled for supported watch pages</span></div>
                      <span className="dashboard-preview-status">Active</span>
                    </div>
                    <div className="dashboard-preview-platforms">
                      <span>Netflix</span><span>Prime Video</span><span>Disney+</span><span>Hulu</span><span>Max</span>
                    </div>
                  </>
                )}
                {settingsSection === 'privacy' && (
                  <>
                    <h3>Privacy & Sharing</h3>
                    <p>Control what is shared with accepted friends. Streaming Helper does not read watch history.</p>
                    <div className="dashboard-preview-settings-row">
                      <div><strong>Friend recommendations</strong><span>Only accepted friends can send titles</span></div>
                      <button type="button" className="dashboard-preview-switch" aria-pressed="true"><span /></button>
                    </div>
                    <div className="dashboard-preview-settings-row">
                      <div><strong>Watch history</strong><span>Not collected by Streaming Helper</span></div>
                      <LockKeyhole className="h-5 w-5 text-[#858a9d]" aria-hidden />
                    </div>
                  </>
                )}
                {settingsSection === 'notifications' && (
                  <>
                    <h3>Notifications</h3>
                    <p>Choose how Streaming Helper lets you know about recommendations and friend activity.</p>
                    <div className="dashboard-preview-settings-row">
                      <div><strong>In-app activity</strong><span>Recommendations and friend requests</span></div>
                      <button type="button" className="dashboard-preview-switch" aria-pressed="true"><span /></button>
                    </div>
                    <div className="dashboard-preview-settings-row">
                      <div><strong>Email digest</strong><span>A concise summary of new activity</span></div>
                      <button type="button" className="dashboard-preview-switch" aria-pressed="false"><span /></button>
                    </div>
                  </>
                )}
                {settingsSection === 'account' && (
                  <>
                    <h3>Account</h3>
                    <p>Profile and sign-in information for this sample account.</p>
                    <div className="dashboard-preview-profile-card">
                      <FriendAvatar name="Atharva" className="h-12 w-12" />
                      <div><strong>Atharva</strong><span>@atharva_preview</span></div>
                      <span className="dashboard-preview-status">Preview</span>
                    </div>
                    <div className="dashboard-preview-settings-row">
                      <div><strong>Password</strong><span>Managed securely through your account</span></div>
                      <button type="button" disabled>Edit</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
