'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WORKER = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
const EXTENSION_ID = 'streaming-helper-test';
const POPUP = `chrome-extension://${EXTENSION_ID}/popup.html`;
const USER_ID = 'user-123';

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return body; },
  };
}

function area(name, data, operations) {
  return {
    data,
    get(keys, callback) {
      operations.push(`${name}.get`);
      const selected = {};
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) if (Object.hasOwn(data, key)) selected[key] = data[key];
      queueMicrotask(() => callback(selected));
    },
    set(items, callback) {
      operations.push(`${name}.set`);
      Object.assign(data, items);
      queueMicrotask(() => callback());
    },
    remove(keys, callback) {
      operations.push(`${name}.remove`);
      for (const key of (Array.isArray(keys) ? keys : [keys])) delete data[key];
      queueMicrotask(() => callback());
    },
  };
}

function createHarness(options = {}) {
  const localData = { ...(options.local || {}) };
  const sessionData = { ...(options.session || {}) };
  const operations = [];
  const broadcasts = [];
  const tabMessages = [];
  let listener;
  const local = area('local', localData, operations);
  const session = area('session', sessionData, operations);
  const originalLocalGet = local.get;
  let localGetAttempts = 0;
  let accessLevelAttempts = 0;
  local.setAccessLevel = function (details) {
    operations.push('local.setAccessLevel');
    assert.equal(details.accessLevel, 'TRUSTED_CONTEXTS');
    accessLevelAttempts += 1;
    if (accessLevelAttempts <= (options.accessLevelFailures || 0)) {
      return Promise.reject(new Error('storage access level unavailable'));
    }
    return Promise.resolve();
  };

  const chrome = {
    runtime: {
      id: EXTENSION_ID,
      lastError: undefined,
      getURL(file) { return `chrome-extension://${EXTENSION_ID}/${file}`; },
      onMessage: { addListener(fn) { listener = fn; } },
      sendMessage(message, callback) {
        broadcasts.push(structuredClone(message));
        queueMicrotask(() => callback?.());
      },
    },
    storage: { local, session },
    tabs: {
      query(query, callback) {
        assert.equal(Object.keys(query).length, 0);
        queueMicrotask(() => callback([{ id: 7 }, { id: 8 }, {}]));
      },
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message: structuredClone(message) });
        queueMicrotask(() => callback?.());
      },
    },
    action: { openPopup: async () => {} },
  };
  local.get = function (keys, callback) {
    localGetAttempts += 1;
    if (localGetAttempts <= (options.localGetFailures || 0)) {
      operations.push('local.get');
      queueMicrotask(function () {
        chrome.runtime.lastError = { message: 'local storage unavailable' };
        callback({});
        chrome.runtime.lastError = undefined;
      });
      return;
    }
    return originalLocalGet.call(local, keys, callback);
  };

  const fetchCalls = [];
  const fetchImpl = options.fetch || (async () => { throw new Error('unexpected fetch'); });
  async function mockedFetch(url, init = {}) {
    fetchCalls.push({ url: String(url), init });
    return fetchImpl(String(url), init, fetchCalls.length);
  }

  vm.runInNewContext(WORKER, {
    chrome,
    fetch: mockedFetch,
    URL,
    URLSearchParams,
    Date,
    Promise,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Error,
    JSON,
    RegExp,
    structuredClone,
    queueMicrotask,
    setTimeout: options.setTimeout || setTimeout,
    clearTimeout: options.clearTimeout || clearTimeout,
    AbortController,
    Uint8Array,
    crypto: require('node:crypto').webcrypto,
  }, { filename: 'background.js' });

  async function dispatch(message, sender) {
    return new Promise((resolve, reject) => {
      const keepAlive = listener(message, sender, (value) => resolve(structuredClone(value)));
      if (keepAlive !== true) reject(new Error('listener did not return true'));
    });
  }

  return {
    localData,
    sessionData,
    operations,
    broadcasts,
    tabMessages,
    fetchCalls,
    dispatch,
    popupSender: { id: EXTENSION_ID, url: POPUP },
    tabSender: { id: EXTENSION_ID, tab: { url: 'https://www.netflix.com/browse' } },
  };
}

