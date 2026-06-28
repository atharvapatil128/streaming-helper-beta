// ── Invitation-link helpers (Beta 2, Phase 4) ────────────────────────────────
// Shared between App.tsx (route detection) and the InvitePage / AuthScreen.
// No secrets, no token logging.

/** localStorage key that preserves the invite token across auth + refresh. */
export const PENDING_INVITE_KEY = 'pendingInviteToken';

/** Must match the DB-side max length guard in lookup/respond_invitation. */
const MAX_TOKEN_LENGTH = 512;

/** True when the current path is the invite route (with or without a token). */
export function isInviteRoute(pathname: string): boolean {
  return pathname === '/invite' || pathname.startsWith('/invite/');
}

/**
 * Extract and validate the raw token from an `/invite/:token` path.
 * Returns null for missing, blank, malformed, or unreasonably long tokens.
 * Never logs the token.
 */
export function parseInviteToken(pathname: string): string | null {
  const match = pathname.match(/^\/invite\/([^/]+)\/?$/);
  if (!match) return null;

  let token: string;
  try {
    token = decodeURIComponent(match[1]);
  } catch {
    return null; // malformed percent-encoding
  }

  token = token.trim();
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  return token;
}
