import { X, UserPlus, MoreVertical, UserX, PauseCircle, PlayCircle, Check, Users, Clock, Mail, XCircle, UserCheck, Loader2, AlertCircle, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FriendAvatar } from './FriendAvatar';
import { friendRequestDisplayName } from '../../lib/friendRequests';
import type { Friend, FriendRequest } from '../../types';
import type { PendingInvitation } from '../hooks/usePendingInvitations';
import type { SentInvitation } from '../hooks/useSentInvitations';

// ── Display helpers ───────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(new Date(iso));
  } catch { return ''; }
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) <= new Date();
}

type FriendWithPause = Friend & { isPaused: boolean };

interface ManageFriendsModalProps {
  friends: Friend[];
  incomingRequests?: FriendRequest[];
  outgoingRequests?: FriendRequest[];
  onClose: () => void;
  onAddFriend: () => void;
  onRemoveFriend: (id: string) => void;
  onAcceptRequest?: (requestId: string, requesterId: string) => Promise<void>;
  onDeclineRequest?: (requestId: string) => Promise<void>;
  onCancelRequest?: (requestId: string) => void;
  // ── Received email invitation props (all optional — existing callers unchanged) ──
  pendingInvitations?:      PendingInvitation[];
  respondingInvitationIds?: ReadonlySet<string>;
  invitationErrors?:        Record<string, string>;
  onAcceptInvitation?:      (id: string) => void;
  onDeclineInvitation?:     (id: string) => void;
  onDismissInvitation?:     (id: string) => void;
  // ── Sent email invitation props (all optional — existing callers unchanged) ──
  sentInvitations?:             SentInvitation[];
  sentInvitationsLoading?:      boolean;
  sentInvitationsFetchError?:   string | null;
  revokingInvitationIds?:       ReadonlySet<string>;
  revokeInvitationErrorById?:   Record<string, string>;
  onRevokeInvitation?:          (id: string) => void;
  onRetryFetchSentInvitations?: () => void;
  /** Scroll incoming requests into view when opened from an email deep link. */
  focusIncomingRequests?: boolean;
}

