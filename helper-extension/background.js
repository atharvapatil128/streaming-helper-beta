'use strict';

/** Streaming Helper MV3 auth/data broker (Beta 2). */

const SUPABASE_URL = 'https://htqwzovhfyyaaipoovjp.supabase.co';
const PUBLIC_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0cXd6b3ZoZnl5YWFpcG9vdmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MjcwNjcsImV4cCI6MjA5NTUwMzA2N30.xutlxo4ZtEWkaE_KxCV8sOH6-bb1TwCShqx0h0lRFwk';

const LOCAL = Object.freeze({
  refreshToken: 'sh_refresh_token',
  expiresAt: 'sh_expires_at',
  userId: 'sh_user_id',
  profile: 'sh_profile',
});
const SESSION = Object.freeze({ accessToken: 'sh_access_token' });
const LEGACY_LOCAL_KEYS = [
  'streamingHelperConnected',
  'sh_user_email',
  'sh_access_token',
  'userId',
  'sh_uid',
];
const LOCAL_SESSION_KEYS = Object.values(LOCAL);
const REFRESH_EARLY_MS = 60 * 1000;

let authGeneration = 0;
let refreshInFlight = null;
let storageMutation = Promise.resolve();

class BrokerError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function chromeCall(target, method, ...args) {
  return new Promise(function (resolve, reject) {
    let settled = false;
    function done(value) {
      if (settled) return;
      settled = true;
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(value);
    }
    try {
      const result = target[method](...args, done);
      if (result?.then) result.then(done, reject);
    } catch (error) {
      reject(error);
    }
  });
}

function localGet(keys) { return chromeCall(chrome.storage.local, 'get', keys); }
function localSet(items) { return chromeCall(chrome.storage.local, 'set', items); }
function localRemove(keys) { return chromeCall(chrome.storage.local, 'remove', keys); }
function sessionGet(keys) { return chromeCall(chrome.storage.session, 'get', keys); }
function sessionSet(items) { return chromeCall(chrome.storage.session, 'set', items); }
function sessionRemove(keys) { return chromeCall(chrome.storage.session, 'remove', keys); }

function mutateStorage(operation) {
  const result = storageMutation.then(operation, operation);
  storageMutation = result.catch(function () {});
  return result;
}

async function initializeStorage() {
  // This is deliberately the first storage operation. It prevents content
  // scripts from observing local credentials during migration/cleanup.
  if (typeof chrome.storage.local.setAccessLevel === 'function') {
    await chromeCall(chrome.storage.local, 'setAccessLevel', {
      accessLevel: 'TRUSTED_CONTEXTS',
    });
  }

  const legacy = await localGet(LEGACY_LOCAL_KEYS);
  await localRemove(LEGACY_LOCAL_KEYS);

  // A Beta 1 local access token means the accompanying local metadata belongs
  // to the old, content-readable session. Remove it as one stale unit.
  if (legacy[SESSION.accessToken]) {
    await localRemove(LOCAL_SESSION_KEYS);
    await sessionRemove([SESSION.accessToken]);
  }
}

const startupReady = initializeStorage();

function signedOutState() { return { status: 'signed_out' }; }

function sanitizeProfile(profile) {
  return {
    display_name: typeof profile?.display_name === 'string' ? profile.display_name : null,
    username: typeof profile?.username === 'string' ? profile.username : null,
  };
}

function signedInState(session) {
  return {
    status: 'connected',
    profile: sanitizeProfile(session.profile),
  };
}

function broadcastState(state) {
  const message = { type: 'AUTH_STATE_CHANGED', state };
  try {
    chrome.runtime.sendMessage(message, function () {
      void chrome.runtime.lastError;
    });
  } catch (_) {}

  // runtime.sendMessage does not fan service-worker messages out to content
  // scripts. Querying all tabs needs no extra permission when no sensitive tab
  // fields are requested; unsupported/no-listener tabs are harmless.
  try {
    chrome.tabs.query({}, function (tabs) {
      void chrome.runtime.lastError;
      (tabs || []).forEach(function (tab) {
        if (!Number.isInteger(tab.id)) return;
        try {
          chrome.tabs.sendMessage(tab.id, message, function () {
            void chrome.runtime.lastError;
          });
        } catch (_) {}
      });
    });
  } catch (_) {}
}

async function clearSession(broadcast) {
  await mutateStorage(function () {
    return Promise.all([
      localRemove([...LOCAL_SESSION_KEYS, ...LEGACY_LOCAL_KEYS]),
      sessionRemove([SESSION.accessToken]),
    ]);
  });
  const state = signedOutState();
  if (broadcast) broadcastState(state);
  return state;
}

async function invalidateSession() {
  authGeneration += 1;
  return clearSession(true);
}

