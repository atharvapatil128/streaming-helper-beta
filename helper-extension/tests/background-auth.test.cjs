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
  local.setAccessLevel = function (details, callback) {
    operations.push('local.setAccessLevel');
    assert.equal(details.accessLevel, 'TRUSTED_CONTEXTS');
    queueMicrotask(() => callback());
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

test('sign-in stores access token in session and never persists or returns email', async () => {
  const h = createHarness({
    fetch: async (url) => {
      if (url.includes('grant_type=password')) {
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
    { type: 'AUTH_SIGN_IN', email: 'private@example.com', password: 'never-log-me' },
    h.popupSender,
  );

  assert.equal(result.success, true);
  assert.equal(h.sessionData.sh_access_token, 'access-secret');
  assert.equal(h.localData.sh_access_token, undefined);
  assert.equal(h.localData.sh_refresh_token, 'refresh-secret');
  assert.equal(h.localData.sh_user_email, undefined);
  assert.doesNotMatch(JSON.stringify({ result, local: h.localData }), /private@example|access-secret|never-log-me/);
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
      if (url.includes('grant_type=password')) {
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
    { type: 'AUTH_SIGN_IN', email: 'user@example.com', password: 'password' },
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