function storedSession(overrides = {}) {
  return {
    local: {
      sh_refresh_token: 'refresh-old',
      sh_expires_at: Date.now() + 3_600_000,
      sh_user_id: USER_ID,
      sh_profile: { display_name: 'Old', username: 'old', avatar_url: null },
      ...(overrides.local || {}),
    },
    session: { sh_access_token: 'access-old', ...(overrides.session || {}) },
  };
}

test('sign-in accepts an identifier through the login broker and never persists or returns credentials', async () => {
  const h = createHarness({
    fetch: async (url, init) => {
      if (url.includes('/functions/v1/extension-login')) {
        assert.deepEqual(JSON.parse(init.body), {
          identifier: '@viewer',
          password: 'never-log-me',
        });
        return response(200, {
          access_token: 'access-secret',
          refresh_token: 'refresh-secret',
          expires_in: 3600,
          user: { id: USER_ID, email: 'private@example.com' },
        });
      }
      if (url.includes('/profiles?')) {
        return response(200, [{ display_name: 'Viewer', username: 'viewer' }]);
      }
      throw new Error(`unexpected ${url}`);
    },
  });

  const result = await h.dispatch(
    { type: 'AUTH_SIGN_IN', identifier: '@viewer', password: 'never-log-me' },
    h.popupSender,
  );

  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(h.sessionData.sh_access_token, 'access-secret');
  assert.equal(h.localData.sh_access_token, undefined);
  assert.equal(h.localData.sh_refresh_token, 'refresh-secret');
  assert.equal(h.localData.sh_user_email, undefined);
  assert.doesNotMatch(JSON.stringify({ result, local: h.localData }),
    /private@example|@viewer|access-secret|never-log-me/);
});

test('startup restricts local storage before reads and removes a legacy session', async () => {
  const h = createHarness({
    local: {
      streamingHelperConnected: true,
      sh_user_email: 'old@example.com',
      sh_access_token: 'old-access',
      sh_refresh_token: 'old-refresh',
      sh_expires_at: 123,
      sh_user_id: 'stale-user',
      sh_profile: { display_name: 'Stale' },
      userId: 'also-stale',
    },
  });

  await h.dispatch({ type: 'AUTH_GET_STATE' }, h.popupSender);
  assert.equal(h.operations[0], 'local.setAccessLevel');
  assert.deepEqual(h.localData, {});
  assert.deepEqual(h.sessionData, {});
});

test('storage initialization fails closed and retries instead of poisoning the worker', async () => {
  const h = createHarness({ accessLevelFailures: 1 });

  const first = await h.dispatch({ type: 'AUTH_GET_STATE' }, h.popupSender);
  assert.deepEqual(first, { success: false, error: 'STORAGE_UNAVAILABLE' });
  assert.deepEqual(h.operations, ['local.setAccessLevel']);

  const second = await h.dispatch({ type: 'AUTH_GET_STATE' }, h.popupSender);
  assert.deepEqual(second, { success: true, state: { status: 'signed_out' } });
  assert.deepEqual(h.operations.slice(0, 3), [
    'local.setAccessLevel',
    'local.setAccessLevel',
    'local.get',
  ]);
});

test('runtime.lastError during startup is recoverable on the next request', async () => {
  const h = createHarness({ localGetFailures: 1 });

  const first = await h.dispatch({ type: 'AUTH_GET_STATE' }, h.popupSender);
  assert.deepEqual(first, { success: false, error: 'STORAGE_UNAVAILABLE' });

  const second = await h.dispatch({ type: 'AUTH_GET_STATE' }, h.popupSender);
  assert.deepEqual(second, { success: true, state: { status: 'signed_out' } });
  assert.equal(h.operations.filter((operation) => operation === 'local.get').length, 3);
});

