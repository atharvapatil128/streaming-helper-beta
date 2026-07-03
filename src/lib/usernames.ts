import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Shared username utilities — Beta 2 Phase 2B.
//
// Client-side validation mirrors public.normalize_username_input (migration
// 021) exactly. The database remains authoritative: claim_username and
// change_username re-validate, re-check availability, and enforce the 30-day
// cooldown regardless of what the client computed.
// ─────────────────────────────────────────────────────────────────────────────

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

// ── Normalization + validation (mirrors migration 021) ──────────────────────

export function normalizeUsernameInput(value: string): string {
  return value.trim().toLowerCase();
}

export type UsernameValidationResult =
  | { valid: true; username: string }
  | { valid: false; message: string };

export function validateUsername(value: string): UsernameValidationResult {
  const v = normalizeUsernameInput(value);

  if (!v) {
    return { valid: false, message: 'Enter a username.' };
  }
  if (v.length < USERNAME_MIN_LENGTH || v.length > USERNAME_MAX_LENGTH) {
    return { valid: false, message: 'Use 3–30 characters.' };
  }
  if (!/^[a-z0-9_]+$/.test(v)) {
    return {
      valid: false,
      message: 'Only lowercase letters, numbers, and underscores are allowed.',
    };
  }
  if (v.startsWith('_') || v.endsWith('_')) {
    return { valid: false, message: "Usernames can't start or end with an underscore." };
  }
  if (v.includes('__')) {
    return { valid: false, message: "Usernames can't contain consecutive underscores." };
  }
  if (/^[0-9]+$/.test(v)) {
    return { valid: false, message: "Usernames can't be all numbers." };
  }

  return { valid: true, username: v };
}

// ── Stable error mapping ─────────────────────────────────────────────────────

export type UsernameErrorCode =
  | 'USERNAME_INVALID'
  | 'USERNAME_UNAVAILABLE'
  | 'USERNAME_ALREADY_SET'
  | 'USERNAME_NOT_SET'
  | 'USERNAME_UNCHANGED'
  | 'COOLDOWN_ACTIVE'
  | 'UNAUTHENTICATED'
  | 'UNEXPECTED';

const USERNAME_ERROR_MESSAGES: Record<UsernameErrorCode, string> = {
  USERNAME_INVALID:
    'Use 3–30 characters with lowercase letters, numbers, or underscores.',
  USERNAME_UNAVAILABLE: "That username isn't available.",
  USERNAME_ALREADY_SET: 'You already have a username.',
  USERNAME_NOT_SET: 'Choose a username before trying to change it.',
  USERNAME_UNCHANGED: 'That is already your username.',
  COOLDOWN_ACTIVE: 'You can only change your username once every 30 days.',
  UNAUTHENTICATED: 'Your session has expired. Please sign in again.',
  UNEXPECTED: "We couldn't save your username. Please try again.",
};

/** Error with a stable code and a user-safe message. Never carries raw DB text. */
export class UsernameRpcError extends Error {
  readonly code: UsernameErrorCode;

  constructor(code: UsernameErrorCode) {
    super(USERNAME_ERROR_MESSAGES[code]);
    this.name = 'UsernameRpcError';
    this.code = code;
  }
}

// Stable markers raised by the migration-021 RPCs. No marker is a substring
// of another, so `includes` matching is unambiguous.
const KNOWN_MARKERS: UsernameErrorCode[] = [
  'USERNAME_UNAVAILABLE',
  'USERNAME_UNCHANGED',
  'USERNAME_ALREADY_SET',
  'USERNAME_NOT_SET',
  'USERNAME_INVALID',
  'COOLDOWN_ACTIVE',
  'UNAUTHENTICATED',
];

function toUsernameRpcError(
  operation: string,
  error: { message?: string; code?: string }
): UsernameRpcError {
  const raw = error.message ?? '';
  const marker = KNOWN_MARKERS.find((m) => raw.includes(m));
  if (marker) return new UsernameRpcError(marker);

  // Unexpected failure: log operation + safe code only, never raw DB text to UI.
  console.error(`[Streaming Helper] RPC ${operation} failed`, {
    code: error.code ?? 'unknown',
  });
  return new UsernameRpcError('UNEXPECTED');
}

// ── RPC wrappers ─────────────────────────────────────────────────────────────

/**
 * Advisory availability result for authenticated claim/change UI only.
 * The anonymous signup form does not call this RPC (migration 021 grants it
 * to authenticated users only).
 * 'unknown' covers transient RPC failures — claim/change remains authoritative.
 * A 'false' from the RPC can mean invalid, taken, reserved, held, or
 * rate-limited — never assume it means "owned by someone else".
 */
export type UsernameAvailability = 'available' | 'unavailable' | 'unknown';

export async function checkUsernameAvailable(
  username: string
): Promise<UsernameAvailability> {
  const validated = validateUsername(username);
  if (!validated.valid) return 'unavailable';

  const { data, error } = await supabase.rpc('check_username_available', {
    p_username: validated.username,
  });

  if (error) {
    console.error('[Streaming Helper] RPC check_username_available failed', {
      code: error.code ?? 'unknown',
    });
    return 'unknown';
  }

  return data === true ? 'available' : 'unavailable';
}

