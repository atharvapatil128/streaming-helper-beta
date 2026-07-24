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
const FETCH_TIMEOUT_MS = 10 * 1000;
const HANDLE_TTL_MS = 5 * 60 * 1000;

let authGeneration = 0;
let refreshInFlight = null;
let storageMutation = Promise.resolve();
let storageReady = false;
let storageInitialization = null;
const titleHandles = new Map();
const friendHandles = new Map();
const undoHandles = new Map();

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
    // setAccessLevel is Promise-based in MV3. Passing a callback through the
    // generic adapter can fail Chrome's signature validation before startup.
    await chrome.storage.local.setAccessLevel({
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

async function ensureStorageReady() {
  if (storageReady) return;
  if (!storageInitialization) {
    storageInitialization = initializeStorage()
      .then(function () { storageReady = true; })
      .catch(function () { throw new BrokerError('STORAGE_UNAVAILABLE'); })
      .finally(function () { storageInitialization = null; });
  }
  return storageInitialization;
}

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

function clearBrokerHandles() {
  titleHandles.clear();
  friendHandles.clear();
  undoHandles.clear();
}

function pruneBrokerHandles() {
  const now = Date.now();
  [titleHandles, friendHandles, undoHandles].forEach(function (map) {
    for (const [handle, value] of map) {
      if (value.expiresAt <= now) map.delete(handle);
    }
  });
}

function opaqueHandle(prefix) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, function (byte) {
    return byte.toString(16).padStart(2, '0');
  }).join('')}`;
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
  clearBrokerHandles();
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
  const controller = new AbortController();
  const requestOptions = { ...(options || {}), signal: controller.signal };
  let timer;
  try {
    return await Promise.race([
      fetch(url, requestOptions),
      new Promise(function (_, reject) {
        timer = setTimeout(function () {
          controller.abort();
          reject(new BrokerError('TIMEOUT'));
        }, FETCH_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    if (error?.code === 'TIMEOUT' || error?.name === 'AbortError') {
      throw new BrokerError('TIMEOUT');
    }
    throw new BrokerError('OFFLINE');
  } finally {
    clearTimeout(timer);
  }
}

async function json(response) {
  try { return await response.json(); } catch (_) { return null; }
}

function serviceError(response) {
  if (response.status === 429) return new BrokerError('RATE_LIMITED');
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
  if (error?.code === 'TIMEOUT') return { success: false, error: 'TIMEOUT' };
  if (error?.code === 'RATE_LIMITED') return { success: false, error: 'RATE_LIMITED' };
  if (error?.code === 'STALE_CONTEXT') return { success: false, error: 'STALE_CONTEXT' };
  if (error?.code === 'UNAUTHORIZED') return { success: false, error: 'UNAUTHORIZED' };
  if (error?.code === 'UNDO_UNAVAILABLE') return { success: false, error: 'UNDO_UNAVAILABLE' };
  if (error?.code === 'FRIENDSHIP_CHANGED') return { success: false, error: 'FRIENDSHIP_CHANGED' };
  if (error?.code === 'TITLE_NOT_FOUND') return { success: false, error: 'TITLE_NOT_FOUND' };
  if (error?.code === 'BACKEND_NOT_READY') return { success: false, error: 'BACKEND_NOT_READY' };
  if (error?.code === 'STORAGE_UNAVAILABLE') {
    return { success: false, error: 'STORAGE_UNAVAILABLE' };
  }
  if (error?.code === 'SERVICE_ERROR') return { success: false, error: 'SERVICE_ERROR' };
  if (error?.code === 'SIGNED_OUT' || error?.code === 'INVALID_SESSION') {
    return { success: true, state: signedOutState() };
  }
  return { success: false, error: 'SERVICE_ERROR' };
}

async function getState() {
  try {
    const session = await validatedSession();
    const state = session ? signedInState(session) : signedOutState();
    broadcastState(state);
    return { success: true, state };
  } catch (error) {
    return publicFailure(error);
  }
}

async function signIn(message) {
  const identifier = message.identifier.trim();
  const password = message.password;
  const generation = authGeneration;
  try {
    const response = await safeFetch(`${SUPABASE_URL}/functions/v1/extension-login`, {
      method: 'POST',
      headers: { apikey: PUBLIC_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    if (response.status === 400 || response.status === 401) {
      ensureCurrent(generation);
      await invalidateSession();
      return { success: false, error: 'INVALID_CREDENTIALS' };
    }
    if (response.status === 404) throw new BrokerError('BACKEND_NOT_READY');
    if (!response.ok) throw serviceError(response);
    const payload = await json(response);
    const tokenPayload = payload?.session || payload;
    const userId = tokenPayload?.user?.id || payload?.user?.id;
    if (!tokenPayload?.access_token || !userId) throw new BrokerError('SERVICE_ERROR');
    // Fetch the safe profile before persisting this new session. A profile
    // network/auth failure therefore cannot leave a hidden connected session
    // behind while the popup reports sign-in failure.
    const profile = payload?.profile
      ? sanitizeProfile(payload.profile)
      : await fetchProfile(tokenPayload.access_token, userId);
    const session = await persistTokens(tokenPayload, userId, generation, profile);
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
  clearBrokerHandles();
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

function safeTitle(payload, platform) {
  if (payload && typeof payload === 'object' &&
      Object.hasOwn(payload, 'match') && payload.match === null) {
    throw new BrokerError('TITLE_NOT_FOUND');
  }
  const row = payload?.match && typeof payload.match === 'object'
    ? payload.match
    : payload?.title && typeof payload.title === 'object'
    ? payload.title
    : payload?.data && typeof payload.data === 'object'
      ? payload.data
      : payload;
  if (!row) throw new BrokerError('TITLE_NOT_FOUND');
  const tmdbId = Number(row?.tmdb_id ?? row?.tmdbId);
  const mediaType = row?.media_type ?? row?.mediaType;
  const title = typeof row?.title === 'string' ? row.title.trim() : '';
  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !title ||
      !['movie', 'series', 'tv'].includes(mediaType)) {
    throw new BrokerError('SERVICE_ERROR');
  }
  return {
    tmdbId,
    title,
    mediaType: mediaType === 'tv' ? 'series' : mediaType,
    thumbnailUrl: typeof (row?.thumbnail_url ?? row?.thumbnailUrl) === 'string'
      ? (row.thumbnail_url ?? row.thumbnailUrl)
      : typeof row?.posterPath === 'string' && /^\/[A-Za-z0-9._/-]+$/.test(row.posterPath)
        ? `https://image.tmdb.org/t/p/w500${row.posterPath}`
        : null,
    year: typeof row?.year === 'string' || Number.isInteger(row?.year)
      ? String(row.year) : null,
    genres: Array.isArray(row?.genres)
      ? row.genres.filter(function (genre) { return typeof genre === 'string'; }).slice(0, 20)
      : [],
    platform,
  };
}