test('incomplete stored session is cleared as one invalid unit', async () => {
  const h = createHarness({
    local: { sh_refresh_token: 'orphan-refresh', sh_user_id: USER_ID },
    session: { sh_access_token: 'orphan-access' },
  });

  const result = await h.dispatch({ type: 'AUTH_GET_STATE' }, h.popupSender);
  assert.deepEqual(result, { success: true, state: { status: 'signed_out' } });
  assert.deepEqual(h.localData, {});
  assert.deepEqual(h.sessionData, {});
});

test('profile failure during sign-in does not persist a hidden session', async () => {
  const h = createHarness({
    fetch: async (url) => {
      if (url.includes('/functions/v1/extension-login')) {
        return response(200, {
          access_token: 'new-access', refresh_token: 'new-refresh',
          expires_in: 3600, user: { id: USER_ID },
        });
      }
      if (url.includes('/profiles?')) throw new TypeError('offline');
      throw new Error(`unexpected ${url}`);
    },
  });

  const result = await h.dispatch(
    { type: 'AUTH_SIGN_IN', identifier: 'user@example.com', password: 'password' },
    h.popupSender,
  );
  assert.deepEqual(result, { success: false, error: 'OFFLINE' });
  assert.deepEqual(h.localData, {});
  assert.deepEqual(h.sessionData, {});
});

test('refresh rotates both tokens and validates the user', async () => {
  const stored = storedSession({ local: { sh_expires_at: Date.now() + 500 } });
  const h = createHarness({
    ...stored,
    fetch: async (url) => {
      if (url.includes('grant_type=refresh_token')) {
        return response(200, {
          access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600,
          user: { id: USER_ID },
        });
      }
      if (url.endsWith('/auth/v1/user')) return response(200, { id: USER_ID, email: 'hidden@example.com' });
      if (url.includes('/profiles?')) return response(200, [{ display_name: 'New', username: 'new', avatar_url: null }]);
      throw new Error(`unexpected ${url}`);
    },
  });

  const result = await h.dispatch({ type: 'AUTH_GET_STATE' }, h.popupSender);
  assert.equal(result.state.status, 'connected');
  assert.equal(h.localData.sh_refresh_token, 'refresh-new');
  assert.equal(h.sessionData.sh_access_token, 'access-new');
  assert.doesNotMatch(JSON.stringify(result), /access-new|refresh-new|hidden@example/);
});

test('concurrent near-expiry checks serialize refresh', async () => {
  const stored = storedSession({ local: { sh_expires_at: Date.now() + 500 } });
  let refreshCount = 0;
  let releaseRefresh;
  const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
  const h = createHarness({
    ...stored,
    fetch: async (url) => {
      if (url.includes('grant_type=refresh_token')) {
        refreshCount += 1;
        await refreshGate;
        return response(200, {
          access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600,
          user: { id: USER_ID },
        });
      }
      if (url.endsWith('/auth/v1/user')) return response(200, { id: USER_ID });
      if (url.includes('/profiles?')) return response(200, [{ display_name: 'Viewer' }]);
      throw new Error(`unexpected ${url}`);
    },
  });

  const first = h.dispatch({ type: 'AUTH_GET_STATE' }, h.popupSender);
  const second = h.dispatch({ type: 'AUTH_GET_STATE' }, h.popupSender);
  await new Promise((resolve) => setImmediate(resolve));
  releaseRefresh();
  const results = await Promise.all([first, second]);
  assert.equal(refreshCount, 1);
  assert.ok(results.every((item) => item.state.status === 'connected'));
});

test('invalid refresh clears all session material and broadcasts signed_out to tabs', async () => {
  const stored = storedSession({ local: { sh_expires_at: Date.now() + 500 } });
  const h = createHarness({ ...stored, fetch: async () => response(401, { error: 'invalid_grant' }) });

  const result = await h.dispatch({ type: 'AUTH_GET_STATE' }, h.popupSender);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(result, { success: true, state: { status: 'signed_out' } });
  assert.deepEqual(h.localData, {});
  assert.deepEqual(h.sessionData, {});
  assert.equal(h.broadcasts.at(-1).state.status, 'signed_out');
  assert.deepEqual(h.tabMessages.map((item) => item.tabId), [7, 8]);
});

