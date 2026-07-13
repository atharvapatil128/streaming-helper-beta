/**
 * TypeScript types for the Supabase database schema.
 *
 * Once you have the Supabase CLI installed and your project linked, regenerate
 * this file automatically with:
 *
 *   npx supabase gen types typescript --project-id <your-project-id> > src/lib/database.types.ts
 *
 * Until then this hand-written version keeps the client fully typed.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          /** Canonical lowercase public handle. NULL until claimed (migration 021). */
          username: string | null;
          /** Set when username is claimed/changed; enforces the 30-day cooldown. */
          username_changed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        // username / username_changed_at are intentionally absent: they are
        // writable only through the claim_username / change_username RPCs
        // (trigger guard in migration 021, column grants in migration 022).
        // updated_at is maintained by a database trigger since migration 021.
        Update: {
          display_name?: string | null;
          avatar_url?: string | null;
        };
      };
      friend_requests: {
        Row: {
          id: string;
          requester_id: string;
          recipient_id: string | null;
          recipient_email: string;
          status: 'pending' | 'accepted' | 'declined';
          responded_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          recipient_id?: string | null;
          recipient_email: string;
          status?: 'pending' | 'accepted' | 'declined';
          responded_at?: string | null;
          created_at?: string;
        };
        Update: {
          status?: 'pending' | 'accepted' | 'declined';
          responded_at?: string | null;
        };
      };
      friendships: {
        Row: {
          id: string;
          user_id: string;
          friend_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          friend_id: string;
          created_at?: string;
        };
        Update: never;
      };
      friends: {
        Row: {
          id: string;
          user_id: string;
          friend_id: string | null;
          friend_name: string | null;
          friend_email: string | null;
          status: 'pending' | 'accepted' | 'paused';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          friend_id?: string | null;
          friend_name?: string | null;
          friend_email?: string | null;
          status?: 'pending' | 'accepted' | 'paused';
          created_at?: string;
        };
        Update: {
          friend_name?: string | null;
          friend_email?: string | null;
          status?: 'pending' | 'accepted' | 'paused';
        };
      };
      recommendations: {
        Row: {
          id: string;
          from_user_id: string;
          to_user_id: string;
          tmdb_id: number;
          media_type: 'movie' | 'series';
          title: string;
          thumbnail_url: string | null;
          year: string | null;
          rating: number | null;
          duration: string | null;
          genres: string[];
          platforms: string[];
          source_name: string | null;
          dismissed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          from_user_id: string;
          to_user_id: string;
          tmdb_id: number;
          media_type: 'movie' | 'series';
          title: string;
          thumbnail_url?: string | null;
          year?: string | null;
          rating?: number | null;
          duration?: string | null;
          genres?: string[];
          platforms?: string[];
          source_name?: string | null;
          dismissed?: boolean;
          created_at?: string;
        };
        Update: {
          dismissed?: boolean;
          platforms?: string[];
          source_name?: string | null;
        };
      };
      comfort_titles: {
        Row: {
          id: string;
          user_id: string;
          tmdb_id: number | null;
          title: string;
          thumbnail_url: string | null;
          year: string | null;
          media_type: 'movie' | 'series' | null;
          is_pinned: boolean;
          note: string | null;
          platform: string | null;
          overview: string | null;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tmdb_id?: number | null;
          title: string;
          thumbnail_url?: string | null;
          year?: string | null;
          media_type?: 'movie' | 'series' | null;
          is_pinned?: boolean;
          note?: string | null;
          platform?: string | null;
          overview?: string | null;
          source?: string;
          created_at?: string;
        };
        Update: {
          title?: string;
          thumbnail_url?: string | null;
          is_pinned?: boolean;
          note?: string | null;
          platform?: string | null;
          overview?: string | null;
        };
      };
      connected_services: {
        Row: {
          id: string;
          user_id: string;
          service_name: string;
          service_icon: string | null;
          is_connected: boolean;
          access_token_enc: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          service_name: string;
          service_icon?: string | null;
          is_connected?: boolean;
          access_token_enc?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          is_connected?: boolean;
          access_token_enc?: string | null;
          updated_at?: string;
        };
      };
      events: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          payload?: Json | null;
          created_at?: string;
        };
        Update: never;
      };
    };
    Views: Record<string, never>;
    Functions: {
      // ── Friends (migration 008) ──────────────────────────────────────────
      remove_friend: {
        Args: { target_friend_id: string };
        Returns: number;
      };
      // ── Invitations (migrations 015–017) ─────────────────────────────────
      lookup_invitation: {
        Args: { p_token: string };
        Returns: {
          inviter_display_name: string | null;
          status: string;
          is_expired: boolean;
        }[];
      };
      respond_invitation: {
        Args: { p_token: string; p_action: string };
        Returns: string;
      };
      list_my_pending_invitations: {
        Args: Record<string, never>;
        Returns: {
          invitation_id: string;
          inviter_display_name: string | null;
          created_at: string;
          expires_at: string;
        }[];
      };
      respond_to_my_invitation: {
        Args: { p_invitation_id: string; p_action: string };
        Returns: string;
      };
      revoke_my_invitation: {
        Args: { p_invitation_id: string };
        Returns: string;
      };
      // ── Usernames + safe profile reads (migration 021) ───────────────────
      check_username_available: {
        Args: { p_username: string };
        Returns: boolean;
      };
      claim_username: {
        Args: { p_username: string };
        Returns: { username: string }[];
      };
      change_username: {
        Args: { p_username: string };
        Returns: { username: string; changed_at: string }[];
      };
      lookup_profile_by_username: {
        Args: { p_username: string };
        Returns: SafeProfileLookupRow[];
      };
      lookup_profile_by_email: {
        Args: { p_email: string };
        Returns: SafeProfileLookupRow[];
      };
      send_friend_request_by_username: {
        Args: { p_username: string };
        Returns: SendFriendRequestResultRow[];
      };
      send_friend_request_by_email: {
        Args: { p_email: string };
        Returns: SendFriendRequestResultRow[];
      };
      get_my_friend_profiles: {
        Args: Record<string, never>;
        Returns: {
          friendship_id: string;
          friend_user_id: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
        }[];
      };
      get_incoming_friend_requests_safe: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          requester_id: string;
          status: string;
          created_at: string;
          requester_username: string | null;
          requester_display_name: string | null;
          requester_avatar_url: string | null;
        }[];
      };
      get_my_sent_friend_requests_safe: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          recipient_id: string | null;
          status: string;
          created_at: string;
          recipient_username: string | null;
          recipient_display_name: string | null;
          recipient_avatar_url: string | null;
        }[];
      };
      search_profiles_by_username_prefix: {
        Args: { p_query: string };
        Returns: UsernameSearchResultRow[];
      };
      get_sent_recommendation_recipients_safe: {
        Args: Record<string, never>;
        Returns: {
          profile_id: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
        }[];
      };
    };
    Enums: Record<string, never>;
  };
}