async function fetchRecommendationContext(message) {
  try {
    const session = await validatedSession();
    if (!session) return { success: false, error: 'SIGNED_OUT' };
    const generation = authGeneration;
    const [titleResponse, friendsResponse] = await Promise.all([
      safeFetch(`${SUPABASE_URL}/functions/v1/resolve-streaming-title`, {
        method: 'POST',
        headers: headers(session.accessToken, true),
        body: JSON.stringify({
          detectedTitle: message.detectedTitle.trim(),
          platform: message.platform,
          mediaTypeHint: message.mediaTypeHint,
        }),
      }),
      safeFetch(`${SUPABASE_URL}/rest/v1/rpc/get_my_friend_profiles`, {
        method: 'POST',
        headers: headers(session.accessToken, true),
        body: '{}',
      }),
    ]);
    if (titleResponse.status === 401 || friendsResponse.status === 401) {
      await invalidateSession();
      return { success: false, error: 'SIGNED_OUT' };
    }
    const [titlePayload, friendRows] = await Promise.all([
      json(titleResponse),
      json(friendsResponse),
    ]);
    if (!titleResponse.ok) {
      if (titleResponse.status === 404 && titlePayload?.error === 'TITLE_NOT_RESOLVED') {
        throw new BrokerError('TITLE_NOT_FOUND');
      }
      throw serviceError(titleResponse);
    }
    if (!friendsResponse.ok) throw serviceError(friendsResponse);
    ensureCurrent(generation);
    const title = safeTitle(titlePayload, message.platform);
    const contextId = opaqueHandle('ctx');
    const expiresAt = Date.now() + HANDLE_TTL_MS;
    const titleHandle = opaqueHandle('th');
    titleHandles.set(titleHandle, {
      contextId, expiresAt, generation, userId: session.userId, title,
    });
    const friends = (Array.isArray(friendRows) ? friendRows : []).map(function (row) {
      if (typeof row?.friend_user_id !== 'string') return null;
      const recipientHandle = opaqueHandle('fh');
      friendHandles.set(recipientHandle, {
        contextId,
        expiresAt,
        generation,
        userId: session.userId,
        friendUserId: row.friend_user_id,
        displayName: typeof row.display_name === 'string'
          ? row.display_name
          : typeof row.username === 'string' ? `@${row.username}` : 'Streaming Helper friend',
      });
      return {
        handle: recipientHandle,
        username: typeof row.username === 'string' ? row.username : null,
        displayName: typeof row.display_name === 'string' ? row.display_name : null,
        avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
      };
    }).filter(Boolean);
    pruneBrokerHandles();
    return {
      success: true,
      data: {
        title: {
          handle: titleHandle,
          title: title.title,
          mediaType: title.mediaType,
          thumbnailUrl: title.thumbnailUrl,
          year: title.year,
          platform: title.platform,
        },
        friends,
        expiresInMs: HANDLE_TTL_MS,
      },
    };
  } catch (error) {
    if (error.code === 'SIGNED_OUT' || error.code === 'INVALID_SESSION') {
      return { success: false, error: 'SIGNED_OUT' };
    }
    return publicFailure(error);
  }
}