async function readSession() {
  const [local, ephemeral] = await Promise.all([
    localGet(LOCAL_SESSION_KEYS),
    sessionGet([SESSION.accessToken]),
  ]);
  const hasAnySessionData = Boolean(
    local[LOCAL.refreshToken] || local[LOCAL.userId] || local[LOCAL.expiresAt] ||
    local[LOCAL.profile] || ephemeral[SESSION.accessToken]
  );
  if (!local[LOCAL.refreshToken] || !local[LOCAL.userId] ||
      !Number.isFinite(local[LOCAL.expiresAt])) {
    if (hasAnySessionData) await invalidateSession();
    return null;
  }
  return {
    accessToken: ephemeral[SESSION.accessToken] || null,
    refreshToken: local[LOCAL.refreshToken],
    expiresAt: local[LOCAL.expiresAt],
    userId: local[LOCAL.userId],
    profile: sanitizeProfile(local[LOCAL.profile]),
  };
}

function ensureCurrent(generation) {
  if (generation !== authGeneration) throw new BrokerError('SIGNED_OUT');
}

function headers(accessToken, json) {
  const result = {
    apikey: PUBLIC_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };
  if (json) result['Content-Type'] = 'application/json';
  return result;
}

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (_) {
    throw new BrokerError('OFFLINE');
  }
}

async function json(response) {
  try { return await response.json(); } catch (_) { return null; }
}

function serviceError(response) {
  if (response.status >= 500 || response.status === 429) return new BrokerError('SERVICE_ERROR');
  return new BrokerError('SERVICE_ERROR');
}

function expiry(payload) {
  if (Number.isFinite(payload?.expires_at)) return payload.expires_at * 1000;
  if (Number.isFinite(payload?.expires_in)) return Date.now() + payload.expires_in * 1000;
  return 0;
}

async function persistTokens(payload, fallbackUserId, generation, profile) {
  const userId = payload?.user?.id || fallbackUserId;
  const expiresAt = expiry(payload);
  if (!payload?.access_token || !payload?.refresh_token || !userId || !expiresAt) {
    throw new BrokerError('SERVICE_ERROR');
  }
  ensureCurrent(generation);
  // Rotated durable fields are replaced in one local-storage write. The access
  // token is held only in trusted session storage.
  await mutateStorage(async function () {
    ensureCurrent(generation);
    const durable = {
      [LOCAL.refreshToken]: payload.refresh_token,
      [LOCAL.expiresAt]: expiresAt,
      [LOCAL.userId]: userId,
    };
    if (profile) durable[LOCAL.profile] = sanitizeProfile(profile);
    await localSet(durable);
    ensureCurrent(generation);
    await sessionSet({ [SESSION.accessToken]: payload.access_token });
    ensureCurrent(generation);
  });
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt,
    userId,
    profile: sanitizeProfile(profile),
  };
}

async function fetchProfile(accessToken, userId) {
  const query = new URLSearchParams({
    id: `eq.${userId}`,
    select: 'display_name,username',
    limit: '1',
  });
  const response = await safeFetch(`${SUPABASE_URL}/rest/v1/profiles?${query}`, {
    headers: headers(accessToken, false),
  });
  if (response.status === 401) throw new BrokerError('UNAUTHORIZED');
  if (!response.ok) throw serviceError(response);
  const rows = await json(response);
  return sanitizeProfile(Array.isArray(rows) ? rows[0] : null);
}

async function saveProfile(session, generation) {
  const profile = await fetchProfile(session.accessToken, session.userId);
  ensureCurrent(generation);
  await mutateStorage(async function () {
    ensureCurrent(generation);
    await localSet({ [LOCAL.profile]: profile });
    ensureCurrent(generation);
  });
  session.profile = profile;
  return session;
}

async function refreshSession() {
  if (refreshInFlight) return refreshInFlight;
  const generation = authGeneration;

  refreshInFlight = (async function () {
    const current = await readSession();
    ensureCurrent(generation);
    if (!current?.refreshToken) throw new BrokerError('INVALID_SESSION');

    const response = await safeFetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: 'POST',
        headers: { apikey: PUBLIC_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: current.refreshToken }),
      }
    );
    if (response.status === 400 || response.status === 401) {
      ensureCurrent(generation);
      await invalidateSession();
      throw new BrokerError('INVALID_SESSION');
    }
    if (!response.ok) throw serviceError(response);
    const payload = await json(response);
    let session = await persistTokens(payload, current.userId, generation);
    session.profile = current.profile;
    session = await saveProfile(session, generation);
    return session;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function fetchUser(accessToken) {
  const response = await safeFetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: headers(accessToken, false),
  });
  if (response.status === 401) return null;
  if (!response.ok) throw serviceError(response);
  return json(response);
}

