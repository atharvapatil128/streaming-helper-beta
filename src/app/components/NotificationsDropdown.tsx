import { useState } from 'react'; // still used for actingOn / actionError
import { Check, X, Sparkles, Bell, UserPlus, Loader2 } from 'lucide-react';
import { FriendAvatar } from './FriendAvatar';
import type { AppNotification, FriendRequest } from '../../types';

interface NotificationsDropdownProps {
  notifications: AppNotification[];
  incomingRequests: FriendRequest[];
  /** IDs the user has already read. Managed by the parent so state survives dropdown close/open. */
  readIds: ReadonlySet<string>;
  /**
   * True while recommendations are still being fetched.
   * Prevents the "No notifications" empty state from flashing before data arrives.
   */
  loading?: boolean;
  onMarkRead:    (id: string) => void;
  onMarkAllRead: () => void;
  /**
   * Hide a notification from this dropdown without affecting the underlying record.
   * type distinguishes between recommendation and friend_request notifications so
   * the parent can build the correct stable key.
   */
  onDismiss: (id: string, type: 'recommendation' | 'friend_request') => void;
  onAcceptRequest:  (requestId: string, requesterId: string) => Promise<void>;
  onDeclineRequest: (requestId: string) => Promise<void>;
  onClose: () => void;
}