function liveHandle(map, handle, prefix) {
  if (typeof handle !== 'string' ||
      !new RegExp(`^${prefix}_[a-f0-9]{32}$`).test(handle)) {
    throw new BrokerError('UNAUTHORIZED');
  }
  pruneBrokerHandles();
  const value = map.get(handle);
  if (!value) throw new BrokerError('STALE_CONTEXT');
  return value;
}

function recommendationRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.recommendations)) return payload.recommendations;
  return [
    ...(Array.isArray(payload?.created) ? payload.created : []),
    ...(Array.isArray(payload?.reactivated) ? payload.reactivated : []),
  ];
}

async function sendTitleRecommendation(message) {
  try {
    const session = await validatedSession();
    if (!session) return { success: false, error: 'SIGNED_OUT' };
    const titleEntry = liveHandle(titleHandles, message.titleHandle, 'th');
    const recipientEntries = message.recipientHandles.map(function (handle) {
      return liveHandle(friendHandles, handle, 'fh');
    });
    if (titleEntry.userId !== session.userId ||
        titleEntry.generation !== authGeneration ||
        recipientEntries.some(function (entry) {
          return entry.userId !== session.userId ||
            entry.generation !== authGeneration ||
            entry.contextId !== titleEntry.contextId;
        })) {
      throw new BrokerError('UNAUTHORIZED');
    }
    const recipientIds = [...new Set(recipientEntries.map(function (entry) {
      return entry.friendUserId;
    }))];
    if (recipientIds.length !== recipientEntries.length) {
      throw new BrokerError('UNAUTHORIZED');
    }
    const title = titleEntry.title;
    const response = await safeFetch(
      `${SUPABASE_URL}/rest/v1/rpc/send_title_recommendation`,
      {
        method: 'POST',
        headers: headers(session.accessToken, true),
        body: JSON.stringify({
          p_recipient_ids: recipientIds,
          p_tmdb_id: title.tmdbId,
          p_media_type: title.mediaType,
          p_title: title.title,
          p_thumbnail_url: title.thumbnailUrl,
          p_year: title.year,
          p_genres: title.genres,
          p_platform: title.platform,
        }),
      }
    );
    if (response.status === 401) {
      await invalidateSession();
      return { success: false, error: 'SIGNED_OUT' };
    }
    const payload = await json(response);
    if (!response.ok) {
      if (/RECIPIENT_NOT_AUTHORIZED/.test(JSON.stringify(payload))) {
        throw new BrokerError('FRIENDSHIP_CHANGED');
      }
      throw serviceError(response);
    }
    const rows = recommendationRows(payload);
    const entryByRecipient = new Map(recipientEntries.map(function (entry) {
      return [entry.friendUserId, entry];
    }));
    if (rows.length !== recipientIds.length ||
        rows.some(function (row) {
          return typeof row?.recipient_id !== 'string' ||
            !['SENT', 'REACTIVATED', 'ALREADY_ACTIVE'].includes(row?.status) ||
            (row.status === 'SENT'
              ? typeof row.recommendation_id !== 'string'
              : row.recommendation_id !== null) ||
            !entryByRecipient.has(row.recipient_id);
        }) ||
        new Set(rows.map(function (row) { return row.recipient_id; })).size !== rows.length) {
      throw new BrokerError('SERVICE_ERROR');
    }
    const ids = rows.filter(function (row) {
      return row.status === 'SENT';
    }).map(function (row) {
      return row.recommendation_id;
    });
    let undoHandle = null;
    if (ids.length) {
      undoHandle = opaqueHandle('uh');
      undoHandles.set(undoHandle, {
        ids,
        userId: session.userId,
        generation: authGeneration,
        expiresAt: Date.now() + HANDLE_TTL_MS,
      });
    }
    titleHandles.delete(message.titleHandle);
    for (const handle of message.recipientHandles) friendHandles.delete(handle);
    return {
      success: true,
      results: rows.map(function (row) {
        return {
          status: row.status,
          displayName: entryByRecipient.get(row.recipient_id).displayName,
        };
      }),
      undoHandle,
    };
  } catch (error) {
    if (error.code === 'SIGNED_OUT' || error.code === 'INVALID_SESSION') {
      return { success: false, error: 'SIGNED_OUT' };
    }
    return publicFailure(error);
  }
}

