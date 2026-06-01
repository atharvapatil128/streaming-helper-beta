/**
 * Streaming Helper — Content Script (Beta 1)
 *
 * Injects a subtle floating icon into supported streaming pages.
 * All UI lives inside a Shadow DOM for full style isolation.
 *
 * Positioning is dynamic:
 *   1. Try to detect a visible header/nav element and sit below it.
 *   2. If detection is ambiguous, fall back to per-platform top offsets.
 *   3. Recalculate on viewport resize (debounced) and on SPA navigation
 *      (URL polling — works for pushState-based routers).
 *
 * Supported sites: netflix.com, primevideo.com, disneyplus.com,
 *                  hulu.com, max.com
 */

(function () {
  'use strict';

  // Guard: don't inject twice.
  if (document.getElementById('sh-root')) return;

  // ── Icon URLs ─────────────────────────────────────────────────────────────
  const PASSIVE_ICON_URL = chrome.runtime.getURL('icons/helper-passive.svg');
  // Reserved for a future active/triggered state — not wired yet.
  // const ACTIVE_ICON_URL = chrome.runtime.getURL('icons/helper-active.svg');

  // App logo shown in the panel header while the extension is not connected
  // to auth. Replace APP_ICON_URL with a data-URI of the user's initials/
  // avatar once session state is available (future auth integration).
  const APP_ICON_URL = chrome.runtime.getURL('icons/icon.svg');

  // ── Connection state ──────────────────────────────────────────────────────
  // Stored in chrome.storage.local under the key `streamingHelperConnected`.
  // The panel re-renders automatically whenever the value changes — no page
  // reload needed.
  //
  // To manually toggle from DevTools (any tab with the extension loaded):
  //   Set connected:     chrome.storage.local.set({ streamingHelperConnected: true })
  //   Set not-connected: chrome.storage.local.set({ streamingHelperConnected: false })
  //   Read current:      chrome.storage.local.get('streamingHelperConnected', console.log)
  //
  // Future: replace the storage write with a Supabase session check so that
  // signing in/out of the companion app automatically updates this key.
  const STORAGE_KEY = 'streamingHelperConnected';

  // ── Platform detection ────────────────────────────────────────────────────
  // Maps hostname substrings to a platform key.
  const PLATFORM_ID = (function () {
    const h = window.location.hostname;
    if (h.includes('netflix'))      return 'netflix';
    if (h.includes('primevideo'))   return 'primevideo';
    if (h.includes('disneyplus'))   return 'disneyplus';
    if (h.includes('hulu'))         return 'hulu';
    if (h.includes('max.com') || h === 'max.com') return 'max';
    return 'default';
  })();

  // Per-platform fallback top offsets (px), used when header detection
  // fails or is ambiguous. Values are hand-tuned to avoid each site's nav.
  const PLATFORM_FALLBACK_TOP = {
    netflix:    96,
    primevideo: 110,
    disneyplus: 96,
    hulu:       100,
    max:        104,
    default:    96,
  };

  // Right inset — constant across all platforms/sizes.
  const RIGHT_OFFSET = 24;

  // Button pixel size per viewport width bucket.
  function getButtonSize() {
    return window.innerWidth < 1024 ? 34 : 40;
  }

  // ── Header / nav avoidance ────────────────────────────────────────────────
  // Queries common structural selectors and returns the bottom edge (px) of
  // whichever matching element best represents the primary top navigation.
  //
  // Filtering criteria (all must pass):
  //   • rect.top  ≤ 10      — anchored to the very top of the viewport
  //   • rect.height ≥ 40    — tall enough to be a real header
  //   • rect.height ≤ 200   — not the whole page
  //   • rect.bottom ≤ 300   — bottom must be near the top (not a sidebar)
  //   • rect.width ≥ 40 %   — spans a significant fraction of the viewport
  //
  // Returns null when nothing reliable is found.
  function detectHeaderBottom() {
    const selectors = ['header', 'nav', '[role="navigation"]'];
    let maxBottom = 0;

    for (const sel of selectors) {
      let elements;
      try {
        elements = document.querySelectorAll(sel);
      } catch (_) {
        continue;
      }

      for (const el of elements) {
        let rect;
        try {
          rect = el.getBoundingClientRect();
        } catch (_) {
          continue;
        }

        if (
          rect.top <= 10 &&
          rect.height >= 40 &&
          rect.height <= 200 &&
          rect.bottom <= 300 &&
          rect.width >= window.innerWidth * 0.4
        ) {
          maxBottom = Math.max(maxBottom, rect.bottom);
        }
      }
    }

    return maxBottom > 0 ? maxBottom : null;
  }

  // ── positionHost ──────────────────────────────────────────────────────────
  // The single source of truth for where the host sits on screen.
  // Called on init (with a few staggered retries for slow-loading navs),
  // on resize, and after SPA navigation.
  function positionHost() {
    const headerBottom = detectHeaderBottom();
    const fallback      = PLATFORM_FALLBACK_TOP[PLATFORM_ID];

    // Prefer header-detected position; otherwise use platform fallback.
    const rawTop = headerBottom !== null
      ? Math.round(headerBottom + 16)
      : fallback;

    // Hard clamp: never go above 8 px or below 80 % of viewport height.
    const top = Math.max(8, Math.min(rawTop, Math.round(window.innerHeight * 0.8)));

    host.style.top   = top + 'px';
    host.style.right = RIGHT_OFFSET + 'px';

    // Adapt button (and its wrapper) size to viewport width.
    const size = getButtonSize();
    wrapper.style.width  = size + 'px';
    wrapper.style.height = size + 'px';
    btn.style.width      = size + 'px';
    btn.style.height     = size + 'px';
  }

  // ── 1. Host element ───────────────────────────────────────────────────────
  const host = document.createElement('div');
  host.id = 'sh-root';
  host.style.cssText = [
    'position: fixed',
    'top: 96px',              // sensible default before positionHost runs
    'right: 24px',
    'z-index: 2147483647',
    'pointer-events: none',
  ].join(';');
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // ── 2. Styles ─────────────────────────────────────────────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* ── Wrapper ─────────────────────────────────────────────────────────── */
    /* Relative container; size is overridden by positionHost(). Panel      */
    /* overflows downward via absolute positioning.                          */
    .sh-wrapper {
      position: relative;
      width: 40px;
      height: 40px;
    }

    /* ── Toggle button ───────────────────────────────────────────────────── */
    /* No background or border — the SVG is the only visible UI element.    */
    /* Passive: low opacity so it stays unobtrusive during watching.        */
    .sh-btn {
      pointer-events: auto;
      width: 100%;
      height: 100%;
      background: none;
      border: none;
      padding: 0;
      margin: 0;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.60;
      outline: none;
      transition:
        opacity   0.20s ease,
        transform 0.15s ease;
    }
    .sh-btn:hover {
      opacity: 1;
      transform: scale(1.06);
    }
    .sh-btn:active {
      transform: scale(0.94);
    }
    /* While panel is open, keep the button at full opacity */
    .sh-btn.sh-open {
      opacity: 1;
    }

    /* SVG icon image — fills the button, no distortion */
    .sh-btn-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      pointer-events: none;
      display: block;
    }

    /* ── Panel ───────────────────────────────────────────────────────────── */
    /* Appears below the button; transform-origin top-right so it animates  */
    /* out from the corner where the button sits.                            */
    .sh-panel {
      pointer-events: none;
      position: absolute;
      top: calc(100% + 10px);
      right: 0;
      width: 264px;
      background: #0f0f14;
      border: 1px solid #1f1f28;
      border-radius: 16px;
      padding: 15px;
      box-shadow:
        0 8px 36px rgba(0, 0, 0, 0.75),
        0 2px 10px rgba(0, 0, 0, 0.40);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
                   'Helvetica Neue', Arial, sans-serif;
      /* Hidden state */
      opacity: 0;
      transform: translateY(-6px) scale(0.97);
      transform-origin: top right;
      transition: opacity 0.18s ease, transform 0.18s ease;
    }
    .sh-panel.sh-visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    /* ── Panel header ────────────────────────────────────────────────────── */
    .sh-header {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-bottom: 12px;
    }
    /* Logo slot — holds the app icon when not connected to auth.
       When the user is logged in, swap this for a user-avatar/initials
       element (future integration). */
    .sh-logo {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      overflow: hidden;
      flex-shrink: 0;
      /* No background here; icon.svg provides its own purple background. */
    }
    .sh-logo-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .sh-header-text {
      flex: 1;
      min-width: 0;
    }
    .sh-title {
      font-size: 13px;
      font-weight: 600;
      color: #e4e4e7;
      letter-spacing: 0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sh-subtitle {
      font-size: 10px;
      color: #8b8b9e;
      margin-top: 1px;
    }

    /* ── Hint message ────────────────────────────────────────────────────── */
    /* Compact helper text shown below the divider in the not-connected
       state. Remove or hide this when the extension is authenticated.      */
    .sh-hint {
      font-size: 11px;
      color: #5b5b6e;
      line-height: 1.45;
      margin-bottom: 10px;
      padding: 0 1px;
    }
    .sh-open-app {
      pointer-events: auto;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 7px;
      background: transparent;
      border: 1px solid #2a2a35;
      color: #8b8b9e;
      text-decoration: none;
      flex-shrink: 0;
      transition: background 0.14s ease, color 0.14s ease, border-color 0.14s ease;
    }
    .sh-open-app:hover {
      background: #1f1f28;
      color: #e4e4e7;
      border-color: #3a3a48;
    }
    .sh-open-app svg {
      width: 13px;
      height: 13px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* ── Divider ─────────────────────────────────────────────────────────── */
    .sh-divider {
      height: 1px;
      background: #1f1f28;
      margin: 0 0 11px 0;
    }

    /* ── Feature rows ────────────────────────────────────────────────────── */
    /* Slightly dimmed to communicate inactive/not-connected state.         */
    .sh-row {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 9px 10px;
      background: #1a1a22;
      border: 1px solid #1f1f28;
      border-radius: 10px;
      margin-bottom: 6px;
      opacity: 0.78;
      cursor: default;
    }
    .sh-row:last-of-type {
      margin-bottom: 0;
    }
    .sh-row-icon {
      width: 30px;
      height: 30px;
      border-radius: 7px;
      background: #2a2a35;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .sh-row-icon svg {
      width: 14px;
      height: 14px;
      fill: none;
      stroke: #6b6b7e;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .sh-row-body {
      flex: 1;
      min-width: 0;
    }
    .sh-row-label {
      font-size: 12px;
      font-weight: 500;
      color: #c4c4cf;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sh-row-desc {
      font-size: 10px;
      color: #5b5b6e;
      margin-top: 2px;
    }
    /* Badge base — shared by both states */
    .sh-badge {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
      flex-shrink: 0;
      /* Not-connected default ("Connect") */
      background: #1e1e2e;
      color: #7b7b9e;
      border: 1px solid #2a2a3e;
    }
    /* Connected state badge ("Ready") */
    .sh-badge--ready {
      background: #142014;
      color: #5a9e5a;
      border-color: #1e3a1e;
    }

    /* ── Connected / active card overrides ───────────────────────────────── */
    /* Applied to .sh-row when isConnected is true. Restores full opacity    */
    /* and normal text/icon colours to signal the feature is live.          */
    .sh-row--active {
      opacity: 1;
    }
    .sh-row--active .sh-row-icon svg {
      stroke: #8b8b9e;
    }
    .sh-row--active .sh-row-label {
      color: #e4e4e7;
    }
    .sh-row--active .sh-row-desc {
      color: #8b8b9e;
    }

    /* ── Footer ──────────────────────────────────────────────────────────── */
    .sh-footer {
      margin-top: 10px;
      text-align: center;
      font-size: 10px;
      color: #3b3b4e;
      letter-spacing: 0.02em;
    }
  `;
  shadow.appendChild(styleEl);

  // ── 3. Inline SVG helpers ─────────────────────────────────────────────────
  function svgIcon(path) {
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${path}</svg>`;
  }

  const SVG_STAR     = svgIcon('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>');
  const SVG_HEART    = svgIcon('<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>');
  const SVG_EXTERNAL = svgIcon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>');

  // ── 4. Panel HTML builder ─────────────────────────────────────────────────
  // Produces the panel's inner HTML for either connection state.
  // Swap `isConnected` above to preview both states without any other change.
  //
  // Future: call buildPanelHTML(!!session?.user) after an auth check and
  // reassign panel.innerHTML to re-render in place.
  function buildPanelHTML(connected) {
    // Card row class — adds .sh-row--active overrides when connected.
    const rowClass = connected ? 'sh-row sh-row--active' : 'sh-row';

    // Badge — "Connect" when not authenticated, "Ready" when authenticated.
    const badge = connected
      ? '<span class="sh-badge sh-badge--ready">Ready</span>'
      : '<span class="sh-badge">Connect</span>';

    // Hint message — only shown in the not-connected state.
    const hint = connected
      ? ''
      : `<p class="sh-hint">Open the companion app to connect recommendations and comfort picks.</p>`;

    // Card descriptions differ slightly per state.
    const recDesc     = connected ? 'From your friends'        : 'See what your friends suggest';
    const comfortDesc = connected ? 'Your saved comfort titles' : 'Your go-to comfort rewatch';

    return `
      <div class="sh-header">
        <!--
          Logo slot — shows app icon when not connected to auth.
          To show user initials/avatar once logged in, replace the <img>
          with a styled element, e.g.:
            <div class="sh-logo sh-logo-avatar">AB</div>
          and add .sh-logo-avatar CSS (background, font, centering).
        -->
        <div class="sh-logo">
          <img class="sh-logo-img" src="${APP_ICON_URL}" alt="" aria-hidden="true" />
        </div>

        <div class="sh-header-text">
          <div class="sh-title">Streaming Helper</div>
          <div class="sh-subtitle">Passive mode</div>
        </div>

        <a
          class="sh-open-app"
          href="https://streaming-helper-beta.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          title="Open Streaming Helper web app"
        >${SVG_EXTERNAL}</a>
      </div>

      <div class="sh-divider"></div>

      ${hint}

      <div class="${rowClass}">
        <div class="sh-row-icon">${SVG_STAR}</div>
        <div class="sh-row-body">
          <div class="sh-row-label">Friend Recommendations</div>
          <div class="sh-row-desc">${recDesc}</div>
        </div>
        ${badge}
      </div>

      <div class="${rowClass}">
        <div class="sh-row-icon">${SVG_HEART}</div>
        <div class="sh-row-body">
          <div class="sh-row-label">Comfort Pick</div>
          <div class="sh-row-desc">${comfortDesc}</div>
        </div>
        ${badge}
      </div>

      <div class="sh-footer">Streaming Helper</div>
    `;
  }

  // ── 5. DOM structure ───────────────────────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.className = 'sh-wrapper';

  // Panel (opens downward below the button)
  const panel = document.createElement('div');
  panel.className = 'sh-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Streaming Helper');
  // Start with the not-connected state as the default; storage read below
  // will update it immediately if a different value has been stored.
  panel.innerHTML = buildPanelHTML(false);
  wrapper.appendChild(panel);

  // ── Storage-backed connection state ───────────────────────────────────────

  // Re-renders the panel in place whenever the connected state changes.
  function applyConnectionState(connected) {
    panel.innerHTML = buildPanelHTML(!!connected);
  }

  // Read the stored value on load. The default object `{ [STORAGE_KEY]: false }`
  // ensures we always get a boolean even if the key has never been written.
  chrome.storage.local.get({ [STORAGE_KEY]: false }, function (result) {
    applyConnectionState(result[STORAGE_KEY]);
  });

  // Re-render live whenever the key changes — works from DevTools, popup,
  // or a future Supabase auth integration writing to storage.
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && STORAGE_KEY in changes) {
      applyConnectionState(changes[STORAGE_KEY].newValue);
    }
  });

  // Toggle button — just the SVG, no visible container
  const btn = document.createElement('button');
  btn.className = 'sh-btn';
  btn.setAttribute('aria-label', 'Open Streaming Helper');
  btn.setAttribute('aria-expanded', 'false');

  const btnImg = document.createElement('img');
  btnImg.src = PASSIVE_ICON_URL;
  btnImg.className = 'sh-btn-img';
  btnImg.alt = '';
  btnImg.setAttribute('aria-hidden', 'true');
  btn.appendChild(btnImg);

  wrapper.appendChild(btn);
  shadow.appendChild(wrapper);

  // ── 6. Interaction ─────────────────────────────────────────────────────────
  let isOpen = false;

  function openPanel() {
    isOpen = true;
    panel.classList.add('sh-visible');
    btn.classList.add('sh-open');
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', 'Close Streaming Helper');
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('sh-visible');
    btn.classList.remove('sh-open');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Open Streaming Helper');
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    isOpen ? closePanel() : openPanel();
  });

  document.addEventListener('click', function (e) {
    if (isOpen && !host.contains(e.target)) closePanel();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) closePanel();
  });

  // ── 7. Dynamic positioning ────────────────────────────────────────────────

  // Shared debounce timer — resize and navigation both funnel through here.
  let positionTimer = null;
  function schedulePositionUpdate(delayMs) {
    clearTimeout(positionTimer);
    positionTimer = setTimeout(positionHost, delayMs);
  }

  // Debounced resize: recalculate 150 ms after the user stops resizing.
  window.addEventListener('resize', function () {
    schedulePositionUpdate(150);
  });

  // SPA navigation: poll the URL every 800 ms. Handles pushState/replaceState
  // routers (Netflix, Prime, Disney+, etc.) without patching history methods.
  let lastHref = location.href;
  const navCheckInterval = setInterval(function () {
    if (location.href !== lastHref) {
      lastHref = location.href;
      // Wait 400 ms for the new page's nav to render before re-measuring.
      schedulePositionUpdate(400);
    }
  }, 800);

  // Also respond to the browser's back/forward buttons.
  window.addEventListener('popstate', function () {
    schedulePositionUpdate(400);
  });

  // Clean up the polling interval when the page is being navigated away.
  // `pagehide` is the safe MV3 alternative to `unload`, which is blocked by
  // Chrome's Permissions Policy in extension content scripts.
  window.addEventListener('pagehide', function () {
    clearInterval(navCheckInterval);
  });

  // ── 8. Initial positioning ────────────────────────────────────────────────
  // Run immediately for the best-available position, then retry after short
  // delays to catch navbars that are rendered after the initial page paint.
  positionHost();
  setTimeout(positionHost, 400);
  setTimeout(positionHost, 1500);
})();
