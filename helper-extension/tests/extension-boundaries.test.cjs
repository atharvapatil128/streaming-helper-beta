const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const extensionRoot = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(extensionRoot, name), 'utf8');

test('manifest declares the Beta 2 trusted-storage Chrome floor', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '0.4.1');
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
  assert.match(html, /id="connection-problem-message"/);
  assert.match(html, /id="connected-name"/);
  assert.match(html, /id="connected-username"/);
  assert.doesNotMatch(html, /connected-email/);
  assert.match(read('popup.js'), /invalid_credentials/);
  assert.match(read('popup.js'), /BACKEND_NOT_READY/);
  assert.match(read('popup.js'), /STORAGE_UNAVAILABLE/);
});

test('popup password controls are accessible and recovery uses the official reset entry', () => {
  const html = read('popup.html');
  const source = read('popup.js');
  const app = fs.readFileSync(path.resolve(extensionRoot, '..', 'src', 'app', 'App.tsx'), 'utf8');
  assert.match(html, /id="toggle-password-btn"/);
  assert.match(html, /aria-controls="password"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /aria-label="Show password"/);
  assert.match(html, /href="https:\/\/streaminghelper\.net\/\?auth=forgot"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(source, /password\.type = visible \? 'text' : 'password'/);
  assert.match(source, /setPasswordVisible\(false\)/);
  assert.match(app, /initialMode="forgot"/);
  assert.match(app, /if \(mode !== 'forgot'\) setAuthEntryMode\(null\)/);
  assert.match(app, /url\.searchParams\.delete\('auth'\)/);
  assert.match(app, /captureDeepLinkFromUrl\(\)/);
  assert.doesNotMatch(html, /[?&](?:email|password)=/i);
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
    'OPEN_TITLE_DESTINATION',
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
  assert.match(source, /'STORAGE_UNAVAILABLE'/);
  assert.match(source, /applyAuthState\(\{ status: response\.error === 'OFFLINE' \? 'offline' : 'service_error' \}\)/);
  assert.match(source, /MESSAGE_TIMEOUT_MS/);
  assert.match(source, /Checking connection/);
  assert.match(source, /panel\.innerHTML = buildPanelHTML\(false, null, false, true\);\s*fetchAndRenderPanelData/);
});

test('popup and recommendation messaging cannot remain pending forever', () => {
  assert.match(read('popup.js'), /MESSAGE_TIMEOUT_MS/);
  assert.match(read('recommend.js'), /MESSAGE_TIMEOUT_MS/);
});

test('title opening is worker-authorized and never accepts raw external URLs', () => {
  const background = read('background.js');
  const content = read('content.js');
  const destinations = read('title-destinations.js');
  assert.match(background, /chromeCall\(chrome\.tabs, 'create'/);
  assert.match(background, /validOpenMessage\(message\)/);
  assert.match(content, /type: 'OPEN_TITLE_DESTINATION'/);
  assert.match(destinations, /Search on/);
  assert.doesNotMatch(content, /window\.open\(/);
  assert.doesNotMatch(content, /Open on \$\{platform\}/);
  assert.match(content, /aria-busy/);
  assert.match(content, /button\.textContent = 'Opening\.\.\.'/);
  assert.doesNotMatch(content, /Openingâ/);
  assert.match(content, /Couldn't open a new tab\. Try again\./);
  assert.match(content, /actionGroup\.dataset\.opening = 'true'/);
  assert.match(content, /function clearComfortPick\(\)/);
  assert.match(content, /clearComfortPick\(\);\s*openRecsOverlay\(\)/);
  assert.match(content, /function closePanel\(options\) \{\s*clearComfortPick\(\)/);
  assert.match(content, /\.sh-comfort-open:disabled\s*\{\s*opacity: 1;/);
  assert.match(content, /\.sh-comfort-status\s*\{[^}]*font-size: 11px;[^}]*color: #b8cbb8;/);
  assert.match(content, /\.sho-action-btn:disabled\s*\{\s*opacity: 1;/);
  assert.match(content, /\.sho-action-status\s*\{[^}]*font-size: 12px;[^}]*color: #b8b8c8;/);
  assert.match(content, /Pick another/);
  assert.match(content, /<button type="button" class="sho-card"/);
  assert.match(content, /event\.key !== 'Tab'/);
  assert.match(content, /prefers-reduced-motion/);
  assert.doesNotMatch(destinations, /https?:\/\/\$\{/);
  assert.match(destinations, /https:\/\/www\.netflix\.com\/search/);
  assert.match(destinations, /https:\/\/www\.primevideo\.com\/search/);
  assert.match(destinations, /https:\/\/www\.hulu\.com\/search/);
  assert.match(destinations, /https:\/\/www\.themoviedb\.org/);
});
