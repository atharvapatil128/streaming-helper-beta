const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('recommendation content script parses and is loaded after the helper', () => {
  const detection = read('recommend-detection.js');
  const source = read('recommend.js');
  assert.doesNotThrow(() => new vm.Script(detection));
  assert.doesNotThrow(() => new vm.Script(source));
  const manifest = JSON.parse(read('manifest.json'));
  assert.deepEqual(
    manifest.content_scripts[0].js,
    [
      'title-destinations.js',
      'content.js',
      'recommend-detection.js',
      'recommend.js',
    ],
  );
  assert.equal(manifest.version, '0.4.2');
});

test('title destination resolver preserves supported choices and builds only allowlisted URLs', () => {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read('title-destinations.js'), sandbox);
  const destinations = sandbox.StreamingHelperTitleDestinations;

  const actions = destinations.titleActions({
    title: 'Derry Girls & Friends',
    platforms: ['Disney+', 'Hulu', 'Netflix', 'Hulu'],
    tmdbId: 76148,
    mediaType: 'series',
  }, 'netflix');
  assert.deepEqual(
    Array.from(actions, (action) => action.destination),
    ['netflix', 'hulu', 'tmdb'],
  );
  assert.deepEqual(
    Array.from(actions, (action) => action.label),
    ['Search on Netflix', 'Search on Hulu', 'View title details'],
  );
  assert.equal(destinations.buildUrl({
    destination: 'hulu',
    title: 'Derry Girls & Friends',
    tmdbId: null,
    mediaType: null,
  }), 'https://www.hulu.com/search?q=Derry%20Girls%20%26%20Friends');
  assert.equal(destinations.buildUrl({
    destination: 'tmdb',
    title: 'Derry Girls',
    tmdbId: 76148,
    mediaType: 'series',
  }), 'https://www.themoviedb.org/tv/76148');
  assert.equal(destinations.buildUrl({
    destination: 'https://evil.example',
    title: 'Derry Girls',
    tmdbId: null,
    mediaType: null,
  }), null);
  assert.deepEqual(Array.from(destinations.titleActions({
    title: 'Unknown',
    platforms: ['Max', 'Disney+'],
    tmdbId: null,
    mediaType: null,
  })), []);
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

test('watch detector distinguishes playback routes and Prime hero/detail state', () => {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read('recommend-detection.js'), sandbox);
  const detector = sandbox.StreamingHelperWatchDetection;

  assert.equal(detector.isWatchScreen('netflix', '/watch/81716219'), true);
  assert.equal(detector.isWatchScreen('netflix', '/title/81716219'), false);
  assert.equal(detector.isWatchScreen('disneyplus', '/play/abc'), true);
  assert.equal(detector.isWatchScreen('disneyplus', '/movies/example/abc'), false);
  assert.equal(detector.isWatchScreen('hulu', '/watch/abc'), true);
  assert.equal(detector.isWatchScreen('hulu', '/series/example'), false);
  assert.equal(detector.isWatchScreen('max', '/video/watch/abc'), true);
  assert.equal(detector.isWatchScreen('max', '/shows/example'), false);
  assert.equal(detector.isWatchScreen('primevideo', '/detail/example/abc', {
    hasLargePlayer: true,
    hasExposedDetailTitle: true,
  }), false);
  assert.equal(detector.isWatchScreen('primevideo', '/detail/example/abc', {
    hasViewportPlayer: true,
    hasExposedDetailTitle: true,
  }), false);
  assert.equal(detector.isWatchScreen('primevideo', '/detail/example/abc', {
    hasLargePlayer: true,
    hasActiveMedia: true,
    hasExposedDetailShell: true,
  }), false);
  assert.equal(detector.isWatchScreen('primevideo', '/detail/example/abc', {
    hasLargePlayer: true,
    hasExposedDetailTitle: false,
  }), true);
  assert.equal(detector.isWatchScreen('primevideo', '/detail/example/abc', {
    hasLargePlayer: false,
    hasExposedDetailTitle: false,
  }), false);
  assert.equal(detector.isWatchScreen('primevideo', '/detail/example/abc', {
    hasLargePlayer: false,
    hasActiveMedia: true,
    hasExposedDetailTitle: false,
  }), true);
  assert.equal(detector.isWatchScreen('primevideo', '/detail/example/abc', {
    hasLargePlayer: false,
    hasFullscreenPlayer: true,
    hasExposedDetailTitle: false,
  }), true);
  assert.equal(detector.isWatchScreen('primevideo', '/detail/example/abc', {
    hasLargePlayer: true,
    hasActiveMedia: true,
    hasFullscreenPlayer: true,
    hasExposedDetailTitle: true,
  }), true);
  assert.equal(detector.watchStatus('primevideo', '/detail/example/abc', {
    hasLargePlayer: false,
    hasExposedDetailTitle: false,
  }), 'unknown');
  assert.equal(detector.isPrimeDetailActionText('Resume S1 E1'), true);
  assert.equal(detector.isPrimeDetailActionText('Play S2 E4'), true);
  assert.equal(detector.isPrimeDetailActionText('movies, TV shows, sports, and live TV'), false);
  assert.equal(detector.isPrimeDetailTabText('Episodes'), true);
  assert.equal(detector.isPrimeDetailTabText('Explore & Shop'), true);
  assert.equal(detector.isPrimeDetailTabText('Playback settings'), false);
  assert.equal(detector.isGenericPrimeMarketingTitle(
    'Prime Video: Watch movies, TV shows, sports, and live TV',
  ), true);
  assert.equal(detector.isGenericPrimeMarketingTitle(
    'Amazon Prime Video — movies, TV shows, sports, and live TV',
  ), true);
  assert.equal(detector.isGenericPrimeMarketingTitle('Spider-Noir'), false);
});