test('offline refresh preserves durable and session credentials', async () => {
  const stored = storedSession({ local: { sh_expires_at: Date.now() + 500 } });
  const h = createHarness({ ...stored, fetch: async () => { throw new TypeError('offline'); } });

  const result = await h.dispatch({ type: 'AUTH_GET_STATE' }, h.popupSender);
  assert.deepEqual(result, { success: false, error: 'OFFLINE' });
  assert.equal(h.localData.sh_refresh_token, 'refresh-old');
  assert.equal(h.localData.sh_user_id, USER_ID);
  assert.equal(h.sessionData.sh_access_token, 'access-old');
});

test('sign-out clears locally even when logout is offline', async () => {
  const h = createHarness({ ...storedSession(), fetch: async () => { throw new TypeError('offline'); } });
  const result = await h.dispatch({ type: 'AUTH_SIGN_OUT' }, h.popupSender);
  assert.deepEqual(result, { success: true, state: { status: 'signed_out' } });
  assert.deepEqual(h.localData, {});
  assert.deepEqual(h.sessionData, {});
  assert.match(h.fetchCalls[0].url, /\/auth\/v1\/logout\?scope=local$/);
});

test('rejects wrong senders and unexpected payload fields without fetching', async () => {
  const h = createHarness();
  const wrongId = await h.dispatch({ type: 'AUTH_GET_STATE' }, { id: 'attacker', url: POPUP });
  const contentAuth = await h.dispatch({ type: 'AUTH_GET_STATE' }, h.tabSender);
  const popupPanel = await h.dispatch({ type: 'FETCH_PANEL_DATA' }, h.popupSender);
  const injectedId = await h.dispatch({ type: 'FETCH_PANEL_DATA', userId: USER_ID }, h.tabSender);
  assert.deepEqual([wrongId, contentAuth, popupPanel, injectedId].map((x) => x.error),
    ['UNAUTHORIZED', 'UNAUTHORIZED', 'UNAUTHORIZED', 'UNAUTHORIZED']);
  assert.equal(h.fetchCalls.length, 0);
});

test('panel returns raw safe rows without token leakage', async () => {
  const recs = [{ id: 'r1', title: 'Arrival', platforms: ['netflix'], source_name: 'Friend' }];
  const comforts = [{ id: 'c1', title: 'Paddington', platform: 'netflix' }];
  const h = createHarness({
    ...storedSession(),
    fetch: async (url) => {
      if (url.endsWith('/auth/v1/user')) return response(200, { id: USER_ID, email: 'hidden@example.com' });
      if (url.includes('/profiles?')) return response(200, [{ display_name: 'Viewer', username: 'viewer' }]);
      if (url.includes('/recommendations?')) return response(200, recs);
      if (url.includes('/comfort_titles?')) return response(200, comforts);
      throw new Error(`unexpected ${url}`);
    },
  });

  const result = await h.dispatch({ type: 'FETCH_PANEL_DATA' }, h.tabSender);
  assert.deepEqual(result.data.recommendations, [{
    title: 'Arrival', platforms: ['netflix'], source_name: 'Friend',
    media_type: null, thumbnail_url: null, tmdb_id: null,
  }]);
  assert.deepEqual(result.data.comfortTitles, [{
    title: 'Paddington', platform: 'netflix', media_type: null, tmdb_id: null,
  }]);
  assert.doesNotMatch(JSON.stringify(result), /access-old|refresh-old|hidden@example/);
  assert.ok(h.fetchCalls.every((call) => !String(call.url).includes('access-old')));
});