// ── Shared RPC result shapes ──────────────────────────────────────────────────

/**
 * Result row returned by search_profiles_by_username_prefix (migration 023).
 * Never contains email or any internal column.
 */
export interface UsernameSearchResultRow {
  user_id:      string;
  username:     string;
  display_name: string | null;
  avatar_url:   string | null;
}

// ── Shared RPC result shapes (migration 021) ────────────────────────────────

/**
 * Safe cross-user profile shape returned by lookup_profile_by_email and
 * lookup_profile_by_username. Never contains the profile's email address.
 */
export interface SafeProfileLookupRow {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

/** Stable status codes returned by the two friend-request send RPCs. */
export type SendFriendRequestStatus =
  | 'SENT'
  | 'EMAIL_INVALID'
  | 'USERNAME_INVALID'
  | 'RECIPIENT_NOT_FOUND'
  | 'CANNOT_REQUEST_SELF'
  | 'ALREADY_FRIENDS'
  | 'REQUEST_ALREADY_PENDING'
  | 'RATE_LIMITED'
  | 'UNAUTHENTICATED';

/**
 * Result row returned by send_friend_request_by_email and
 * send_friend_request_by_username. Non-status fields are null unless
 * status === 'SENT'. Never contains the recipient's email address.
 */
export interface SendFriendRequestResultRow {
  status: SendFriendRequestStatus;
  request_id: string | null;
  recipient_id: string | null;
  recipient_username: string | null;
  recipient_display_name: string | null;
  recipient_avatar_url: string | null;
}
