/*
 * THESIS: Let reviewers operate the redesigned dashboard without weakening auth.
 * OWN-WORLD: The production dashboard's matte graphite control surface.
 * STORY: Filter trusted recommendations, scan title context, and change layouts.
 * FIRST VIEWPORT: Friend rail, command header, filters, and real title cards.
 * FORM: A non-production, sample-data rendering of the approved dashboard branch.
 */
import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  Grid3x3,
  LayoutList,
  Plus,
  Search,
  Settings,
  Users,
} from 'lucide-react';
import IconMusic from '../../imports/IconMusic';
import { mockSuggestions } from '../../data/mockSuggestions';
import type { Friend, Recommendation } from '../../types';
import { FriendAvatar } from './FriendAvatar';
import { FilterBar } from './FilterBar';
import { SearchBar } from './SearchBar';
import { SuggestionCard } from './SuggestionCard';

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

export function DashboardPreviewPage() {
  const [recommendations, setRecommendations] = useState(previewRecommendations);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [direction, setDirection] = useState<'received' | 'sent'>('received');

  const genres = useMemo(
    () => ['all', ...Array.from(new Set(recommendations.flatMap((item) => item.genres))).sort()],
    [recommendations],
  );

  const visibleRecommendations = recommendations.filter((recommendation) => {
    const matchesDirection =
      direction === 'received' || recommendation.sourceName === 'Sarah Chen';
    const matchesFriend =
      !selectedFriend || recommendation.sourceName === selectedFriend.name;
    const matchesSearch = recommendation.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesType =
      selectedType === 'all' || recommendation.type === selectedType;
    const matchesGenre =
      selectedGenre === 'all' || recommendation.genres.includes(selectedGenre);
    return (
      matchesDirection &&
      matchesFriend &&
      matchesSearch &&
      matchesType &&
      matchesGenre
    );
  });

  return (
    <div className="dashboard-shell">
      <div className="hidden lg:flex">
        <aside className="dashboard-sidebar" aria-label="Sample friend filters">
          <div className="dashboard-sidebar-head">
            <div className="dashboard-user">
              <FriendAvatar name="Atharva" className="h-9 w-9 shrink-0" />
              <div className="min-w-0">
                <p className="dashboard-user-label">Previewing as</p>
                <p className="dashboard-user-name">Atharva</p>
              </div>
            </div>

            <div className="dashboard-sidebar-title-row">
              <h2 className="dashboard-sidebar-title">Filter by friend</h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-[#858a9d]">
                <Users className="h-4 w-4" aria-hidden />
                Sample
              </span>
            </div>

            <div className="dashboard-friend-search">
              <Search aria-hidden />
              <input type="search" aria-label="Search sample friends" placeholder="Search friends" />
            </div>
          </div>

          <div className="dashboard-friend-list">
            <button
              type="button"
              onClick={() => setSelectedFriend(null)}
              className="dashboard-friend-button mb-1"
              aria-pressed={selectedFriend === null}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#26293a] text-xs font-semibold text-[#d8d0ff]">
                All
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="dashboard-friend-name block">All friends</span>
                <span className="dashboard-friend-count block">8 recommendations</span>
              </span>
            </button>

            <div className="space-y-1">
              {previewFriends.map((friend) => (
                <button
                  type="button"
                  key={friend.id}
                  onClick={() => setSelectedFriend(friend)}
                  className="dashboard-friend-button"
                  aria-pressed={selectedFriend?.id === friend.id}
                >
                  <span className="relative shrink-0">
                    <FriendAvatar name={friend.name} avatar={friend.avatar} className="h-9 w-9" />
                    {friend.isActive && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0d0e14] bg-[#65c78c]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="dashboard-friend-name block">{friend.name}</span>
                    <span className="dashboard-friend-count block">
                      {friend.recommendationCount} recommendations
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <div className="dashboard-workspace">
        <header className="dashboard-header">
          <div className="dashboard-header-row">
            <a href="/" className="dashboard-brand" aria-label="Go to Streaming Helper">
              <div className="dashboard-brand-mark">
                <IconMusic />
              </div>
              <div className="min-w-0">
                <h1 className="dashboard-brand-title">Streaming Helper</h1>
                <p className="dashboard-brand-copy">Recommendations from people you trust</p>
              </div>
            </a>

            <div className="dashboard-utility">
              <span className="hidden rounded-lg border border-[#8f7cf6]/25 bg-[#8f7cf6]/10 px-3 py-2 text-xs font-semibold text-[#d8d0ff] sm:inline-flex">
                Sample-data preview
              </span>
              <a href="/" className="dashboard-site-link">
                Website
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </a>
              <button type="button" className="dashboard-icon-button" aria-label="Preview notifications">
                <Bell className="h-5 w-5" aria-hidden />
              </button>
              <button type="button" className="dashboard-icon-button dashboard-desktop-utility" aria-label="Preview settings">
                <Settings className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>

          <div className="dashboard-nav-row">
            <div className="dashboard-primary-nav" role="tablist" aria-label="Dashboard preview sections">
              <button type="button" role="tab" aria-selected="true">Recommendations</button>
              <button type="button" role="tab" aria-selected="false">Comfort List</button>
            </div>
          </div>
        </header>

        <main className="dashboard-main">
          <div className="dashboard-content">
            <div className="dashboard-content-flow">
              <div className="dashboard-page-header">
                <div>
                  <h2 className="dashboard-page-title">
                    {selectedFriend ? `From ${selectedFriend.name}` : 'Recommendations'}
                  </h2>
                  <p className="dashboard-page-copy" aria-live="polite">
                    {visibleRecommendations.length} titles ready to explore
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
                  <button type="button" className="dashboard-primary-action" title="Disabled in sample-data preview">
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
          </div>
        </main>
      </div>
    </div>
  );
}