test('watch-mode transitions restore helpers, honor grace, exposure, and responsive size', () => {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read('recommend-detection.js'), sandbox);
  const detector = sandbox.StreamingHelperWatchDetection;

  const hiddenSlot = detector.computeHelperSlot({
    rectWidth: 0,
    rectHeight: 0,
    inlineTop: '110px',
    inlineRight: '24px',
    declaredSize: '34px',
    previousSize: 40,
    viewportWidth: 900,
  });
  assert.equal(hiddenSlot.top, 110);
  assert.equal(hiddenSlot.right, 24);
  assert.equal(hiddenSlot.size, 34);

  const helper = { style: { display: 'block' } };
  const helperState = { hiddenHelper: null, previousDisplay: '' };
  let entered = 0;
  detector.applyHelperMode(helper, true, helperState, () => { entered += 1; });
  detector.applyHelperMode(helper, true, helperState, () => { entered += 1; });
  assert.equal(entered, 1);
  assert.equal(helper.style.display, 'none');
  detector.applyHelperMode(helper, false, helperState);
  assert.equal(helper.style.display, 'block');
  assert.equal(helperState.hiddenHelper, null);

  const title = { title: 'Arrival' };
  const firstMiss = detector.nextTitleState(
    { detected: title, missingTitleSince: 0, watchStatus: 'watch' },
    null,
    1_000,
    2_000,
  );
  assert.equal(firstMiss.action, 'hold');
  const finalMiss = detector.nextTitleState(
    {
      detected: title,
      missingTitleSince: firstMiss.missingTitleSince,
      watchStatus: 'unknown',
    },
    null,
    3_001,
    2_000,
  );
  assert.equal(finalMiss.action, 'clear');
  const detailExit = detector.nextTitleState(
    { detected: title, missingTitleSince: 0, watchStatus: 'detail' },
    null,
    1_100,
    2_000,
  );
  assert.equal(detailExit.action, 'clear');

  assert.equal(detector.nextDetectionDeadline(0, 1_000, 200), 1_200);
  assert.equal(detector.nextDetectionDeadline(1_200, 1_050, 200), 1_200);
  assert.equal(detector.nextDetectionDeadline(1_200, 1_050, 25), 1_075);
  assert.equal(detector.nextDetectionDeadline(1_200, 1_200, 200), 1_200);
  assert.equal(detector.nextDetectionDeadline(1_200, 1_250, 200), 1_200);
  let stormDeadline = detector.nextDetectionDeadline(0, 1_000, 200);
  for (let now = 1_050; now <= 1_500; now += 50) {
    stormDeadline = detector.nextDetectionDeadline(stormDeadline, now, 200);
  }
  assert.equal(stormDeadline, 1_200);

  const playingVideo = { ended: false, readyState: 4, paused: false };
  assert.equal(detector.isActiveVideo(playingVideo, () => true), true);
  assert.equal(detector.isActiveVideo(
    { ...playingVideo, ended: true },
    () => true,
  ), false);
  assert.equal(detector.isActiveVideo(
    { ...playingVideo, paused: true },
    () => true,
  ), false);
  assert.equal(detector.isActiveVideo(playingVideo, () => false), false);

  const child = {};
  const occluder = {};
  const node = {
    getBoundingClientRect: () => ({
      left: 20, top: 20, right: 220, bottom: 80, width: 200, height: 60,
    }),
    contains: (candidate) => candidate === child,
  };
  const windowRef = { innerWidth: 800, innerHeight: 600 };
  assert.equal(detector.isElementExposed(
    node,
    { elementsFromPoint: () => [occluder] },
    windowRef,
    () => true,
  ), false);
  assert.equal(detector.isElementExposed(
    node,
    { elementsFromPoint: () => [child] },
    windowRef,
    () => true,
  ), true);
  const detailExposedBeneathHelperOverlay = detector.isElementExposed(
    node,
    { elementsFromPoint: () => [occluder, child] },
    windowRef,
    () => true,
    (candidate) => candidate === occluder,
  );
  assert.equal(detailExposedBeneathHelperOverlay, true);
  assert.equal(detector.watchStatus('primevideo', '/detail/example/abc', {
    hasActiveMedia: true,
    hasLargePlayer: true,
    hasExposedDetailShell: detailExposedBeneathHelperOverlay,
  }), 'detail');
  const pageModal = {};
  assert.equal(detector.isElementExposed(
    node,
    { elementsFromPoint: () => [occluder, pageModal, child] },
    windowRef,
    () => true,
    (candidate) => candidate === occluder,
  ), false);
});