test('panel retries once with a rotated session after REST 401', async () => {
  let panelRound = 0;
  let panelCalls = 0;
  const h = createHarness({
    ...storedSession(),
    fetch: async (url) => {
      if (url.endsWith('/auth/v1/user')) return response(200, { id: USER_ID });
      if (url.includes('grant_type=refresh_token')) {
        panelRound = 1;
        return response(200, {
          access_token: 'access-rotated', refresh_token: 'refresh-rotated',
          expires_in: 3600, user: { id: USER_ID },
        });
      }
      if (url.includes('/profiles?')) {
        return response(200, [{ display_name: 'Viewer', username: 'viewer' }]);
      }
      if (url.includes('/recommendations?') || url.includes('/comfort_titles?')) {
        panelCalls += 1;
        return panelRound === 0 ? response(401, {}) : response(200, []);
      }
      throw new Error(`unexpected ${url}`);
    },
  });

  const result = await h.dispatch({ type: 'FETCH_PANEL_DATA' }, h.tabSender);
  assert.equal(result.success, true);
  assert.equal(panelCalls, 4);
  assert.equal(h.localData.sh_refresh_token, 'refresh-rotated');
  assert.equal(h.sessionData.sh_access_token, 'access-rotated');
});

test('panel clears the session when REST still rejects the refreshed token', async () => {
  const h = createHarness({
    ...storedSession(),
    fetch: async (url) => {
      if (url.endsWith('/auth/v1/user')) return response(200, { id: USER_ID });
      if (url.includes('grant_type=refresh_token')) {
        return response(200, {
          access_token: 'access-rotated', refresh_token: 'refresh-rotated',
          expires_in: 3600, user: { id: USER_ID },
        });
      }
      if (url.includes('/profiles?')) {
        return response(200, [{ display_name: 'Viewer', username: 'viewer' }]);
      }
      if (url.includes('/recommendations?') || url.includes('/comfort_titles?')) {
        return response(401, {});
      }
      throw new Error(`unexpected ${url}`);
    },
  });

  const result = await h.dispatch({ type: 'FETCH_PANEL_DATA' }, h.tabSender);
  assert.deepEqual(result, { success: false, error: 'SIGNED_OUT' });
  assert.deepEqual(h.localData, {});
  assert.deepEqual(h.sessionData, {});
  assert.ok(h.broadcasts.some((message) => message.state?.status === 'signed_out'));
});

test('sign-out wins a race with in-flight panel requests', async () => {
  let releasePanel;
  const panelGate = new Promise((resolve) => { releasePanel = resolve; });
  const h = createHarness({
    ...storedSession(),
    fetch: async (url) => {
      if (url.endsWith('/auth/v1/user')) return response(200, { id: USER_ID });
      if (url.includes('/profiles?')) return response(200, [{ display_name: 'Viewer' }]);
      if (url.includes('/recommendations?') || url.includes('/comfort_titles?')) {
        await panelGate;
        return response(200, []);
      }
      if (url.endsWith('/auth/v1/logout')) return response(500, {});
      throw new Error(`unexpected ${url}`);
    },
  });

  const panel = h.dispatch({ type: 'FETCH_PANEL_DATA' }, h.tabSender);
  while (!h.fetchCalls.some((call) => call.url.includes('/recommendations?'))) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const logout = h.dispatch({ type: 'AUTH_SIGN_OUT' }, h.popupSender);
  await new Promise((resolve) => setImmediate(resolve));
  releasePanel();
  const [panelResult, logoutResult] = await Promise.all([panel, logout]);
  assert.deepEqual(panelResult, { success: false, error: 'SIGNED_OUT' });
  assert.equal(logoutResult.state.status, 'signed_out');
  assert.deepEqual(h.localData, {});
  assert.deepEqual(h.sessionData, {});
});

test('sign-in exposes safe credential, deployment, and rate-limit states', async () => {
  for (const [status, expected] of [
    [401, 'INVALID_CREDENTIALS'],
    [404, 'BACKEND_NOT_READY'],
    [429, 'RATE_LIMITED'],
  ]) {
    const h = createHarness({
      fetch: async (url) => {
        assert.match(url, /\/functions\/v1\/extension-login$/);
        return response(status, { internal_detail: 'must not escape' });
      },
    });
    const result = await h.dispatch({
      type: 'AUTH_SIGN_IN',
      identifier: 'someone',
      password: 'wrong',
    }, h.popupSender);
    assert.deepEqual(result, { success: false, error: expected });
    assert.doesNotMatch(JSON.stringify(result), /internal_detail|someone|wrong/);
  }
});

