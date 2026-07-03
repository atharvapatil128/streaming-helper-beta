export interface Friend {
  id: string;
  /** Profile UUID of the friend — needed for mutual unfriend operations. */
  friendUserId: string;
  name: string;
  /** Public @username of the friend, when claimed. Optional for mock data. */
  username?: string | null;
  avatar: string;
  isActive: boolean;
  recommendationCount: number;
}

export interface FriendRequest {
  id: string;
  requesterId: string;
  /**
   * Display name of the other party: the requester for incoming requests,
   * the recipient for outgoing (sent) requests.
   */
  requesterName: string | null;
  /** Public @username of the other party, when claimed. */
  requesterUsername: string | null;
  /**
   * Email of the other party. The safe RPCs introduced in migration 021
   * never expose other users' emails, so this is null for rows loaded
   * through them. Kept for display fallback of legacy in-memory rows only.
   */
  requesterEmail: string | null;
  /** Recipient profile UUID — populated for outgoing (sent) rows. */
  recipientId: string | null;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface Suggestion {
  id: string;
  title: string;
  type: 'movie' | 'series';
  thumbnail: string;
  year: string;
  rating: number;
  duration: string;
  recommendedBy: Array<{ name: string; avatar: string }>;
  genres: string[];
  platforms: string[];
}

export interface Permission {
  id: string;
  service: string;
  icon: string;
  isConnected: boolean;
  description: string;
}

export interface PendingInvite {
  id: string;
  email?: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted';
}

export interface StreamingService {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface Recommendation {
  id: string;
  tmdbId: number;
  title: string;
  type: 'movie' | 'series';
  thumbnail: string;
  year: string | null;
  rating: number | null;
  duration: string | null;
  genres: string[];
  platforms: string[];
  /** Display name of the friend who recommended this title. */
  sourceName: string;
  /** Profile UUID of the user who sent the recommendation (from_user_id). */
  fromUserId: string;
  /** Profile UUID of the recipient (to_user_id). Populated for sent recs. */
  toUserId: string;
  dismissed: boolean;
}

/** Derived in-app notification generated from real Supabase data. */
export interface AppNotification {
  id: string;
  type: 'recommendation';
  message: string;
  /** Display name of the person/source who triggered the notification. */
  sourceName: string;
  /** Title of the item referenced (e.g. movie name). */
  itemTitle: string;
}

export interface ComfortTitle {
  id: string;
  tmdbId?: number;
  title: string;
  type: 'movie' | 'series';
  thumbnail: string;
  year: string;
  duration: string;
  platform: string;
  isPinned: boolean;
  overview?: string;
}