async function undoTitleRecommendation(message) {
  try {
    const session = await validatedSession();
    if (!session) return { success: false, error: 'SIGNED_OUT' };
    const entry = liveHandle(undoHandles, message.undoHandle, 'uh');
    if (entry.userId !== session.userId || entry.generation !== authGeneration) {
      throw new BrokerError('UNAUTHORIZED');
    }
    // The SECURITY DEFINER RPC checks sender ownership and server-side
    // short-lived eligibility. Recommendation UUIDs never leave this worker.
    const response = await safeFetch(`${SUPABASE_URL}/rest/v1/rpc/undo_title_recommendation`, {
      method: 'POST',
      headers: headers(session.accessToken, true),
      body: JSON.stringify({ p_recommendation_ids: entry.ids }),
    });
    if (response.status === 401) {
      await invalidateSession();
      return { success: false, error: 'SIGNED_OUT' };
    }
    if (response.status === 403 || response.status === 404 || response.status === 405) {
      return { success: false, error: 'UNDO_UNAVAILABLE' };
    }
    if (!response.ok) throw serviceError(response);
    const results = await json(response);
    const returnedIds = new Set((Array.isArray(results) ? results : []).map(function (row) {
      return row?.recommendation_id;
    }));
    if (!Array.isArray(results) || results.length !== entry.ids.length ||
        results.some(function (row) {
          return typeof row?.recommendation_id !== 'string' || row.status !== 'UNDONE';
        }) ||
        returnedIds.size !== entry.ids.length ||
        entry.ids.some(function (id) { return !returnedIds.has(id); })) {
      return { success: false, error: 'UNDO_UNAVAILABLE' };
    }
    undoHandles.delete(message.undoHandle);
    return { success: true, undoneCount: entry.ids.length };
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
  if (sender?.id !== chrome.runtime.id) return false;
  const senderUrl = typeof sender.tab?.url === 'string' ? sender.tab.url : sender?.url;
  if (typeof senderUrl !== 'string') return false;
  try {
    const url = new URL(senderUrl);
    return url.protocol === 'https:' &&
      SUPPORTED_HOSTS.some(function (pattern) { return pattern.test(url.hostname); });
  } catch (_) {
    return false;
  }
}

function authorized(message, sender) {
  switch (message?.type) {
    case 'AUTH_SIGN_IN':
      return isPopup(sender) && exactKeys(message, ['type', 'identifier', 'password']) &&
        typeof message.identifier === 'string' && typeof message.password === 'string' &&
        message.identifier.trim().length > 0 && message.identifier.trim().length <= 320 &&
        message.password.length > 0 && message.password.length <= 1024;
    case 'AUTH_GET_STATE':
    case 'AUTH_SIGN_OUT':
      return isPopup(sender) && exactKeys(message, ['type']);
    case 'FETCH_PANEL_DATA':
      return isSupportedTab(sender) && exactKeys(message, ['type']);
    case 'FETCH_RECOMMENDATION_CONTEXT':
      return isSupportedTab(sender) &&
        exactKeys(message, ['type', 'detectedTitle', 'platform', 'mediaTypeHint']) &&
        typeof message.detectedTitle === 'string' &&
        message.detectedTitle.trim().length > 0 &&
        message.detectedTitle.trim().length <= 200 &&
        typeof message.platform === 'string' &&
        message.platform.length > 0 && message.platform.length <= 80 &&
        (message.mediaTypeHint === null ||
          ['movie', 'series', 'tv'].includes(message.mediaTypeHint));
    case 'SEND_TITLE_RECOMMENDATION':
      return isSupportedTab(sender) &&
        exactKeys(message, ['type', 'titleHandle', 'recipientHandles']) &&
        typeof message.titleHandle === 'string' &&
        Array.isArray(message.recipientHandles) &&
        message.recipientHandles.length > 0 &&
        message.recipientHandles.length <= 20 &&
        message.recipientHandles.every(function (handle) {
          return typeof handle === 'string';
        });
    case 'UNDO_TITLE_RECOMMENDATION':
      return isSupportedTab(sender) &&
        exactKeys(message, ['type', 'undoHandle']) &&
        typeof message.undoHandle === 'string';
    default:
      return false;
  }
}

async function dispatch(message, sender) {
  try {
    await ensureStorageReady();
  } catch (error) {
    return publicFailure(error);
  }
  if (!authorized(message, sender)) return { success: false, error: 'UNAUTHORIZED' };
  switch (message.type) {
    case 'AUTH_GET_STATE': return getState();
    case 'AUTH_SIGN_IN': return signIn(message);
    case 'AUTH_SIGN_OUT': return signOut();
    case 'FETCH_PANEL_DATA': return fetchPanelData();
    case 'FETCH_RECOMMENDATION_CONTEXT': return fetchRecommendationContext(message);
    case 'SEND_TITLE_RECOMMENDATION': return sendTitleRecommendation(message);
    case 'UNDO_TITLE_RECOMMENDATION': return undoTitleRecommendation(message);
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

  if (![
    'AUTH_GET_STATE',
    'AUTH_SIGN_IN',
    'AUTH_SIGN_OUT',
    'FETCH_PANEL_DATA',
    'FETCH_RECOMMENDATION_CONTEXT',
    'SEND_TITLE_RECOMMENDATION',
    'UNDO_TITLE_RECOMMENDATION',
  ].includes(message?.type)) {
    return false;
  }
  dispatch(message, sender)
    .then(sendResponse)
    .catch(function () { sendResponse({ success: false, error: 'SERVICE_ERROR' }); });
  return true;
});