test('fetch timeout aborts the request and returns the timeout contract', async () => {
  let requestSignal;
  const h = createHarness({
    setTimeout(callback) {
      queueMicrotask(callback);
      return 1;
    },
    clearTimeout() {},
    fetch: async (_url, init) => {
      requestSignal = init.signal;
      return new Promise(() => {});
    },
  });
  const result = await h.dispatch({
    type: 'AUTH_SIGN_IN',
    identifier: 'viewer',
    password: 'secret',
  }, h.popupSender);
  assert.deepEqual(result, { success: false, error: 'TIMEOUT' });
  assert.equal(requestSignal.aborted, true);
});

test('getState broadcasts each successfully verified connected state', async () => {
  const h = createHarness({
    ...storedSession(),
    fetch: async (url) => {
      if (url.endsWith('/auth/v1/user')) return response(200, { id: USER_ID });
      if (url.includes('/profiles?')) {
        return response(200, [{ display_name: 'Viewer', username: 'viewer' }]);
      }
      throw new Error(`unexpected ${url}`);
    },
  });
  const result = await h.dispatch({ type: 'AUTH_GET_STATE' }, h.popupSender);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.state.status, 'connected');
  assert.deepEqual(h.broadcasts.at(-1), {
    type: 'AUTH_STATE_CHANGED',
    state: result.state,
  });
  assert.equal(h.tabMessages.at(-1).message.state.status, 'connected');
});

test('content sender accepts HTTPS sender.url fallback and rejects HTTP', async () => {
  const h = createHarness({
    ...storedSession(),
    fetch: async (url) => {
      if (url.endsWith('/auth/v1/user')) return response(200, { id: USER_ID });
      if (url.includes('/profiles?')) return response(200, [{ display_name: 'Viewer' }]);
      if (url.includes('/recommendations?') || url.includes('/comfort_titles?')) {
        return response(200, []);
      }
      throw new Error(`unexpected ${url}`);
    },
  });
  const fallbackSender = { id: EXTENSION_ID, url: 'https://www.netflix.com/title/1', tab: {} };
  const accepted = await h.dispatch({ type: 'FETCH_PANEL_DATA' }, fallbackSender);
  const rejected = await h.dispatch(
    { type: 'FETCH_PANEL_DATA' },
    { id: EXTENSION_ID, url: 'http://www.netflix.com/title/1', tab: {} },
  );
  assert.equal(accepted.success, true);
  assert.deepEqual(rejected, { success: false, error: 'UNAUTHORIZED' });
});

function recommendationBackend(overrides = {}) {
  return async function (url, init) {
    if (url.endsWith('/auth/v1/user')) return response(200, { id: USER_ID });
    if (url.includes('/profiles?')) {
      return response(200, [{ display_name: 'Viewer', username: 'viewer' }]);
    }
    if (url.endsWith('/functions/v1/resolve-streaming-title')) {
      if (overrides.resolve) return overrides.resolve(url, init);
      return response(200, { match: {
        tmdbId: 329865,
        title: 'Arrival',
        mediaType: 'movie',
        posterPath: '/arrival.jpg',
        year: '2016',
      } });
    }
    if (url.endsWith('/rest/v1/rpc/get_my_friend_profiles')) {
      return response(200, [{
        friendship_id: 'friendship-private',
        friend_user_id: 'friend-user-private',
        username: 'louise',
        display_name: 'Louise',
        avatar_url: null,
      }]);
    }
    if (url.endsWith('/rest/v1/rpc/send_title_recommendation')) {
      if (overrides.send) return overrides.send(url, init);
      return response(200, [{
        recipient_id: 'friend-user-private',
        recommendation_id: 'recommendation-private',
        status: 'SENT',
      }]);
    }
    if (url.endsWith('/rest/v1/rpc/undo_title_recommendation')) {
      if (overrides.undo) return overrides.undo(url, init);
      return response(200, [{
        recommendation_id: 'recommendation-private',
        status: 'UNDONE',
      }]);
    }
    throw new Error(`unexpected ${url}`);
  };
}

