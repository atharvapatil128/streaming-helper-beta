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

  // ── Supabase config ───────────────────────────────────────────────────────
  // Public anon key — safe to ship in the extension. It enforces Row Level
  // Security and cannot bypass database policies. Never use service_role here.
  const SUPABASE_URL      = 'https://htqwzovhfyyaaipoovjp.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0cXd6b3ZoZnl5YWFpcG9vdmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MjcwNjcsImV4cCI6MjA5NTUwMzA2N30.xutlxo4ZtEWkaE_KxCV8sOH6-bb1TwCShqx0h0lRFwk';

  // Session storage keys — written by popup.js on successful login.
  const SK_TOKEN = 'sh_access_token';
  const SK_UID   = 'sh_user_id';

  // Sentinel panelData rendered while Supabase requests are in-flight.
  const DATA_LOADING = {
    recs:    { status: 'loading' },
    comfort: { status: 'loading' },
  };

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

    /* ── Clickable connect rows (not-connected state only) ───────────────── */
    /* Applied instead of the default cursor:default when the user is not    */
    /* signed in, so the cards feel like an actionable CTA.                 */
    .sh-row--connect {
      cursor: pointer;
      transition:
        background     0.14s ease,
        border-color   0.14s ease,
        opacity        0.14s ease;
    }
    .sh-row--connect:hover {
      opacity: 1;
      background: #1e1e2a;
      border-color: #3a3a50;
    }
    .sh-row--connect:active {
      background: #232333;
    }

    /* ── Popup tip / fallback guide ──────────────────────────────────────── */
    /* Hidden by default; revealed when chrome.action.openPopup() fails or  */
    /* the API is unavailable. Instructs the user to click the toolbar icon. */
    .sh-popup-tip {
      display: none;
      margin-top: 9px;
      padding: 8px 10px;
      background: #16162a;
      border: 1px solid #38385e;
      border-radius: 8px;
      font-size: 11px;
      color: #9898c8;
      line-height: 1.5;
      text-align: center;
    }
    .sh-popup-tip--visible {
      display: block;
      animation: sh-tip-in 0.2s ease;
    }
    @keyframes sh-tip-in {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0);   }
    }

    /* ── Clickable connected row ─────────────────────────────────────────── */
    /* Applied to sh-row--active rows that should respond to clicks          */
    /* (e.g. Comfort Pick action card). Different from sh-row--connect which */
    /* is for the not-connected CTA cards.                                   */
    .sh-row--clickable {
      cursor: pointer;
      transition: background 0.14s ease, border-color 0.14s ease;
    }
    .sh-row--clickable:hover {
      background: #1e1e2a;
      border-color: #3a3a50;
    }
    .sh-row--clickable:active {
      background: #232333;
    }

    /* ── Comfort Pick result toast ───────────────────────────────────────── */
    /* Shown inline below the Comfort Pick card after a random pick.        */
    .sh-comfort-toast {
      display: none;
      margin-top: 6px;
      padding: 7px 10px;
      background: #141e14;
      border: 1px solid #1e3a1e;
      border-radius: 8px;
      font-size: 11px;
      color: #7ec87e;
      line-height: 1.45;
      text-align: center;
    }
    .sh-comfort-toast--visible {
      display: block;
      animation: sh-tip-in 0.2s ease;
    }

    /* ── Connected data sections ─────────────────────────────────────────── */
    /* Two sections stack vertically; the last one has no extra margin.      */
    .sh-data-section {
      margin-bottom: 11px;
    }
    .sh-data-section:last-of-type {
      margin-bottom: 0;
    }
    .sh-section-label {
      font-size: 10px;
      font-weight: 600;
      color: #5b5b6e;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 6px;
      padding: 0 1px;
    }

    /* ── State messages: loading / empty / error ─────────────────────────── */
    .sh-state-msg {
      font-size: 11px;
      line-height: 1.45;
      padding: 5px 2px;
    }
    .sh-state-loading { color: #5b5b6e; }
    .sh-state-empty   { color: #5b5b6e; }
    .sh-state-error   { color: #9e5b5b; }

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

  // ── XSS escape ────────────────────────────────────────────────────────────
  // All untrusted strings (titles, usernames, platform names from Supabase)
  // must pass through esc() before being inserted via innerHTML.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Renders a single-line state message inside a data section.
  function stateMsg(cls, text) {
    return `<div class="sh-state-msg ${cls}">${esc(text)}</div>`;
  }

  // ── 4. Panel HTML builder ─────────────────────────────────────────────────
  // buildPanelHTML(connected, panelData)
  //   connected  — boolean; determines which view to render
  //   panelData  — { recs, comfort } — only used when connected === true
  //
  // panelData shapes:
  //   recs:    { status: 'loading'|'error'|'empty'|'data', items: [...] }
  //   comfort: { status: 'loading'|'error'|'empty'|'data', item:  {...}|null }
  function buildPanelHTML(connected, panelData) {

    // Shared panel header — identical in both states.
    // Logo slot comment kept for future avatar swap once auth is deeper.
    const header = `
      <div class="sh-header">
        <div class="sh-logo">
          <img class="sh-logo-img" src="${APP_ICON_URL}" alt="" aria-hidden="true" />
        </div>
        <div class="sh-header-text">
          <div class="sh-title">Streaming Helper</div>
          <div class="sh-subtitle">${connected ? 'Connected' : 'Passive mode'}</div>
        </div>
        <a
          class="sh-open-app"
          href="https://streaming-helper-beta.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          title="Open Streaming Helper web app"
        >${SVG_EXTERNAL}</a>
      </div>
      <div class="sh-divider"></div>`;

    // ── Not-connected view ──────────────────────────────────────────────────
    if (!connected) {
      return `
        ${header}
        <p class="sh-hint">Open the companion app to connect recommendations and comfort picks.</p>
        <div class="sh-row sh-row--connect" data-sh-connect="true">
          <div class="sh-row-icon">${SVG_STAR}</div>
          <div class="sh-row-body">
            <div class="sh-row-label">Friend Recommendations</div>
            <div class="sh-row-desc">See what your friends suggest</div>
          </div>
          <span class="sh-badge">Connect</span>
        </div>
        <div class="sh-row sh-row--connect" data-sh-connect="true">
          <div class="sh-row-icon">${SVG_HEART}</div>
          <div class="sh-row-body">
            <div class="sh-row-label">Comfort Pick</div>
            <div class="sh-row-desc">Your go-to comfort rewatch</div>
          </div>
          <span class="sh-badge">Connect</span>
        </div>
        <div class="sh-popup-tip" role="status"></div>
        <div class="sh-footer">Streaming Helper</div>
      `;
    }

    // ── Connected view — real data sections ─────────────────────────────────
    const data = panelData || DATA_LOADING;

    // Friend Recommendations section body.
    let recsBody;
    const rd = data.recs;
    if (rd.status === 'loading') {
      recsBody = stateMsg('sh-state-loading', 'Loading…');
    } else if (rd.status === 'error') {
      recsBody = stateMsg('sh-state-error', "Couldn't load recommendations.");
    } else if (!rd.items || rd.items.length === 0) {
      recsBody = stateMsg('sh-state-empty', 'No friend recommendations yet.');
    } else {
      recsBody = rd.items.map(function (r) {
        const platform = r.platform
          ? `<span class="sh-badge">${esc(r.platform)}</span>`
          : '';
        const from = r.senderName
          ? `<div class="sh-row-desc">From ${esc(r.senderName)}</div>`
          : '';
        return `
          <div class="sh-row sh-row--active">
            <div class="sh-row-icon">${SVG_STAR}</div>
            <div class="sh-row-body">
              <div class="sh-row-label">${esc(r.title)}</div>
              ${from}
            </div>
            ${platform}
          </div>`;
      }).join('');
    }

    // Comfort Pick section body — always an action card, never a specific title.
    // Random selection happens on click (handleComfortPick), not at render time.
    let comfortBody;
    const cd = data.comfort;
    if (cd.status === 'loading') {
      comfortBody = stateMsg('sh-state-loading', 'Loading…');
    } else if (cd.status === 'error') {
      comfortBody = stateMsg('sh-state-error', "Couldn't load comfort picks.");
    } else if (cd.status === 'empty') {
      // No pinned titles — show the card in a disabled-ish state with "Add" badge.
      comfortBody = `
        <div class="sh-row sh-row--active">
          <div class="sh-row-icon">${SVG_HEART}</div>
          <div class="sh-row-body">
            <div class="sh-row-label">Comfort Pick</div>
            <div class="sh-row-desc">Add comfort titles in the companion app.</div>
          </div>
          <span class="sh-badge">Add</span>
        </div>`;
    } else {
      // Pinned titles exist — show a "Ready" action card.
      // data-sh-comfort-pick triggers handleComfortPick() on click.
      comfortBody = `
        <div class="sh-row sh-row--active sh-row--clickable" data-sh-comfort-pick="true">
          <div class="sh-row-icon">${SVG_HEART}</div>
          <div class="sh-row-body">
            <div class="sh-row-label">Comfort Pick</div>
            <div class="sh-row-desc">Let Helper choose something familiar.</div>
          </div>
          <span class="sh-badge sh-badge--ready">Ready</span>
        </div>
        <div class="sh-comfort-toast" role="status"></div>`;
    }

    return `
      ${header}
      <div class="sh-data-section">
        <div class="sh-section-label">Friend Recommendations</div>
        ${recsBody}
      </div>
      <div class="sh-data-section">
        <div class="sh-section-label">Comfort Pick</div>
        ${comfortBody}
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

  // Re-renders the panel whenever the connection state changes.
  // When connected, shows a loading skeleton immediately then fetches real data.
  function applyConnectionState(connected) {
    if (connected) {
      panel.innerHTML = buildPanelHTML(true, DATA_LOADING);
      fetchAndRenderPanelData();
    } else {
      panel.innerHTML = buildPanelHTML(false);
    }
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

  // ── Panel click delegation ────────────────────────────────────────────────
  // Single listener on the stable panel element — survives every innerHTML
  // re-render triggered by applyConnectionState().
  //
  //  [data-sh-connect]       — not-connected CTA cards → try to open popup
  //  [data-sh-comfort-pick]  — connected Comfort Pick action card → random pick
  panel.addEventListener('click', function (e) {
    if (e.target.closest('[data-sh-connect]')) {
      requestOpenPopup();
    } else if (e.target.closest('[data-sh-comfort-pick]')) {
      handleComfortPick();
    }
  });

  // Ask the background service worker to open the extension popup.
  // Falls back to an inline tip if the API is unavailable or the call fails.
  function requestOpenPopup() {
    try {
      chrome.runtime.sendMessage(
        { type: 'OPEN_EXTENSION_POPUP' },
        function (response) {
          if (chrome.runtime.lastError) {
            // Background may not be ready or the extension context is stale.
            showPopupTip();
            return;
          }
          if (!response || !response.success) {
            showPopupTip();
          }
          // On success, chrome.action.openPopup() opens the popup itself;
          // nothing more to do here.
        }
      );
    } catch (_) {
      // Defensive: chrome.runtime unavailable (e.g. extension reloaded).
      showPopupTip();
    }
  }

  // Reveal the inline tip that guides the user to the toolbar icon.
  // Safe to call multiple times — repeated calls are no-ops once visible.
  function showPopupTip() {
    const tip = panel.querySelector('.sh-popup-tip');
    if (!tip || tip.classList.contains('sh-popup-tip--visible')) return;
    tip.textContent =
      'Click the Streaming Helper icon in your browser toolbar to sign in.';
    tip.classList.add('sh-popup-tip--visible');
  }

  // Randomly pick one title from currentComfortItems and show it in the
  // inline comfort toast. Called when the user clicks the Comfort Pick card.
  function handleComfortPick() {
    const toast = panel.querySelector('.sh-comfort-toast');
    if (!toast) return;

    if (!currentComfortItems.length) {
      toast.textContent = 'Add comfort titles in the companion app.';
      toast.classList.add('sh-comfort-toast--visible');
      return;
    }

    const pick = currentComfortItems[
      Math.floor(Math.random() * currentComfortItems.length)
    ];

    // Show the picked title. Platform shown parenthetically if available.
    const label = pick.platform
      ? `${pick.title} — ${pick.platform}`
      : pick.title;

    toast.textContent = `Picked: ${label}`;
    toast.classList.add('sh-comfort-toast--visible');
  }

  // ── Supabase data fetch ────────────────────────────────────────────────────

  // Version counter — incremented every time a new fetch cycle starts.
  // Prevents a stale in-flight response from overwriting a fresher render.
  let panelFetchVersion = 0;

  // Cache of the user's pinned comfort titles, populated after each successful
  // fetch. Persists across panel re-renders so handleComfortPick() can access
  // the full list even after innerHTML is replaced.
  let currentComfortItems = [];

  // Clears the session flag so the onChanged listener re-renders the panel
  // to the not-connected state. Called when Supabase returns a 401.
  function handleExpiredSession() {
    chrome.storage.local.set({
      [STORAGE_KEY]: false,
      [SK_TOKEN]:    '',
      [SK_UID]:      '',
    });
    // The onChanged listener fires next and calls applyConnectionState(false).
  }

  // Minimal Supabase REST helper — throws 'UNAUTHORIZED' on 401, or a generic
  // HTTP error on other failures. Returns parsed JSON on success.
  async function supabaseFetch(path, params, headers) {
    const url = `${SUPABASE_URL}${path}?${new URLSearchParams(params)}`;
    const res = await fetch(url, { headers });
    if (res.status === 401) throw new Error('UNAUTHORIZED');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // Reads the stored session, fires both Supabase queries in parallel, then
  // updates the panel with real data (or appropriate error/empty states).
  async function fetchAndRenderPanelData() {
    const version = ++panelFetchVersion;

    // Wrap chrome.storage.local.get in a Promise for clean async/await use.
    const stored = await new Promise(function (resolve) {
      chrome.storage.local.get([SK_TOKEN, SK_UID], resolve);
    });

    const token  = stored[SK_TOKEN];
    const userId = stored[SK_UID];

    if (!token || !userId) {
      handleExpiredSession();
      return;
    }

    const authHeaders = {
      'apikey':        SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Accept':        'application/json',
    };

    // Fetch recommendations and comfort titles in parallel.
    // Promise.allSettled lets each section fail independently.
    const [recsResult, comfortResult] = await Promise.allSettled([
      supabaseFetch('/rest/v1/recommendations', {
        'to_user_id': `eq.${userId}`,
        'dismissed':  'eq.false',
        'order':      'created_at.desc',
        'limit':      '5',
        // `platforms` is the actual array column (not `platform`).
        // `source_name` is stored at insert time — no profile join needed.
        'select':     'id,title,platforms,source_name,media_type',
      }, authHeaders),
      supabaseFetch('/rest/v1/comfort_titles', {
        'user_id':   `eq.${userId}`,
        'is_pinned': 'eq.true',
        'order':     'created_at.desc',
        'limit':     '20', // fetch enough titles for random selection
        'select':    'id,title,platform,media_type',
      }, authHeaders),
    ]);

    // If either request returned 401 the access token is expired — sign out.
    if (
      recsResult.reason?.message    === 'UNAUTHORIZED' ||
      comfortResult.reason?.message === 'UNAUTHORIZED'
    ) {
      handleExpiredSession();
      return;
    }

    const recRows     = recsResult.status    === 'fulfilled' ? recsResult.value    : [];
    const comfortRows = comfortResult.status === 'fulfilled' ? comfortResult.value : null;

    // Persist the full comfort list so handleComfortPick() can pick randomly
    // without needing access to the local panelData closure below.
    currentComfortItems = (comfortRows || []).map(function (c) {
      return { title: c.title || '—', platform: c.platform || null };
    });

    const panelData = {
      recs: {
        status: recsResult.status === 'rejected' ? 'error'
              : recRows.length === 0             ? 'empty'
              : 'data',
        items: recRows.map(function (r) {
          // `platforms` is a Postgres array — take the first entry for the badge.
          const firstPlatform = Array.isArray(r.platforms) && r.platforms.length > 0
            ? r.platforms[0]
            : null;
          return {
            title:      r.title       || '—',
            platform:   firstPlatform,
            mediaType:  r.media_type,
            senderName: r.source_name || null,
          };
        }),
      },
      comfort: {
        // Items are cached in currentComfortItems; only the status is needed here.
        status: comfortResult.status === 'rejected'   ? 'error'
              : !comfortRows || !comfortRows.length   ? 'empty'
              : 'data',
      },
    };

    // Discard this result if a newer fetch cycle has already started.
    if (version !== panelFetchVersion) return;

    panel.innerHTML = buildPanelHTML(true, panelData);
  }

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
