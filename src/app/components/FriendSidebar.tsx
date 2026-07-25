import { AlertCircle, Loader2, Search, UserPlus, Users, X } from 'lucide-react';
import { useState } from 'react';
import { FriendAvatar } from './FriendAvatar';
import { useProfile } from '../hooks/useProfile';
import type { Friend } from '../../types';

interface FriendSidebarProps {
  friends: Friend[];
  loading?: boolean;
  error?: string | null;
  selectedFriend: Friend | null;
  onSelectFriend: (friend: Friend | null) => void;
  onAddFriend: () => void;
  onManageFriends: () => void;
  onClose?: () => void;
}

export function FriendSidebar({
  friends,
  loading = false,
  error = null,
  selectedFriend,
  onSelectFriend,
  onAddFriend,
  onManageFriends,
  onClose,
}: FriendSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { profile } = useProfile();

  const greetingName =
    profile?.displayName?.trim() ||
    profile?.email?.split('@')[0] ||
    null;

  const filteredFriends = friends.filter((friend) =>
    friend.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const allRecommendationCount = friends.reduce(
    (total, friend) => total + friend.recommendationCount,
    0,
  );

  return (
    <aside className="dashboard-sidebar" aria-label="Friend filters">
      {onClose && (
        <div className="flex items-center justify-between px-4 pt-4">
          <span className="text-sm font-semibold text-[#f1f2f6]">Friend filters</span>
          <button
            type="button"
            onClick={onClose}
            className="dashboard-icon-button"
            aria-label="Close friends panel"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      <div className="dashboard-sidebar-head">
        {greetingName && (
          <div className="dashboard-user">
            <FriendAvatar
              name={greetingName}
              avatar={profile?.avatarUrl ?? undefined}
              className="h-9 w-9 shrink-0"
            />
            <div className="min-w-0">
              <p className="dashboard-user-label">Signed in as</p>
              <p className="dashboard-user-name">{greetingName}</p>
            </div>
          </div>
        )}

        <div className="dashboard-sidebar-title-row">
          <h2 className="dashboard-sidebar-title">Filter by friend</h2>
          <div className="dashboard-sidebar-actions">
            <button
              type="button"
              onClick={onManageFriends}
              className="dashboard-icon-button"
              aria-label="Manage friends"
            >
              <Users className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onAddFriend}
              className="dashboard-icon-button bg-[#6959ca] !text-white hover:bg-[#7968db]"
              aria-label="Add friend"
            >
              <UserPlus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="dashboard-friend-search">
          <Search aria-hidden />
          <input
            type="search"
            aria-label="Search friends"
            placeholder="Search friends"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="dashboard-friend-list">
        {loading && (
          <div className="flex items-center justify-center py-10" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-[#8f7cf6]" aria-hidden />
            <span className="sr-only">Loading friends</span>
          </div>
        )}

        {!loading && error && (
          <div className="mx-1 mb-2 flex items-start gap-2 rounded-lg border border-[#ff7d86]/20 bg-[#ff7d86]/10 px-3 py-2 text-xs text-[#ff9aa1]" role="alert">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {error}
          </div>
        )}

        {!loading && (
          <>
            <button
              type="button"
              onClick={() => onSelectFriend(null)}
              className="dashboard-friend-button mb-1"
              aria-pressed={selectedFriend === null}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#26293a] text-xs font-semibold text-[#d8d0ff]">
                All
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="dashboard-friend-name block">All friends</span>
                <span className="dashboard-friend-count block">
                  {allRecommendationCount} recommendations
                </span>
              </span>
            </button>

            {friends.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center px-3 py-9 text-center">
                <Users className="mb-3 h-7 w-7 text-[#858a9d]" aria-hidden />
                <p className="max-w-[22ch] text-xs leading-relaxed text-[#858a9d]">
                  Add a friend to start exchanging recommendations.
                </p>
              </div>
            )}

            {friends.length > 0 && filteredFriends.length === 0 && (
              <p className="px-2 py-5 text-center text-xs text-[#858a9d]">
                No friends match “{searchQuery}”.
              </p>
            )}

            <div className="space-y-1">
              {filteredFriends.map((friend) => (
                <button
                  type="button"
                  key={friend.id}
                  onClick={() => onSelectFriend(friend)}
                  className="dashboard-friend-button"
                  aria-pressed={selectedFriend?.id === friend.id}
                >
                  <span className="relative shrink-0">
                    <FriendAvatar
                      name={friend.name}
                      avatar={friend.avatar}
                      className="h-9 w-9"
                    />
                    {friend.isActive && (
                      <span
                        className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0d0e14] bg-[#65c78c]"
                        aria-label="Active"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="dashboard-friend-name block">{friend.name}</span>
                    <span className="dashboard-friend-count block">
                      {friend.recommendationCount}{' '}
                      {friend.recommendationCount === 1 ? 'recommendation' : 'recommendations'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