async function getRecommendationContext(h, title = 'Arrival') {
  return h.dispatch({
    type: 'FETCH_RECOMMENDATION_CONTEXT',
    detectedTitle: title,
    platform: 'netflix',
    mediaTypeHint: 'movie',
  }, h.tabSender);
}

test('recommendation context exposes only opaque title and friend handles', async () => {
  const h = createHarness({ ...storedSession(), fetch: recommendationBackend() });
  const result = await getRecommendationContext(h);
  assert.equal(result.success, true, JSON.stringify(result));
  assert.match(result.data.title.handle, /^th_[a-f0-9]{32}$/);
  assert.match(result.data.friends[0].handle, /^fh_[a-f0-9]{32}$/);
  assert.equal(result.data.title.title, 'Arrival');
  assert.equal(result.data.friends[0].displayName, 'Louise');
  assert.doesNotMatch(JSON.stringify(result),
    /329865|friend-user-private|friendship-private|recommendation-private/);
});

test('ambiguous title resolution returns the recoverable title-not-found state', async () => {
  const h = createHarness({
    ...storedSession(),
    fetch: recommendationBackend({
      resolve: async () => response(404, { error: 'TITLE_NOT_RESOLVED' }),
    }),
  });
  assert.deepEqual(await getRecommendationContext(h, 'Ambiguous title'), {
    success: false,
    error: 'TITLE_NOT_FOUND',
  });
});

test('authorized recommendation send maps handles internally and returns opaque undo handle', async () => {
  let rpcBody;
  const h = createHarness({
    ...storedSession(),
    fetch: recommendationBackend({
      send: async (_url, init) => {
        rpcBody = JSON.parse(init.body);
        return response(200, [{
          recipient_id: 'friend-user-private',
          recommendation_id: 'recommendation-private',
          status: 'SENT',
        }]);
      },
    }),
  });
  const context = await getRecommendationContext(h);
  const result = await h.dispatch({
    type: 'SEND_TITLE_RECOMMENDATION',
    titleHandle: context.data.title.handle,
    recipientHandles: [context.data.friends[0].handle],
  }, h.tabSender);
  assert.equal(result.success, true);
  assert.match(result.undoHandle, /^uh_[a-f0-9]{32}$/);
  assert.deepEqual(rpcBody.p_recipient_ids, ['friend-user-private']);
  assert.equal(rpcBody.p_tmdb_id, 329865);
  assert.equal(rpcBody.p_title, 'Arrival');
  assert.equal(rpcBody.p_platform, 'netflix');
  assert.equal('p_platforms' in rpcBody, false);
  assert.equal('p_rating' in rpcBody, false);
  assert.equal('p_duration' in rpcBody, false);
  assert.doesNotMatch(JSON.stringify(result), /friend-user-private|recommendation-private|329865/);
});

test('send rejects exact-key violations, non-handles, and handles from another context', async () => {
  const h = createHarness({ ...storedSession(), fetch: recommendationBackend() });
  const first = await getRecommendationContext(h, 'Arrival');
  const second = await getRecommendationContext(h, 'Arrival');
  const before = h.fetchCalls.filter((call) =>
    call.url.endsWith('/rest/v1/rpc/send_title_recommendation')).length;
  const extra = await h.dispatch({
    type: 'SEND_TITLE_RECOMMENDATION',
    titleHandle: first.data.title.handle,
    recipientHandles: [first.data.friends[0].handle],
    recipientIds: ['friend-user-private'],
  }, h.tabSender);
  const rawUuid = await h.dispatch({
    type: 'SEND_TITLE_RECOMMENDATION',
    titleHandle: first.data.title.handle,
    recipientHandles: ['friend-user-private'],
  }, h.tabSender);
  const crossed = await h.dispatch({
    type: 'SEND_TITLE_RECOMMENDATION',
    titleHandle: first.data.title.handle,
    recipientHandles: [second.data.friends[0].handle],
  }, h.tabSender);
  assert.deepEqual([extra.error, rawUuid.error, crossed.error],
    ['UNAUTHORIZED', 'UNAUTHORIZED', 'UNAUTHORIZED']);
  assert.equal(h.fetchCalls.filter((call) =>
    call.url.endsWith('/rest/v1/rpc/send_title_recommendation')).length, before);
});