export function ManageFriendsModal({
  friends: initialFriends,
  incomingRequests = [],
  outgoingRequests = [],
  onClose,
  onAddFriend,
  onRemoveFriend,
  onAcceptRequest,
  onDeclineRequest,
  onCancelRequest,
  pendingInvitations      = [],
  respondingInvitationIds = new Set<string>(),
  invitationErrors        = {},
  onAcceptInvitation,
  onDeclineInvitation,
  onDismissInvitation,
  sentInvitations,
  sentInvitationsLoading      = false,
  sentInvitationsFetchError   = null,
  revokingInvitationIds       = new Set<string>(),
  revokeInvitationErrorById   = {},
  onRevokeInvitation,
  onRetryFetchSentInvitations,
  focusIncomingRequests = false,
}: ManageFriendsModalProps) {
  const [friends, setFriends] = useState<FriendWithPause[]>(initialFriends.map(f => ({ ...f, isPaused: false })));
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const incomingSectionRef = useRef<HTMLDivElement>(null);
  // Tracks which request id is currently being accepted or declined
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeMenu) {
          setActiveMenu(null);
        } else {
          onClose();
        }
      }
    };

    const handleClickOutside = () => {
      if (activeMenu) {
        setActiveMenu(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [onClose, activeMenu]);

  useEffect(() => {
    if (!focusIncomingRequests) return;
    const scrollBehavior: ScrollBehavior =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    const timer = window.setTimeout(() => {
      incomingSectionRef.current?.scrollIntoView({ behavior: scrollBehavior, block: 'start' });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [focusIncomingRequests, incomingRequests.length]);

  const handleTogglePause = (friendId: string) => {
    setFriends(prev => prev.map(f =>
      f.id === friendId ? { ...f, isPaused: !f.isPaused } : f
    ));
    setActiveMenu(null);
  };

  const handleRemoveFriend = (friendId: string) => {
    if (window.confirm('Are you sure you want to remove this friend? Their recommendations will no longer appear in your feed.')) {
      setFriends(prev => prev.filter(f => f.id !== friendId));
      onRemoveFriend(friendId);
    }
    setActiveMenu(null);
  };

  const toggleMenu = (e: React.MouseEvent, friendId: string) => {
    e.stopPropagation();
    setActiveMenu(activeMenu === friendId ? null : friendId);
  };

  const handleAccept = async (req: FriendRequest) => {
    if (!onAcceptRequest || processingId) return;
    setProcessingId(req.id);
    setRequestError(null);
    try {
      await onAcceptRequest(req.id, req.requesterId);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Failed to accept request — please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (req: FriendRequest) => {
    if (!onDeclineRequest || processingId) return;
    setProcessingId(req.id);
    setRequestError(null);
    try {
      await onDeclineRequest(req.id);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Failed to decline request — please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f0f14] border border-[#1f1f28] rounded-2xl w-full max-w-3xl max-h-[85vh] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-[#1f1f28]">
          <div>
            <h2 className="text-xl text-[#e4e4e7]">Manage Friends</h2>
            <p className="text-sm text-[#8b8b9e] mt-1">Control who can share recommendations with you</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#1f1f28] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#8b8b9e]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[#e4e4e7] mb-1">Your Friends</h3>
              <p className="text-sm text-[#8b8b9e]">{friends.length} {friends.length === 1 ? 'person' : 'people'} in your network</p>
            </div>
            <button
              onClick={onAddFriend}
              className="px-4 py-2 bg-[#5b5bd6] hover:bg-[#7c7ce8] rounded-lg flex items-center gap-2 transition-colors text-white"
            >
              <UserPlus className="w-4 h-4" />
              Invite Friends
            </button>
          </div>

          {friends.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-14 h-14 bg-[#1f1f28] rounded-2xl flex items-center justify-center mb-3">
                <Users className="w-7 h-7 text-[#8b8b9e]" />
              </div>
              <p className="text-sm text-[#e4e4e7] mb-1">No friends yet</p>
              <p className="text-xs text-[#8b8b9e]">Add friends using the button above</p>
            </div>
          )}

          <div className="space-y-2">
            {friends.map((friend) => (
              <div
                key={friend.id}
                className={`p-4 bg-[#1f1f28] rounded-xl transition-colors ${
                  friend.isPaused ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="relative">
                      <FriendAvatar
                        name={friend.name}
                        avatar={friend.avatar}
                        className="w-12 h-12"
                      />
                      {friend.isActive && !friend.isPaused && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#4ade80] border-2 border-[#1f1f28] rounded-full" />
                      )}
                      {friend.isPaused && (
                        <div className="absolute inset-0 bg-[#0f0f14]/80 rounded-full flex items-center justify-center">
                          <PauseCircle className="w-6 h-6 text-[#8b8b9e]" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-[#e4e4e7]">{friend.name}</h4>
                        {friend.isPaused && (
                          <span className="px-2 py-0.5 bg-[#8b8b9e]/20 text-[#8b8b9e] rounded text-xs">
                            Paused
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[#8b8b9e]">
                        {friend.recommendationCount} {friend.recommendationCount === 1 ? 'recommendation' : 'recommendations'}
                      </p>
                    </div>
                  </div>

                  <div className="relative">
                    <button
                      onClick={(e) => toggleMenu(e, friend.id)}
                      className="p-2 hover:bg-[#2a2a35] rounded-lg transition-colors"
                    >
                      <MoreVertical className="w-5 h-5 text-[#8b8b9e]" />
                    </button>

                    {activeMenu === friend.id && (
                      <div
                        className="absolute right-0 top-12 w-56 bg-[#1f1f28] border border-[#2a2a35] rounded-lg shadow-2xl z-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleTogglePause(friend.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#2a2a35] transition-colors text-left rounded-t-lg"
                        >
                          {friend.isPaused ? (
                            <>
                              <PlayCircle className="w-4 h-4 text-[#4ade80]" />
                              <div>
                                <div className="text-sm text-[#e4e4e7]">Resume recommendations</div>
                                <div className="text-xs text-[#8b8b9e]">Show their suggestions again</div>
                              </div>
                            </>
                          ) : (
                            <>
                              <PauseCircle className="w-4 h-4 text-[#fbbf24]" />
                              <div>
                                <div className="text-sm text-[#e4e4e7]">Pause recommendations</div>
                                <div className="text-xs text-[#8b8b9e]">Hide their suggestions</div>
                              </div>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleRemoveFriend(friend.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#2a2a35] transition-colors text-left rounded-b-lg border-t border-[#2a2a35]"
                        >
                          <UserX className="w-4 h-4 text-[#ef4444]" />
                          <div>
                            <div className="text-sm text-[#ef4444]">Remove friend</div>
                            <div className="text-xs text-[#8b8b9e]">Permanently disconnect</div>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Accept / decline error */}
          {requestError && (
            <div className="flex items-start gap-2 text-sm text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {requestError}
            </div>
          )}

          {/* Incoming friend requests */}
          {incomingRequests.length > 0 && (
            <div ref={incomingSectionRef} className="border-t border-[#1f1f28] pt-6">
              <div className="flex items-center gap-2 mb-3">
                <UserCheck className="w-4 h-4 text-[#5b5bd6]" />
                <h3 className="text-[#e4e4e7]">Incoming Requests</h3>
                <span className="px-2 py-0.5 bg-[#5b5bd6]/20 text-[#5b5bd6] text-xs rounded-full">
                  {incomingRequests.length}
                </span>
              </div>
              <div className="space-y-2">
                {incomingRequests.map((req) => {
                  // Safe RPCs never expose the requester's email:
                  // display name → @username → generic label.
                  const displayName = friendRequestDisplayName(req);
                  const secondaryLine =
                    req.requesterName && req.requesterUsername
                      ? `@${req.requesterUsername}`
                      : 'Wants to connect on Streaming Helper';
                  const isProcessing = processingId === req.id;
                  return (
                    <div key={req.id} className="p-3 bg-[#1f1f28] rounded-xl flex items-center gap-3">
                      <FriendAvatar
                        name={displayName}
                        className="w-10 h-10 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#e4e4e7] font-medium truncate">{displayName}</p>
                        <p className="text-xs text-[#8b8b9e] truncate">{secondaryLine}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleDecline(req)}
                          disabled={!!processingId}
                          className="px-3 py-1.5 bg-[#2a2a35] hover:bg-[#ef4444]/20 hover:text-[#ef4444] text-[#8b8b9e] rounded-lg text-xs transition-colors disabled:opacity-40"
                        >
                          Decline
                        </button>
                        <button
                          onClick={() => handleAccept(req)}
                          disabled={!!processingId}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] text-white rounded-lg text-xs transition-colors disabled:opacity-40"
                        >
                          {isProcessing
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Check className="w-3.5 h-3.5" />
                          }
                          Accept
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Email invitations — sent before the recipient had an account */}
          {pendingInvitations.length > 0 && (
            <div className="border-t border-[#1f1f28] pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Mail className="w-4 h-4 text-[#5b5bd6]" />
                <h3 className="text-[#e4e4e7]">Email Invitations</h3>
                <span className="px-2 py-0.5 bg-[#5b5bd6]/20 text-[#5b5bd6] text-xs rounded-full">
                  {pendingInvitations.length}
                </span>
              </div>
              <div className="space-y-2">
                {pendingInvitations.map((inv) => {
                  const busy = (respondingInvitationIds as Set<string>).has(inv.invitation_id);
                  const invErr = invitationErrors[inv.invitation_id];
                  return (
                    <div key={inv.invitation_id} className="p-3 bg-[#1f1f28] rounded-xl">
                      <div className="flex items-center gap-3">
                        <FriendAvatar name={inv.inviter_display_name} className="w-10 h-10 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#e4e4e7] font-medium truncate">
                            {inv.inviter_display_name}
                          </p>
                          <p className="text-xs text-[#8b8b9e]">
                            Invited you to connect after you joined Streaming Helper
                          </p>
                          {invErr && (
                            <p className="text-xs text-[#ef4444] mt-1">{invErr}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => onDeclineInvitation?.(inv.invitation_id)}
                            disabled={busy || !!processingId}
                            className="px-3 py-1.5 bg-[#2a2a35] hover:bg-[#ef4444]/20 hover:text-[#ef4444] text-[#8b8b9e] rounded-lg text-xs transition-colors disabled:opacity-40"
                          >
                            Decline
                          </button>
                          <button
                            onClick={() => onAcceptInvitation?.(inv.invitation_id)}
                            disabled={busy || !!processingId}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] text-white rounded-lg text-xs transition-colors disabled:opacity-40"
                          >
                            {busy
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Check className="w-3.5 h-3.5" />
                            }
                            Accept
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => onDismissInvitation?.(inv.invitation_id)}
                        disabled={busy}
                        className="mt-1.5 ml-[52px] text-xs text-[#6a6a7e] hover:text-[#8b8b9e] transition-colors disabled:opacity-40"
                      >
                        Maybe later
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pending outgoing requests */}
          {outgoingRequests.length > 0 && (
            <div className="border-t border-[#1f1f28] pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-[#fbbf24]" />
                <h3 className="text-[#e4e4e7]">Pending Requests</h3>
                <span className="px-2 py-0.5 bg-[#fbbf24]/20 text-[#fbbf24] text-xs rounded-full">
                  {outgoingRequests.length}
                </span>
              </div>
              <div className="space-y-2">
                {outgoingRequests.map((req) => (
                  <div key={req.id} className="p-3 bg-[#1f1f28] rounded-xl flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#2a2a35] flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-[#8b8b9e]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Outgoing rows carry the recipient's display fields.
                          Safe RPCs never expose the recipient's email. */}
                      <p className="text-sm text-[#e4e4e7] truncate">{friendRequestDisplayName(req)}</p>
                      <p className="text-xs text-[#8b8b9e]">Waiting for them to accept</p>
                    </div>
                    {onCancelRequest ? (
                      <button
                        onClick={() => onCancelRequest(req.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a2a35] hover:bg-[#ef4444]/20 hover:text-[#ef4444] text-[#8b8b9e] rounded-lg text-xs transition-colors flex-shrink-0"
                        title="Cancel request"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    ) : (
                      <span className="px-2 py-0.5 bg-[#2a2a35] text-[#8b8b9e] text-xs rounded flex-shrink-0">
                        Pending
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Email Invitations Sent — only shown while loading, on error, or when rows exist */}
          {sentInvitations !== undefined &&
            (sentInvitationsLoading || !!sentInvitationsFetchError || sentInvitations.length > 0) && (
            <div className="border-t border-[#1f1f28] pt-6">
              <div className="flex items-center gap-2 mb-3">
                <Send className="w-4 h-4 text-[#8b8b9e]" />
                <h3 className="text-[#e4e4e7]">Email Invitations Sent</h3>
                {sentInvitations.length > 0 && (
                  <span className="px-2 py-0.5 bg-[#2a2a35] text-[#8b8b9e] text-xs rounded-full">
                    {sentInvitations.length}
                  </span>
                )}
              </div>

              {/* Loading — do not flash empty state while fetching */}
              {sentInvitationsLoading && sentInvitations.length === 0 && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 text-[#5b5bd6] animate-spin" />
                </div>
              )}

              {/* Fetch error */}
              {!sentInvitationsLoading && sentInvitationsFetchError && (
                <div className="flex items-start gap-2 text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span className="flex-1">{sentInvitationsFetchError}</span>
                  {onRetryFetchSentInvitations && (
                    <button
                      onClick={onRetryFetchSentInvitations}
                      className="text-[#8b8b9e] hover:text-[#e4e4e7] transition-colors whitespace-nowrap"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}

              {/* Rows */}
              {sentInvitations.length > 0 && (
                <div className="space-y-2">
                  {sentInvitations.map((inv) => {
                    const expired  = isExpired(inv.expires_at);
                    const revoking = (revokingInvitationIds as Set<string>).has(inv.id);
                    const revokeErr = revokeInvitationErrorById[inv.id];
                    return (
                      <div key={inv.id} className="p-3 bg-[#1f1f28] rounded-xl">
                        <div className="flex items-start gap-3">
                          {/* Avatar placeholder */}
                          <div className="w-10 h-10 rounded-full bg-[#2a2a35] flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Mail className="w-4 h-4 text-[#8b8b9e]" />
                          </div>
                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[#e4e4e7] font-medium truncate">
                              {inv.invitee_email}
                            </p>
                            <p className="text-xs text-[#8b8b9e]">
                              <span className={expired ? 'text-[#fbbf24]' : 'text-[#8b8b9e]'}>
                                {expired ? 'Expired' : 'Pending'}
                              </span>
                              {' · Sent '}
                              {formatDate(inv.created_at)}
                            </p>
                            <p className="text-xs text-[#6a6a7e]">
                              {expired ? 'Expired' : 'Expires'} {formatDate(inv.expires_at)}
                            </p>
                            {revokeErr && (
                              <p className="text-xs text-[#ef4444] mt-1">{revokeErr}</p>
                            )}
                          </div>
                          {/* Action */}
                          <button
                            onClick={() => onRevokeInvitation?.(inv.id)}
                            disabled={revoking}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a2a35] hover:bg-[#ef4444]/20 hover:text-[#ef4444] text-[#8b8b9e] rounded-lg text-xs transition-colors disabled:opacity-40 flex-shrink-0"
                          >
                            {revoking
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <XCircle className="w-3.5 h-3.5" />
                            }
                            {expired ? 'Remove' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="pt-6 border-t border-[#1f1f28]">
            <div className="p-4 bg-[#1f1f28] rounded-xl border border-[#2a2a35]">
              <h4 className="text-sm text-[#e4e4e7] mb-2 flex items-center gap-2">
                <div className="w-5 h-5 bg-[#5b5bd6]/20 rounded flex items-center justify-center">
                  <span className="text-xs text-[#5b5bd6]">ℹ</span>
                </div>
                Managing Your Network
              </h4>
              <ul className="text-xs text-[#8b8b9e] leading-relaxed space-y-1">
                <li className="flex items-start gap-2">
                  <Check className="w-3 h-3 text-[#5b5bd6] mt-0.5 flex-shrink-0" />
                  <span>You control whose recommendations appear in your Streaming Helper feed</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-3 h-3 text-[#5b5bd6] mt-0.5 flex-shrink-0" />
                  <span>Pausing a friend hides their suggestions without removing them</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-3 h-3 text-[#5b5bd6] mt-0.5 flex-shrink-0" />
                  <span>Removing a friend is permanent and cannot be undone</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-[#1f1f28] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-[#5b5bd6] hover:bg-[#7c7ce8] rounded-lg text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
