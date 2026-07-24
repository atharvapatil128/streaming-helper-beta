import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

type LoginErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INVALID_REQUEST';

type LoginResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  error?: unknown;
};

const LOGIN_ERROR_MESSAGES: Record<LoginErrorCode, string> = {
  INVALID_CREDENTIALS: 'Incorrect username/email or password.',
  RATE_LIMITED: 'Too many sign-in attempts. Please wait and try again.',
  SERVICE_UNAVAILABLE: 'Sign-in is temporarily unavailable. Please try again.',
  INVALID_REQUEST: 'Enter a valid username or email and password.',
};

const LOGIN_TIMEOUT_MS = 10_000;

function loginError(code: LoginErrorCode): Error {
  return new Error(LOGIN_ERROR_MESSAGES[code]);
}

function knownErrorCode(value: unknown): LoginErrorCode | null {
  return typeof value === 'string' && value in LOGIN_ERROR_MESSAGES
    ? value as LoginErrorCode
    : null;
}

/**
 * Password sign-in through the server-side identifier broker. The broker can
 * resolve a username without exposing the account's email address to the
 * browser. It returns only the tokens required to establish the Supabase
 * client session.
 */
export async function signInWithIdentifier(
  identifier: string,
  password: string,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/web-login`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ identifier: identifier.trim(), password }),
      signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
    });
  } catch {
    throw loginError('SERVICE_UNAVAILABLE');
  }

  let payload: LoginResponse = {};
  try {
    payload = await response.json() as LoginResponse;
  } catch {
    throw loginError('SERVICE_UNAVAILABLE');
  }

  if (!response.ok) {
    const code = knownErrorCode(payload.error);
    if (code) throw loginError(code);
    if (response.status === 401) throw loginError('INVALID_CREDENTIALS');
    if (response.status === 429) throw loginError('RATE_LIMITED');
    if (response.status === 403) throw loginError('SERVICE_UNAVAILABLE');
    if (response.status >= 500) throw loginError('SERVICE_UNAVAILABLE');
    throw loginError('INVALID_REQUEST');
  }

  if (
    typeof payload.access_token !== 'string' ||
    typeof payload.refresh_token !== 'string'
  ) {
    throw loginError('SERVICE_UNAVAILABLE');
  }

  const { error } = await supabase.auth.setSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
  });
  if (error) throw loginError('SERVICE_UNAVAILABLE');
}