async function validatedSession() {
  let session = await readSession();
  if (!session) return null;
  let generation = authGeneration;
  let refreshed = false;

  if (!session.accessToken || session.expiresAt - Date.now() <= REFRESH_EARLY_MS) {
    session = await refreshSession();
    generation = authGeneration;
    refreshed = true;
  }

  let user = await fetchUser(session.accessToken);
  ensureCurrent(generation);
  if (!user && !refreshed) {
    session = await refreshSession();
    generation = authGeneration;
    refreshed = true;
    user = await fetchUser(session.accessToken);
    ensureCurrent(generation);
  }
  if (!user?.id || user.id !== session.userId) {
    await invalidateSession();
    throw new BrokerError('INVALID_SESSION');
  }

  try {
    return await saveProfile(session, generation);
  } catch (error) {
    if (error.code !== 'UNAUTHORIZED' || refreshed) {
      if (error.code === 'UNAUTHORIZED') {
        await invalidateSession();
        throw new BrokerError('INVALID_SESSION');
      }
      throw error;
    }
    session = await refreshSession();
    generation = authGeneration;
    const retryUser = await fetchUser(session.accessToken);
    ensureCurrent(generation);
    if (!retryUser?.id || retryUser.id !== session.userId) {
      await invalidateSession();
      throw new BrokerError('INVALID_SESSION');
    }
    return saveProfile(session, generation);
  }
}

function publicFailure(error) {
  if (error?.code === 'OFFLINE') return { success: false, error: 'OFFLINE' };
  if (error?.code === 'SERVICE_ERROR') return { success: false, error: 'SERVICE_ERROR' };
  if (error?.code === 'SIGNED_OUT' || error?.code === 'INVALID_SESSION') {
    return { success: true, state: signedOutState() };
  }
  return { success: false, error: 'SERVICE_ERROR' };
}

async function getState() {
  try {
    const session = await validatedSession();
    return { success: true, state: session ? signedInState(session) : signedOutState() };
  } catch (error) {
    return publicFailure(error);
  }
}

async function signIn(message) {
  const email = message.email.trim();
  const password = message.password;
  const generation = authGeneration;
  try {
    const response = await safeFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: PUBLIC_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (response.status === 400 || response.status === 401) {
      ensureCurrent(generation);
      await invalidateSession();
      return { success: false, error: 'INVALID_CREDENTIALS' };
    }
    if (!response.ok) throw serviceError(response);
    const payload = await json(response);
    const userId = payload?.user?.id;
    if (!payload?.access_token || !userId) throw new BrokerError('SERVICE_ERROR');
    // Fetch the safe profile before persisting this new session. A profile
    // network/auth failure therefore cannot leave a hidden connected session
    // behind while the popup reports sign-in failure.
    const profile = await fetchProfile(payload.access_token, userId);
    const session = await persistTokens(payload, null, generation, profile);
    const state = signedInState(session);
    broadcastState(state);
    return { success: true, state };
  } catch (error) {
    if (error.code === 'SIGNED_OUT') return { success: false, error: 'SIGNED_OUT' };
    return publicFailure(error);
  }
}

async function signOut() {
  authGeneration += 1;
  const session = await readSession();
  const state = await clearSession(true);
  try {
    if (session?.accessToken) {
      await safeFetch(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
        method: 'POST',
        headers: headers(session.accessToken, false),
      });
    }
  } catch (_) {}
  return { success: true, state };
}

function panelUrls(userId) {
  const recommendations = new URLSearchParams({
    to_user_id: `eq.${userId}`,
    dismissed: 'eq.false',
    order: 'created_at.desc',
    limit: '5',
    select: 'title,platforms,source_name,media_type,thumbnail_url,tmdb_id',
  });
  const comfortTitles = new URLSearchParams({
    user_id: `eq.${userId}`,
    is_pinned: 'eq.true',
    order: 'created_at.desc',
    limit: '20',
    select: 'title,platform,media_type,tmdb_id',
  });
  return [
    `${SUPABASE_URL}/rest/v1/recommendations?${recommendations}`,
    `${SUPABASE_URL}/rest/v1/comfort_titles?${comfortTitles}`,
  ];
}

async function panelRows(session) {
  const responses = await Promise.all(panelUrls(session.userId).map(function (url) {
    return safeFetch(url, { headers: headers(session.accessToken, false) });
  }));
  if (responses.some(function (response) { return response.status === 401; })) {
    throw new BrokerError('UNAUTHORIZED');
  }
  if (responses.some(function (response) { return !response.ok; })) {
    throw new BrokerError('SERVICE_ERROR');
  }
  return Promise.all(responses.map(json));
}

