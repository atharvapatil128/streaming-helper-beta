/** Invitation-link helpers shared by the router and authentication screens. */

export const PENDING_INVITE_KEY = 'pendingInviteToken';
const MAX_TOKEN_LENGTH = 512;

function normalizeInviteToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  return token;
}

export function isInviteRoute(pathname: string): boolean {
  return pathname === '/invite' || pathname.startsWith('/invite/');
}

export function parseInviteToken(pathname: string): string | null {
  const match = pathname.match(/^\/invite\/([^/]+)\/?$/);
  if (!match) return null;
  let token: string;
  try { token = decodeURIComponent(match[1]); } catch { return null; }
  return normalizeInviteToken(token);
}

export function invitePathForToken(token: string): string | null {
  const normalized = normalizeInviteToken(token);
  return normalized ? `/invite/${encodeURIComponent(normalized)}` : null;
}

export function persistPendingInviteToken(
  token: string,
  storage: Pick<Storage, 'setItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): boolean {
  const normalized = normalizeInviteToken(token);
  if (!normalized || !storage) return false;
  try { storage.setItem(PENDING_INVITE_KEY, normalized); return true; } catch { return false; }
}

export function readPendingInviteToken(
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): string | null {
  if (!storage) return null;
  try {
    const token = normalizeInviteToken(storage.getItem(PENDING_INVITE_KEY));
    if (!token) storage.removeItem(PENDING_INVITE_KEY);
    return token;
  } catch { return null; }
}

export function clearPendingInviteToken(
  storage: Pick<Storage, 'removeItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): void {
  try { storage?.removeItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
}