export function NotificationsDropdown({
  notifications,
  incomingRequests,
  readIds,
  loading = false,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
  onAcceptRequest,
  onDeclineRequest,
  onClose,
}: NotificationsDropdownProps) {
  const [actingOn, setActingOn]         = useState<string | null>(null);
  const [actionError, setActionError]   = useState<string | null>(null);

  const isUnread        = (id: string) => !readIds.has(id);
  const unreadRecCount  = notifications.filter((n) => isUnread(n.id)).length;
  const totalUnread     = unreadRecCount + incomingRequests.length;

  const handleAccept = async (req: FriendRequest) => {
    setActingOn(req.id);
    setActionError(null);
    try {
      await onAcceptRequest(req.id, req.requesterId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to accept.');
    } finally {
      setActingOn(null);
    }
  };

  const handleDecline = async (req: FriendRequest) => {
    setActingOn(req.id);
    setActionError(null);
    try {
      await onDeclineRequest(req.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to decline.');
    } finally {
      setActingOn(null);
    }
  };

  const isEmpty = incomingRequests.length === 0 && notifications.length === 0;

  return (
    <div className="absolute top-full right-0 mt-2 w-96 max-w-[calc(100vw-1rem)] bg-[#0f0f14] border border-[#1f1f28] rounded-xl shadow-2xl z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#1f1f28]">
        <div>
          <h3 className="text-[#e4e4e7]">Notifications</h3>
          {totalUnread > 0 && (
            <p className="text-xs text-[#8b8b9e] mt-0.5">{totalUnread} unread</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadRecCount > 0 && (
            <button
              onClick={onMarkAllRead}
              className="text-xs text-[#5b5bd6] hover:text-[#7c7ce8] transition-colors"
            >
              Mark all read
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#1f1f28] rounded transition-colors"
          >
            <X className="w-4 h-4 text-[#8b8b9e]" />
          </button>
        </div>
      </div>

      {/* Action error */}
      {actionError && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20">
          <p className="text-xs text-red-400">{actionError}</p>
        </div>
      )}

      {/* Body */}
      <div className="max-h-[500px] overflow-y-auto">
        {isEmpty && loading ? (
          /* Loading state — prevents empty state flashing before first fetch */
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 text-[#5b5bd6] animate-spin" />
          </div>
        ) : isEmpty ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-12 h-12 bg-[#1f1f28] rounded-full flex items-center justify-center mb-3">
              <Bell className="w-6 h-6 text-[#8b8b9e]" />
            </div>
            <h4 className="text-sm text-[#e4e4e7] mb-1">No new notifications yet</h4>
            <p className="text-xs text-[#8b8b9e]">
              Friend requests and new recommendations will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#1f1f28]">
            {/* ── Incoming friend requests (top, action required) ── */}
            {incomingRequests.map((req) => {
              const busy = actingOn === req.id;
              return (
                <div key={req.id} className="p-4 bg-[#5b5bd6]/5 hover:bg-[#1f1f28] transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="relative flex-shrink-0">
                      <FriendAvatar name={req.requesterName ?? req.requesterEmail} className="w-10 h-10" />
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#5b5bd6] rounded-full border-2 border-[#0f0f14]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <UserPlus className="w-4 h-4 text-[#5b5bd6] flex-shrink-0" />
                        <span className="text-sm text-[#8b8b9e]">Friend Request</span>
                      </div>
                      <p className="text-sm text-[#e4e4e7] mb-3">
                        <span className="font-medium">
                          {req.requesterName ?? req.requesterEmail}
                        </span>{' '}
                        wants to connect with you
                        {req.requesterName && (
                          <span className="text-[#8b8b9e]"> · {req.requesterEmail}</span>
                        )}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAccept(req)}
                          disabled={busy}
                          className="flex-1 px-3 py-1.5 bg-[#5b5bd6] hover:bg-[#7c7ce8] disabled:opacity-50 rounded-lg text-sm text-white flex items-center justify-center gap-1.5 transition-colors"
                        >
                          {busy
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Check className="w-3 h-3" />
                          }
                          Accept
                        </button>
                        <button
                          onClick={() => handleDecline(req)}
                          disabled={busy}
                          className="flex-1 px-3 py-1.5 bg-[#2a2a35] hover:bg-[#353545] disabled:opacity-50 rounded-lg text-sm text-[#e4e4e7] flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <X className="w-3 h-3" />
                          Decline
                        </button>
                      </div>
                    </div>
                    {/* Dismiss — hides from this dropdown; request stays pending */}
                    <button
                      onClick={() => onDismiss(req.id, 'friend_request')}
                      className="flex-shrink-0 p-1 text-[#8b8b9e] hover:text-[#e4e4e7] hover:bg-[#2a2a35] rounded transition-colors"
                      title="Dismiss from notifications (request stays pending)"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* ── Recommendation notifications ── */}
            {notifications.map((n) => {
              const unread = isUnread(n.id);
              return (
                <div
                  key={n.id}
                  className={`p-4 hover:bg-[#1f1f28] transition-colors ${unread ? 'bg-[#1f1f28]/30' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative flex-shrink-0">
                      <FriendAvatar name={n.sourceName} className="w-10 h-10" />
                      {unread && (
                        <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#5b5bd6] rounded-full border-2 border-[#0f0f14]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="w-4 h-4 text-[#fbbf24] flex-shrink-0" />
                        <span className="text-sm text-[#8b8b9e]">New Recommendation</span>
                      </div>
                      <p className="text-sm text-[#e4e4e7] mb-2">{n.message}</p>
                      {unread && (
                        <button
                          onClick={() => onMarkRead(n.id)}
                          className="text-xs text-[#5b5bd6] hover:text-[#7c7ce8] transition-colors"
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                    {/* Dismiss — hides from this dropdown; recommendation stays on the dashboard */}
                    <button
                      onClick={() => onDismiss(n.id, 'recommendation')}
                      className="flex-shrink-0 p-1 text-[#8b8b9e] hover:text-[#e4e4e7] hover:bg-[#2a2a35] rounded transition-colors"
                      title="Dismiss from notifications (recommendation stays on dashboard)"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {!isEmpty && (
        <div className="p-3 border-t border-[#1f1f28] text-center">
          <p className="text-xs text-[#8b8b9e]">
            {incomingRequests.length > 0
              ? `${incomingRequests.length} pending friend request${incomingRequests.length !== 1 ? 's' : ''}`
              : `${notifications.length} active recommendation${notifications.length !== 1 ? 's' : ''}`
            }
          </p>
        </div>
      )}
    </div>
  );
}