test('recommendation replaces the helper only on watch screens in the original slot', () => {
  const recommend = read('recommend.js');
  const detection = read('recommend-detection.js');
  const helper = read('content.js');
  assert.match(recommend, /watchDetection\.isWatchScreen/);
  assert.match(recommend, /primePlaybackState/);
  assert.match(recommend, /hasActiveMedia/);
  assert.match(recommend, /hasViewportPlayer/);
  assert.match(recommend, /navigator\.mediaSession/);
  assert.match(recommend, /querySelectorAll\('video'\)/);
  assert.doesNotMatch(recommend, /querySelectorAll\('video, audio'\)/);
  assert.match(recommend, /watchDetection\.isActiveVideo\(media, isVisibleElement\)/);
  assert.match(recommend, /function primePlaybackTitle/);
  assert.match(recommend, /TITLE_LOSS_GRACE_MS/);
  assert.match(recommend, /attributeFilter:\s*\[\s*'class', 'style', 'hidden'/);
  assert.match(detection, /elementsFromPoint/);
  assert.match(recommend, /function isRecommendationsOverlaySurface\(node\)/);
  assert.match(recommend, /surface\?\.id === 'sh-overlay-root'/);
  assert.match(recommend, /isVisibleElement,\s*isRecommendationsOverlaySurface/);
  assert.match(recommend, /positionInHelperSlot/);
  assert.match(recommend, /watchDetection\.applyHelperMode/);
  assert.match(helper, /--sh-helper-size/);
  assert.match(recommend, /new CustomEvent\('sh:watch-mode-enter'\)/);
  assert.match(helper, /closeRecsOverlay\(\{ focusTrigger: false \}\)/);
  assert.match(recommend, /--sh-recommend-size/);
  assert.match(recommend, /nextDetectionDeadline/);
  assert.doesNotMatch(recommend, /if \(unchanged\) \{\s*positionInHelperSlot/);
  assert.doesNotMatch(recommend, /lastHref = location\.href;\s*setDetected\(null\)/);
  assert.match(recommend, /lastPrimeSafetyCheck/);
  assert.match(recommend, /'aria-label', 'alt'/);
  assert.doesNotMatch(recommend, /'main h1'/);
  assert.match(recommend, /\^rated\\s\+/);
  assert.match(recommend, /clearTimeout\(resizeTimer\)/);
  assert.match(helper, /new CustomEvent\('sh:helper-positioned'\)/);
  assert.match(recommend, /addEventListener\('sh:helper-positioned'/);
  assert.match(recommend, /clearTimeout\(helperPositionTimer\)/);
  assert.match(recommend, /if \(event\.persisted\) return;/);
  assert.match(helper, /if \(event\.persisted\) return;/);
  assert.match(recommend, /\[data-testid\*="player" i\] \[data-testid\*="title" i\]/);
  assert.match(recommend, /getAttribute\?\.\('aria-label'\)/);
});

test('content contexts do not access credentials, Supabase, or database identifiers', () => {
  for (const name of ['content.js', 'recommend-detection.js', 'recommend.js']) {
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
