const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const extensionRoot = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(extensionRoot, name), 'utf8');

test('manifest declares the Beta 2 trusted-storage Chrome floor', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '0.3.0');
  assert.equal(manifest.minimum_chrome_version, '102');
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.ok(!manifest.permissions.includes('tabs'));
  assert.ok(!manifest.permissions.includes('alarms'));
});

test('popup and content script never access credentials or Supabase directly', () => {
  for (const name of ['popup.js', 'content.js']) {
    const source = read(name);
    assert.doesNotMatch(source, /SUPABASE_(URL|ANON_KEY)/);
    assert.doesNotMatch(source, /sh_(access|refresh)_token/);
    assert.doesNotMatch(source, /chrome\.storage/);
    assert.doesNotMatch(source, /supabase\.co/);
    assert.doesNotMatch(source, /streaming-helper-beta\.vercel\.app/);
  }
});

test('connected popup uses safe profile identity and explicit transient states', () => {
  const html = read('popup.html');
  assert.match(html, /id="view-checking"/);
  assert.match(html, /id="view-problem"/);
  assert.match(html, /id="connected-name"/);
  assert.match(html, /id="connected-username"/);
  assert.doesNotMatch(html, /connected-email/);
  assert.match(read('popup.js'), /invalid_credentials/);
});

test('all extension companion links use the official product origin', () => {
  assert.match(read('popup.js'), /https:\/\/streaminghelper\.net\//);
  assert.match(read('content.js'), /https:\/\/streaminghelper\.net\//);
  for (const name of ['popup.js', 'content.js', 'README.md']) {
    assert.doesNotMatch(read(name), /streaming-helper-beta\.vercel\.app/);
  }
});

test('background exposes only the intended message surface', () => {
  const source = read('background.js');
  for (const type of [
    'OPEN_EXTENSION_POPUP',
    'AUTH_GET_STATE',
    'AUTH_SIGN_IN',
    'AUTH_SIGN_OUT',
    'FETCH_PANEL_DATA',
  ]) {
    assert.match(source, new RegExp(type));
  }
  assert.match(source, /TRUSTED_CONTEXTS/);
  assert.match(source, /logout\?scope=local/);
  assert.equal((source.match(/sh_user_email/g) || []).length, 1,
    'legacy email key appears only in the cleanup list');
});

test('content treats broker transport failures as connection problems', () => {
  const source = read('content.js');
  assert.match(source, /'OFFLINE', 'SERVICE_ERROR', 'NETWORK_ERROR'/);
  assert.match(source, /applyAuthState\(\{ status: response\.error === 'OFFLINE' \? 'offline' : 'service_error' \}\)/);
});
