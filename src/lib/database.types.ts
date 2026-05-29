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
        Update: {
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
