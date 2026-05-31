// ============================================================================
// Edge Function — delete-account
//
// Permanently deletes the calling user's app data and their auth.users row.
//
// Security model
// ──────────────
// • The user's JWT is read from the `Authorization: Bearer …` header.
// • A "user client" (anon key + caller's JWT) verifies who the caller is via
//   getUser(). If verification fails, the request is rejected with 401.
// • An "admin client" (service_role key) is then used to:
//     1. Delete all rows in public.* belonging to that user.
//     2. Delete the auth.users row via auth.admin.deleteUser().
// • The service_role key NEVER leaves the Edge Function runtime — it is read
//   from Deno env (set via `supabase secrets set …`) and is not bundled into
//   the frontend.
//
// Required Edge Function secrets (set with `supabase secrets set`):
//   SUPABASE_URL                — your project URL
//   SUPABASE_ANON_KEY           — anon/public key (used to verify the JWT)
//   SUPABASE_SERVICE_ROLE_KEY   — service-role key (admin actions only)
//
// Deploy:    supabase functions deploy delete-account
// Invoke:    await supabase.functions.invoke('delete-account')
// ============================================================================

// @ts-expect-error — Deno-style remote import resolved by the Edge runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// @ts-expect-error — `Deno` is the Edge Function global; not visible to tsc
declare const Deno: { env: { get(name: string): string | undefined } };

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// @ts-expect-error — Deno.serve is the Edge runtime entry point
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // ── 1. Read environment ────────────────────────────────────────────────────
  const SUPABASE_URL              = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('delete-account: missing required env vars');
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  // ── 2. Verify caller via Authorization header ─────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }
  const jwt = authHeader.slice('Bearer '.length).trim();
  if (!jwt) {
    return jsonResponse({ error: 'Empty bearer token' }, 401);
  }

  // User-scoped client — only used to validate the JWT.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'Invalid or expired session' }, 401);
  }
  const userId = userData.user.id;

  // ── 3. Admin client (service-role) — used for all destructive actions ────
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 4. Delete public app data (most-dependent rows first) ─────────────────
  // Each step is awaited individually so a single failure aborts the flow
  // before we reach the irreversible auth.users deletion.
  try {
    const steps: Array<{ label: string; run: () => Promise<{ error: unknown }> }> = [
      {
        label: 'friendships',
        run: () => admin.from('friendships').delete().or(`user_id.eq.${userId},friend_id.eq.${userId}`),
      },
      {
        label: 'friend_requests',
        run: () => admin.from('friend_requests').delete().or(`requester_id.eq.${userId},recipient_id.eq.${userId}`),
      },
      {
        label: 'recommendations',
        run: () => admin.from('recommendations').delete().or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`),
      },
      {
        label: 'comfort_titles',
        run: () => admin.from('comfort_titles').delete().eq('user_id', userId),
      },
      {
        label: 'connected_services',
        run: () => admin.from('connected_services').delete().eq('user_id', userId),
      },
      {
        label: 'notification_reads',
        run: () => admin.from('notification_reads').delete().eq('user_id', userId),
      },
      {
        label: 'profiles',
        run: () => admin.from('profiles').delete().eq('id', userId),
      },
    ];

    for (const step of steps) {
      const { error } = await step.run();
      if (error) {
        console.error(`delete-account: failed at ${step.label}`, error);
        return jsonResponse(
          { error: `Failed to delete ${step.label}`, detail: (error as { message?: string }).message },
          500,
        );
      }
    }
  } catch (err) {
    console.error('delete-account: public data cleanup threw', err);
    return jsonResponse({ error: 'Failed to delete app data' }, 500);
  }

  // ── 5. Delete the auth.users row (irreversible) ──────────────────────────
  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    console.error('delete-account: auth user delete failed', authDeleteError);
    return jsonResponse(
      { error: 'App data was removed, but the auth account could not be deleted', detail: authDeleteError.message },
      500,
    );
  }

  return jsonResponse({ success: true, userId }, 200);
});