test('worker restart makes recommendation handles stale', async () => {
  const firstWorker = createHarness({ ...storedSession(), fetch: recommendationBackend() });
  const context = await getRecommendationContext(firstWorker);
  const secondWorker = createHarness({ ...storedSession(), fetch: recommendationBackend() });
  const result = await secondWorker.dispatch({
    type: 'SEND_TITLE_RECOMMENDATION',
    titleHandle: context.data.title.handle,
    recipientHandles: [context.data.friends[0].handle],
  }, secondWorker.tabSender);
  assert.deepEqual(result, { success: false, error: 'STALE_CONTEXT' });
  assert.equal(secondWorker.fetchCalls.some((call) =>
    call.url.endsWith('/rest/v1/rpc/send_title_recommendation')), false);
});

test('undo uses only the private mapped IDs and never exposes recommendation UUIDs', async () => {
  let undoBody;
  let undoInit;
  const h = createHarness({
    ...storedSession(),
    fetch: recommendationBackend({
      undo: async (url, init) => {
        assert.match(url, /\/rest\/v1\/rpc\/undo_title_recommendation$/);
        undoBody = JSON.parse(init.body);
        undoInit = init;
        return response(200, [{
          recommendation_id: 'recommendation-private',
          status: 'UNDONE',
        }]);
      },
    }),
  });
  const context = await getRecommendationContext(h);
  const sent = await h.dispatch({
    type: 'SEND_TITLE_RECOMMENDATION',
    titleHandle: context.data.title.handle,
    recipientHandles: [context.data.friends[0].handle],
  }, h.tabSender);
  const undone = await h.dispatch({
    type: 'UNDO_TITLE_RECOMMENDATION',
    undoHandle: sent.undoHandle,
  }, h.tabSender);
  assert.deepEqual(undone, { success: true, undoneCount: 1 });
  assert.deepEqual(undoBody, { p_recommendation_ids: ['recommendation-private'] });
  assert.equal(undoInit.method, 'POST');
  assert.doesNotMatch(JSON.stringify({ sent, undone }), /recommendation-private/);
});

test('undo fails closed when the authoritative delete path is unavailable', async () => {
  const h = createHarness({
    ...storedSession(),
    fetch: recommendationBackend({ undo: async () => response(403, {}) }),
  });
  const context = await getRecommendationContext(h);
  const sent = await h.dispatch({
    type: 'SEND_TITLE_RECOMMENDATION',
    titleHandle: context.data.title.handle,
    recipientHandles: [context.data.friends[0].handle],
  }, h.tabSender);
  const result = await h.dispatch({
    type: 'UNDO_TITLE_RECOMMENDATION',
    undoHandle: sent.undoHandle,
  }, h.tabSender);
  assert.deepEqual(result, { success: false, error: 'UNDO_UNAVAILABLE' });
});

test('reactivated rows do not receive undo because no new recommendation was created', async () => {
  const h = createHarness({
    ...storedSession(),
    fetch: recommendationBackend({
      send: async () => response(200, [{
        recipient_id: 'friend-user-private',
        recommendation_id: null,
        status: 'REACTIVATED',
      }]),
    }),
  });
  const context = await getRecommendationContext(h);
  const sent = await h.dispatch({
    type: 'SEND_TITLE_RECOMMENDATION',
    titleHandle: context.data.title.handle,
    recipientHandles: [context.data.friends[0].handle],
  }, h.tabSender);
  assert.equal(sent.success, true);
  assert.equal(sent.undoHandle, null);
  assert.deepEqual(sent.results, [{
    status: 'REACTIVATED',
    displayName: 'Louise',
  }]);
});