async function fetchPanelData() {
  try {
    let session = await validatedSession();
    if (!session) return { success: false, error: 'SIGNED_OUT' };
    let generation = authGeneration;
    let rows;
    try {
      rows = await panelRows(session);
    } catch (error) {
      if (error.code !== 'UNAUTHORIZED') throw error;
      session = await refreshSession();
      generation = authGeneration;
      try {
        rows = await panelRows(session);
      } catch (retryError) {
        if (retryError.code !== 'UNAUTHORIZED') throw retryError;
        ensureCurrent(generation);
        await invalidateSession();
        throw new BrokerError('INVALID_SESSION');
      }
    }
    ensureCurrent(generation);
    const recommendations = (Array.isArray(rows[0]) ? rows[0] : []).map(function (row) {
      return {
        title: row?.title ?? null,
        platforms: Array.isArray(row?.platforms) ? row.platforms : [],
        source_name: row?.source_name ?? null,
        media_type: row?.media_type ?? null,
        thumbnail_url: row?.thumbnail_url ?? null,
        tmdb_id: row?.tmdb_id ?? null,
      };
    });
    const comfortTitles = (Array.isArray(rows[1]) ? rows[1] : []).map(function (row) {
      return {
        title: row?.title ?? null,
        platform: row?.platform ?? null,
        media_type: row?.media_type ?? null,
        tmdb_id: row?.tmdb_id ?? null,
      };
    });
    return {
      success: true,
      data: {
        recommendations,
        comfortTitles,
      },
    };
  } catch (error) {
    if (error.code === 'SIGNED_OUT' || error.code === 'INVALID_SESSION') {
      return { success: false, error: 'SIGNED_OUT' };
    }
    return publicFailure(error);
  }
}

const POPUP_URL = chrome.runtime.getURL('popup.html');
const SUPPORTED_HOSTS = [
  /(^|\.)netflix\.com$/,
  /(^|\.)primevideo\.com$/,
  /(^|\.)disneyplus\.com$/,
  /(^|\.)hulu\.com$/,
  /(^|\.)max\.com$/,
  /(^|\.)hbomax\.com$/,
];

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every(function (key, index) {
    return key === expected[index];
  });
}

function isPopup(sender) {
  if (sender?.id !== chrome.runtime.id || typeof sender.url !== 'string') return false;
  return sender.url.split(/[?#]/, 1)[0] === POPUP_URL;
}

function isSupportedTab(sender) {
  if (sender?.id !== chrome.runtime.id || typeof sender.tab?.url !== 'string') return false;
  try {
    const url = new URL(sender.tab.url);
    return (url.protocol === 'https:' || url.protocol === 'http:') &&
      SUPPORTED_HOSTS.some(function (pattern) { return pattern.test(url.hostname); });
  } catch (_) {
    return false;
  }
}

function authorized(message, sender) {
  switch (message?.type) {
    case 'AUTH_SIGN_IN':
      return isPopup(sender) && exactKeys(message, ['type', 'email', 'password']) &&
        typeof message.email === 'string' && typeof message.password === 'string' &&
        Boolean(message.email.trim()) && Boolean(message.password);
    case 'AUTH_GET_STATE':
    case 'AUTH_SIGN_OUT':
      return isPopup(sender) && exactKeys(message, ['type']);
    case 'FETCH_PANEL_DATA':
      return isSupportedTab(sender) && exactKeys(message, ['type']);
    default:
      return false;
  }
}

async function dispatch(message, sender) {
  await startupReady;
  if (!authorized(message, sender)) return { success: false, error: 'UNAUTHORIZED' };
  switch (message.type) {
    case 'AUTH_GET_STATE': return getState();
    case 'AUTH_SIGN_IN': return signIn(message);
    case 'AUTH_SIGN_OUT': return signOut();
    case 'FETCH_PANEL_DATA': return fetchPanelData();
  }
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message?.type === 'OPEN_EXTENSION_POPUP') {
    if (!isSupportedTab(sender) || !exactKeys(message, ['type'])) {
      sendResponse({ success: false, reason: 'unauthorized' });
      return false;
    }
    if (typeof chrome.action?.openPopup !== 'function') {
      sendResponse({ success: false, reason: 'api_unavailable' });
      return false;
    }
    chrome.action.openPopup()
      .then(function () { sendResponse({ success: true }); })
      .catch(function (error) {
        sendResponse({ success: false, reason: error?.message || 'unknown' });
      });
    return true;
  }

  if (!['AUTH_GET_STATE', 'AUTH_SIGN_IN', 'AUTH_SIGN_OUT', 'FETCH_PANEL_DATA'].includes(message?.type)) {
    return false;
  }
  dispatch(message, sender)
    .then(sendResponse)
    .catch(function () { sendResponse({ success: false, error: 'SERVICE_ERROR' }); });
  return true;
});