/** Claim a first username via claim_username(). Returns the stored username. */
export async function claimUsernameRpc(username: string): Promise<string> {
  const validated = validateUsername(username);
  if (!validated.valid) throw new UsernameRpcError('USERNAME_INVALID');

  const { data, error } = await supabase.rpc('claim_username', {
    p_username: validated.username,
  });

  if (error) throw toUsernameRpcError('claim_username', error);

  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.username) {
    console.error('[Streaming Helper] RPC claim_username returned no row');
    throw new UsernameRpcError('UNEXPECTED');
  }
  return row.username;
}

/** Change an existing username via change_username(). */
export async function changeUsernameRpc(
  username: string
): Promise<{ username: string; changedAt: string }> {
  const validated = validateUsername(username);
  if (!validated.valid) throw new UsernameRpcError('USERNAME_INVALID');

  const { data, error } = await supabase.rpc('change_username', {
    p_username: validated.username,
  });

  if (error) throw toUsernameRpcError('change_username', error);

  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.username || !row.changed_at) {
    console.error('[Streaming Helper] RPC change_username returned no row');
    throw new UsernameRpcError('UNEXPECTED');
  }
  return { username: row.username, changedAt: row.changed_at };
}

// ── Cooldown helper (display only — database stays authoritative) ───────────

export function getNextUsernameChangeDate(
  usernameChangedAt: string | null
): Date | null {
  if (!usernameChangedAt) return null;
  const changed = new Date(usernameChangedAt).getTime();
  if (Number.isNaN(changed)) return null;
  return new Date(changed + USERNAME_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
}

export function isUsernameChangeCoolingDown(
  usernameChangedAt: string | null
): boolean {
  const next = getNextUsernameChangeDate(usernameChangedAt);
  return next !== null && next.getTime() > Date.now();
}

// ── Pending signup username intent (localStorage) ────────────────────────────
// Email confirmation may open a new tab, so localStorage (not sessionStorage)
// is required. Entries are scoped to the normalized signup email so a
// different account signing in on the same browser can never claim them.
// Only { username, createdAt } is stored per email — never passwords, tokens,
// or raw Supabase responses. Entries expire after 14 days.

const PENDING_USERNAME_STORE_KEY = 'sh_pending_signup_username_v1';
const PENDING_USERNAME_TTL_MS = 14 * 24 * 60 * 60 * 1000;

interface PendingUsernameEntry {
  username: string;
  createdAt: string;
}

type PendingUsernameStore = Record<string, PendingUsernameEntry>;

function isValidEntry(value: unknown): value is PendingUsernameEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return typeof e.username === 'string' && typeof e.createdAt === 'string';
}

/**
 * Reads the store, removing corrupted JSON entirely and pruning entries that
 * are malformed, fail username validation, have invalid timestamps, or are
 * older than 14 days. Prunes are persisted. Never throws — a missing or
 * unavailable localStorage degrades to an empty store.
 */
function readPendingStore(): PendingUsernameStore {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PENDING_USERNAME_STORE_KEY);
  } catch {
    return {};
  }
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupted JSON — remove the key so it can't fail on every future read.
    try { localStorage.removeItem(PENDING_USERNAME_STORE_KEY); } catch { /* ignore */ }
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    try { localStorage.removeItem(PENDING_USERNAME_STORE_KEY); } catch { /* ignore */ }
    return {};
  }

  const store: PendingUsernameStore = {};
  let dirty = false;
  const now = Date.now();
  for (const [email, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isValidEntry(entry)) { dirty = true; continue; }
    const validated = validateUsername(entry.username);
    if (!validated.valid) { dirty = true; continue; }
    const created = new Date(entry.createdAt).getTime();
    if (Number.isNaN(created) || now - created > PENDING_USERNAME_TTL_MS) {
      dirty = true;
      continue;
    }
    // Store the canonical validated form.
    if (validated.username !== entry.username) dirty = true;
    store[email] = { username: validated.username, createdAt: entry.createdAt };
  }
  if (dirty) writePendingStore(store);
  return store;
}

function writePendingStore(store: PendingUsernameStore): void {
  try {
    if (Object.keys(store).length === 0) {
      localStorage.removeItem(PENDING_USERNAME_STORE_KEY);
    } else {
      localStorage.setItem(PENDING_USERNAME_STORE_KEY, JSON.stringify(store));
    }
  } catch {
    // Storage unavailable — pending claim silently degrades to manual claim.
  }
}

export function savePendingSignupUsername(email: string, username: string): void {
  const normalizedEmail = email.trim().toLowerCase();
  const validated = validateUsername(username);
  if (!normalizedEmail || !validated.valid) return;

  const store = readPendingStore();
  store[normalizedEmail] = {
    username: validated.username,
    createdAt: new Date().toISOString(),
  };
  writePendingStore(store);
}

/** Returns the pending username for this exact email, or null. */
export function readPendingSignupUsername(email: string): string | null {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;
  const entry = readPendingStore()[normalizedEmail];
  return entry?.username ?? null;
}

export function clearPendingSignupUsername(email: string): void {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return;
  const store = readPendingStore();
  if (normalizedEmail in store) {
    delete store[normalizedEmail];
    writePendingStore(store);
  }
}
