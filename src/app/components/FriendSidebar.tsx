import { Search, UserPlus, Users, Loader2, AlertCircle, X } from 'lucide-react';
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
  /** When provided, a close button is shown (used in the mobile drawer). */
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

  // display_name takes priority; fall back to the part of the email before "@"
  const greetingName =
    profile?.displayName?.trim() ||
    profile?.email?.split('@')[0] ||
    null;

  const filteredFriends = friends.filter((friend) =>
    friend.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside className="w-80 border-r border-[#1f1f28] bg-[#0f0f14] flex flex-col h-full">
      {/* Mobile drawer close button */}
      {onClose && (
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="text-sm font-medium text-[#e4e4e7]">Friends</span>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#1f1f28] rounded-lg transition-colors"
            aria-label="Close friends panel"
          >
            <X className="w-4 h-4 text-[#8b8b9e]" />
          </button>
        </div>
      )}
      <div className="p-6 border-b border-[#1f1f28]">
        {/* User greeting — text only, no card box */}
        {greetingName && (
          <div className="mb-5">
            <p className="text-sm text-[#8b8b9e] mb-2">Welcome back,</p>
            <div className="flex items-center gap-2.5 min-w-0">
              <FriendAvatar
                name={greetingName}
                avatar={profile?.avatarUrl ?? undefined}
                className="w-8 h-8 flex-shrink-0"
              />
              <p className="text-[22px] font-bold leading-tight text-[#e4e4e7] truncate">{greetingName}</p>
            </div>
            <div className="mt-5 h-px bg-[#1f1f28]" />
          </div>
        )}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[#e4e4e7]">Friends</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={onManageFriends}
              className="p-2 hover:bg-[#1f1f28] rounded-lg transition-colors"
              title="Manage friends"
            >
              <Users className="w-4 h-4 text-[#8b8b9e]" />
            </button>
            <button
              onClick={onAddFriend}
              className="p-2 bg-[#5b5bd6] hover:bg-[#7c7ce8] rounded-lg transition-colors"
              title="Add friend"
            >
              <UserPlus className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b8b9e]" />
          <input
            type="text"
            placeholder="Search friends..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1f1f28] border border-[#2a2a35] rounded-lg pl-10 pr-4 py-2 text-sm text-[#e4e4e7] placeholder:text-[#8b8b9e] focus:outline-none focus:border-[#5b5bd6] transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 text-[#5b5bd6] animate-spin" />
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="flex items-start gap-2 text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2 mx-1 mb-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {!loading && (
          <>
        <button
          onClick={() => onSelectFriend(null)}
          className={`w-full flex items-center gap-3 p-3 rounded-lg mb-2 transition-colors ${
            selectedFriend === null
              ? 'bg-[#5b5bd6] text-white'
              : 'hover:bg-[#1f1f28] text-[#e4e4e7]'
          }`}
        >
          <div className="w-10 h-10 bg-gradient-to-br from-[#5b5bd6] to-[#7c7ce8] rounded-full flex items-center justify-center text-sm font-medium">
            All
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm">All Friends</div>
            <div className={`text-xs ${selectedFriend === null ? 'text-[#c5c5e8]' : 'text-[#8b8b9e]'}`}>
              {friends.reduce((acc, f) => acc + f.recommendationCount, 0)} recommendations
            </div>
          </div>
        </button>

        {/* Empty state — no friends at all */}
        {friends.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-8 text-center px-2">
            <Users className="w-8 h-8 text-[#8b8b9e] mb-2" />
            <p className="text-xs text-[#8b8b9e]">No friends yet — add one with the button above</p>
          </div>
        )}

        {/* Empty state — friends exist but search matches none */}
        {friends.length > 0 && filteredFriends.length === 0 && (
          <p className="text-xs text-[#8b8b9e] text-center py-4 px-2">
            No friends match "{searchQuery}"
          </p>
        )}

        <div className="space-y-1">
          {filteredFriends.map((friend) => (
            <button
              key={friend.id}
              onClick={() => onSelectFriend(friend)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                selectedFriend?.id === friend.id
                  ? 'bg-[#5b5bd6] text-white'
                  : 'hover:bg-[#1f1f28] text-[#e4e4e7]'
              }`}
            >
              <div className="relative">
                <FriendAvatar
                  name={friend.name}
                  avatar={friend.avatar}
                  className="w-10 h-10"
                />
                {friend.isActive && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#4ade80] border-2 border-[#0f0f14] rounded-full" />
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm">{friend.name}</div>
                <div className={`text-xs ${selectedFriend?.id === friend.id ? 'text-[#c5c5e8]' : 'text-[#8b8b9e]'}`}>
                  {friend.recommendationCount} {friend.recommendationCount === 1 ? 'recommendation' : 'recommendations'}
                </div>
              </div>
            </button>
          ))}
        </div>
          </>
        )}
      </div>
    </aside>
  );
}
