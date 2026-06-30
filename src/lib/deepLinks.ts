// ── Email deep-link helpers (Beta 2, Phase 3B) ───────────────────────────────
// Centralized parser for transactional-email CTA URLs. No PII is stored in
// the intent payload beyond a validated recommendation UUID.

/** sessionStorage key — cleared after terminal handling or on sign-out. */
export const DEEPLINK_INTENT_KEY = 'sh_deeplink_intent';

export type DeepLinkIntent =
  | { kind: 'notification-settings' }
  | { kind: 'friend-requests' }
  | { kind: 'recommendation-highlight'; recommendationId: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidRecommendationId(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Parse supported deep-link parameters from the current URL search string.
 * Returns null when no supported intent is present.
 * Invalid highlight values are NOT returned — callers should strip them.
 */
export function parseDeepLinkFromSearchParams(
  search: URLSearchParams
): DeepLinkIntent | null {
  const action = search.get('action');
  if (action === 'notification-settings') return { kind: 'notification-settings' };
  if (action === 'friend-requests') return { kind: 'friend-requests' };

  const highlight = search.get('highlight');
  if (highlight?.startsWith('rec:')) {
    const id = highlight.slice('rec:'.length);
    if (isValidRecommendationId(id)) {
      return { kind: 'recommendation-highlight', recommendationId: id };
    }
  }

  return null;
}

/** True when highlight= is present but fails validation (safe to strip). */
export function hasInvalidHighlightParam(search: URLSearchParams): boolean {
  const highlight = search.get('highlight');
  if (!highlight) return false;
  if (!highlight.startsWith('rec:')) return true;
  return !isValidRecommendationId(highlight.slice('rec:'.length));
}

/** Remove handled query params without disturbing pathname, hash, or other params. */
export function removeDeepLinkParams(
  intent: DeepLinkIntent | 'invalid-highlight'
): void {
  const url = new URL(window.location.href);

  if (intent === 'invalid-highlight') {
    url.searchParams.delete('highlight');
  } else if (intent.kind === 'recommendation-highlight') {
    url.searchParams.delete('highlight');
  } else {
    url.searchParams.delete('action');
  }

  const next = url.pathname + url.search + url.hash;
  window.history.replaceState(window.history.state, '', next || '/');
}

function isStoredIntent(value: unknown): value is DeepLinkIntent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.kind === 'notification-settings' || v.kind === 'friend-requests') return true;
  if (v.kind === 'recommendation-highlight') {
    return typeof v.recommendationId === 'string' && isValidRecommendationId(v.recommendationId);
  }
  return false;
}

/** Persist intent to sessionStorage. Returns false when storage is unavailable. */
export function persistDeepLinkIntent(intent: DeepLinkIntent): boolean {
  try {
    sessionStorage.setItem(DEEPLINK_INTENT_KEY, JSON.stringify(intent));
    return true;
  } catch {
    return false;
  }
}

/** Read stored intent without removing it (peek while prerequisites load). */
export function peekDeepLinkIntent(): DeepLinkIntent | null {
  try {
    const raw = sessionStorage.getItem(DEEPLINK_INTENT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredIntent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearDeepLinkIntent(): void {
  try {
    sessionStorage.removeItem(DEEPLINK_INTENT_KEY);
  } catch { /* ignore */ }
}

/**
 * Capture intent from the current URL on first load: persist to sessionStorage
 * and strip handled params only after a successful persist.
 */
export function captureDeepLinkFromUrl(): void {
  let search = new URLSearchParams(window.location.search);

  if (hasInvalidHighlightParam(search)) {
    removeDeepLinkParams('invalid-highlight');
    search = new URLSearchParams(window.location.search);
  }

  const intent = parseDeepLinkFromSearchParams(search);
  if (!intent) return;

  if (!persistDeepLinkIntent(intent)) return;

  removeDeepLinkParams(intent);
}
