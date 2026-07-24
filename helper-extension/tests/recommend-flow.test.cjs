const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('recommendation content script parses and is loaded after the helper', () => {
  const source = read('recommend.js');
  assert.doesNotThrow(() => new vm.Script(source));
  const manifest = JSON.parse(read('manifest.json'));
  assert.deepEqual(manifest.content_scripts[0].js, ['content.js', 'recommend.js']);
  assert.equal(manifest.version, '0.3.1');
});

test('refresh lifecycle initializes panel state before the first fetch', () => {
  const source = read('content.js');
  const initialization = source.indexOf('let panelFetchVersion = 0;');
  const firstFetch = source.indexOf('fetchAndRenderPanelData().catch');
  assert.ok(initialization >= 0, 'panel version initialization is present');
  assert.ok(firstFetch > initialization,
    'the first fetch cannot run while panelFetchVersion is in the temporal dead zone');
  assert.match(source, /if \(version !== panelFetchVersion\) return;/);
});

test('detected-title flow supports all declared streaming platforms', () => {
  const source = read('recommend.js');
  for (const platform of ['netflix', 'primevideo', 'disneyplus', 'hulu', 'max']) {
    assert.match(source, new RegExp(`${platform}:\\s*\\{`));
  }
  assert.match(source, /MutationObserver/);
  assert.match(source, /location\.href/);
  assert.match(source, /FETCH_RECOMMENDATION_CONTEXT/);
  assert.match(source, /SEND_TITLE_RECOMMENDATION/);
  assert.match(source, /UNDO_TITLE_RECOMMENDATION/);
});

test('detected-title action coexists with the original helper and reads Prime title assets', () => {
  const recommend = read('recommend.js');
  const helper = read('content.js');
  assert.match(recommend, /positionAlongsideHelper/);
  assert.doesNotMatch(recommend, /helper\.style\.display\s*=\s*'none'/);
  assert.match(recommend, /\[class\*="title"\] img\[alt\]/);
  assert.match(recommend, /getAttribute\?\.\('aria-label'\)/);
  assert.match(recommend, /new CustomEvent\('sh:recommend-open'\)/);
  assert.match(helper, /new CustomEvent\('sh:helper-open'\)/);
});

test('content contexts do not access credentials, Supabase, or database identifiers', () => {
  for (const name of ['content.js', 'recommend.js']) {
    const source = read(name);
    assert.doesNotMatch(source, /sh_(access|refresh)_token/);
    assert.doesNotMatch(source, /chrome\.storage/);
    assert.doesNotMatch(source, /supabase\.co/);
    assert.doesNotMatch(source, /\b(friend|user|recommendation)Id\b/);
  }
  const source = read('recommend.js');
  assert.match(source, /recipientHandles/);
  assert.match(source, /titleHandle/);
  assert.match(source, /undoHandle/);
});

test('extension surfaces use closed shadow roots and HTTPS-only matches', () => {
  const content = read('content.js');
  const recommend = read('recommend.js');
  assert.doesNotMatch(content, /attachShadow\(\{ mode: 'open' \}\)/);
  assert.doesNotMatch(recommend, /attachShadow\(\{ mode: 'open' \}\)/);
  assert.match(content, /hostMountObserver/);
  assert.match(content, /if \(!host\.isConnected\)/);
  assert.match(recommend, /if \(!host\.isConnected\)/);
  assert.match(recommend, /setProperty\('z-index', '2147483647', 'important'\)/);
  const manifest = JSON.parse(read('manifest.json'));
  for (const pattern of manifest.content_scripts[0].matches) {
    assert.match(pattern, /^https:\/\//);
  }
});

test('supplied recommendation icon is packaged as a real image asset', () => {
  const bytes = fs.readFileSync(path.join(root, 'icons', 'recommend-active.png'));
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
  const manifest = JSON.parse(read('manifest.json'));
  assert.ok(manifest.web_accessible_resources[0].resources.includes(
    'icons/recommend-active.png',
  ));
});

test('picker includes keyboard and recoverable interaction states', () => {
  const source = read('recommend.js');
  assert.match(source, /aria-haspopup/);
  assert.match(source, /aria-expanded/);
  assert.match(source, /aria-live/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /STALE_CONTEXT/);
  assert.match(source, /FRIENDSHIP_CHANGED/);
  assert.match(source, /RATE_LIMITED/);
  assert.match(source, /prefers-reduced-motion/);
});
