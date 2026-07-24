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
 *                  hulu.com, max.com, hbomax.com
 */

(function () {
  'use strict';

  // Guard: don't inject twice.
  if (document.getElementById('sh-root')) return;

  // ── Icon URLs ─────────────────────────────────────────────────────────────
  const PASSIVE_ICON_URL = chrome.runtime.getURL('icons/helper-passive.svg');
  // Reserved for a future active/triggered state — not wired yet.
  // const ACTIVE_ICON_URL = chrome.runtime.getURL('icons/helper-active.svg');

  // Brand icon shown in the panel header. Uses helper-active.svg — the same
  // asset used for the Chrome toolbar icon. Swap for a user avatar/initials
  // element once auth state is deeper (future integration).
  const APP_ICON_URL = chrome.runtime.getURL('icons/helper-active.svg');

  // Authentication and Supabase requests are owned by the background service
  // worker. The content script receives only public auth state and safe rows;
  // it never reads or receives access/refresh tokens.
  const COMPANION_APP_URL = 'https://streaminghelper.net/';

  // Sentinel panelData rendered while Supabase requests are in-flight.
  const DATA_LOADING = {
    recs:    { status: 'loading' },
    comfort: { status: 'loading' },
  };
  const MESSAGE_TIMEOUT_MS = 10 * 1000;
  const titleDestinations = globalThis.StreamingHelperTitleDestinations;

  // ── Platform detection ────────────────────────────────────────────────────
  // Maps hostname substrings to a platform key.
  const PLATFORM_ID = (function () {
    const h = window.location.hostname;
    if (h.includes('netflix'))      return 'netflix';
    if (h.includes('primevideo'))   return 'primevideo';
    if (h.includes('disneyplus'))   return 'disneyplus';
    if (h.includes('hulu'))         return 'hulu';
    if (h === 'max.com'    || h.endsWith('.max.com')    ||
        h === 'hbomax.com' || h.endsWith('.hbomax.com'))  return 'max';
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

    host.style.setProperty('top', top + 'px', 'important');
    host.style.setProperty('right', RIGHT_OFFSET + 'px', 'important');

    // Adapt button (and its wrapper) size to viewport width.
    const size = getButtonSize();
    host.style.setProperty('--sh-helper-size', size + 'px');
    wrapper.style.width  = size + 'px';
    wrapper.style.height = size + 'px';
    btn.style.width      = size + 'px';
    btn.style.height     = size + 'px';
    document.dispatchEvent(new CustomEvent('sh:helper-positioned'));
  }

  // ── 1. Host element ───────────────────────────────────────────────────────
  const host = document.createElement('div');
  host.id = 'sh-root';
  host.style.setProperty('position', 'fixed', 'important');
  host.style.setProperty('top', '96px', 'important');
  host.style.setProperty('right', '24px', 'important');
  host.style.setProperty('z-index', '2147483647', 'important');
  host.style.setProperty('pointer-events', 'none', 'important');
  document.body.appendChild(host);

  // Streaming apps replace large DOM subtrees during SPA navigation. Remount
  // the same closed-shadow host if a page transition removes it.
  function ensureHostMounted() {
    if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
  }
  const hostMountObserver = new MutationObserver(ensureHostMounted);
  hostMountObserver.observe(document.documentElement, { childList: true, subtree: true });

  const shadow = host.attachShadow({ mode: 'closed' });

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
      width: 292px;
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
    .sh-panel:not(.sh-visible) {
      visibility: hidden;
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
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      line-height: 0;
    }
    .sh-logo-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .sh-header-text {
      flex: 1;
      min-width: 0;
    }
    .sh-title {
      font-size: 14px;
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
      line-height: 1.4;
      margin-bottom: 8px;
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
      margin: 0 0 9px 0;
    }

    /* ── Feature rows ────────────────────────────────────────────────────── */
    /* Slightly dimmed to communicate inactive/not-connected state.         */
    .sh-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 10px;
      background: #1a1a22;
      border: 1px solid #1f1f28;
      border-radius: 10px;
      margin-bottom: 0;
      opacity: 0.78;
      cursor: default;
      width: 100%;
      color: inherit;
      font: inherit;
      text-align: left;
    }
    /* Adds a gap above the second action card (Comfort Pick). */
    .sh-row--second {
      margin-top: 6px;
    }
    .sh-row-icon {
      width: 28px;
      height: 28px;
      border-radius: 7px;
      background: #2a2a35;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .sh-row-icon svg {
      width: 13px;
      height: 13px;
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
      font-size: 13px;
      font-weight: 500;
      color: #c4c4cf;
      line-height: 1.25;
    }
    .sh-row-desc {
      font-size: 11px;
      color: #5b5b6e;
      margin-top: 2px;
      line-height: 1.35;
    }
    /* Badge base — shared by both states */
    .sh-badge {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 2px 5px;
      border-radius: 4px;
      flex-shrink: 0;
      align-self: flex-start;
      margin-top: 3px;
      white-space: nowrap;
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
    .sh-comfort-line {
      margin-bottom: 7px;
    }
    /* Explicit "Open <Title>" action — direct CTA for the choose-for-me flow. */
    .sh-comfort-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .sh-comfort-open {
      width: 100%;
      padding: 7px 10px;
      background: #5b5bd6;
      color: #fff;
      border: none;
      border-radius: 7px;
      font-size: 11px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: background 0.14s ease;
    }
    .sh-comfort-open:hover { background: #7c7ce8; }
    .sh-comfort-open--secondary {
      background: #1e2a1e;
      color: #a8d8a8;
      border: 1px solid #315031;
    }
    .sh-comfort-open--secondary:hover { background: #263826; }
    .sh-comfort-open:disabled {
      opacity: 1;
      cursor: default;
    }
    .sh-comfort-disclosure {
      margin-top: 2px;
      font-size: 9px;
      color: #6b7a6b;
    }
    .sh-comfort-status {
      margin-top: 2px;
      font-size: 11px;
      color: #b8cbb8;
    }
    .sh-comfort-note {
      font-size: 10px;
      color: #6b7a6b;
    }

    /* ── Recs empty-state inline message ─────────────────────────────────── */
    /* Shown below the Friend Recommendations action card when the user       */
    /* clicks it but has no pending recommendations.                         */
    .sh-recs-toast {
      display: none;
      margin-top: 6px;
      padding: 7px 10px;
      background: #1a1a22;
      border: 1px solid #2a2a38;
      border-radius: 8px;
      font-size: 11px;
      color: #8b8b9e;
      line-height: 1.45;
      text-align: center;
    }
    .sh-recs-toast--visible {
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

    /* ── Recs section: label row + browse button ────────────────────────── */
    .sh-section-label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .sh-section-label-row .sh-section-label {
      margin-bottom: 0;
    }
    .sh-browse-btn {
      font-size: 10px;
      font-weight: 500;
      color: #5b5bd6;
      background: none;
      border: none;
      cursor: pointer;
      padding: 0 1px;
      font-family: inherit;
      letter-spacing: 0.01em;
      transition: color 0.14s ease;
    }
    .sh-browse-btn:hover { color: #9090e8; }

    /* ── Footer ──────────────────────────────────────────────────────────── */
    .sh-footer {
      margin-top: 8px;
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

  // ── Safe title-opening helpers ──────────────────────────────────────────────
  // Exact streaming deep-links are unreliable, so we open a platform SEARCH page
  // for the title (most robust), falling back to the TMDB info page.

  // Opens a URL in a new tab with the safest rel flags. No-op on falsy input.
  function titleActionsFor(item) {
    return titleDestinations?.titleActions(item, PLATFORM_ID) || [];
  }

  // Builds a platform search URL for a title. Platform names are matched
  // case-insensitively and tolerate the common stored variants. Returns null
  // for unknown platforms or missing data.
  // URL construction moved to title-destinations.js and the trusted worker.

  // Builds a TMDB page URL from a tmdb id + media type. Returns null unless both
  // are present and the media type is recognised (movie vs tv/series).
  // Actions remain explicit and never navigate until the user activates one.

  // Returns the single safest open URL for a title item (platform search first,
  // TMDB fallback). Used by the one-click Comfort Pick flow.
  //   item: { title, platform|platforms[], tmdbId, mediaType }
  // Returns { url, platform, source } — url is null when nothing can be built.

  // ── 4. Panel HTML builder ─────────────────────────────────────────────────
  // buildPanelHTML(connected, panelData)
  //   connected  — boolean; determines which view to render
  //   panelData  — { recs, comfort } — only used when connected === true
  //
  // panelData shapes:
  //   recs:    { status: 'loading'|'error'|'empty'|'data', items: [...] }
  //   comfort: { status: 'loading'|'error'|'empty'|'data', item:  {...}|null }
  function buildPanelHTML(connected, panelData, connectionIssue, checkingConnection) {

    // Shared panel header — identical in both states.
    // Logo slot comment kept for future avatar swap once auth is deeper.
    const header = `
      <div class="sh-header">
        <div class="sh-logo">
          <img class="sh-logo-img" src="${APP_ICON_URL}" alt="" aria-hidden="true" />
        </div>
        <div class="sh-header-text">
          <div class="sh-title">Streaming Helper</div>
          <div class="sh-subtitle">${connected ? 'Connected' : connectionIssue ? 'Connection unavailable' : checkingConnection ? 'Checking connection' : 'Passive mode'}</div>
        </div>
        <a
          class="sh-open-app"
          href="${COMPANION_APP_URL}"
          target="_blank"
          rel="noopener noreferrer"
          title="Open Streaming Helper web app"
        >${SVG_EXTERNAL}</a>
      </div>
      <div class="sh-divider"></div>`;

    // ── Not-connected view ──────────────────────────────────────────────────
    if (!connected) {
      if (checkingConnection) {
        return `
          ${header}
          <p class="sh-hint">Checking whether Streaming Helper is connected.</p>
          ${stateMsg('sh-state-loading', 'Checking connection…')}
          <div class="sh-footer">Streaming Helper</div>
        `;
      }
      if (connectionIssue) {
        return `
          ${header}
          <p class="sh-hint">We couldn’t verify your connection. Open the extension to try again.</p>
          <button type="button" class="sh-row sh-row--connect" data-sh-retry="true">
            <div class="sh-row-icon">${SVG_STAR}</div>
            <div class="sh-row-body">
              <div class="sh-row-label">Connection unavailable</div>
              <div class="sh-row-desc">Your saved session was not removed.</div>
            </div>
            <span class="sh-badge">Retry</span>
          </button>
          <div class="sh-popup-tip" role="status"></div>
          <div class="sh-footer">Streaming Helper</div>
        `;
      }
      return `
        ${header}
        <p class="sh-hint">Connect your companion app to use recommendations and comfort picks.</p>
        <button type="button" class="sh-row sh-row--connect" data-sh-connect="true">
          <div class="sh-row-icon">${SVG_STAR}</div>
          <div class="sh-row-body">
            <div class="sh-row-label">Friend Recommendations</div>
            <div class="sh-row-desc">See friend picks.</div>
          </div>
          <span class="sh-badge">Connect</span>
        </button>
        <button type="button" class="sh-row sh-row--second sh-row--connect" data-sh-connect="true">
          <div class="sh-row-icon">${SVG_HEART}</div>
          <div class="sh-row-body">
            <div class="sh-row-label">Comfort Pick</div>
            <div class="sh-row-desc">Choose a familiar title.</div>
          </div>
          <span class="sh-badge">Connect</span>
        </button>
        <div class="sh-popup-tip" role="status"></div>
        <div class="sh-footer">Streaming Helper</div>
      `;
    }

    // ── Connected view — real data sections ─────────────────────────────────
    const data = panelData || DATA_LOADING;

    // Friend Recommendations: single action card that opens the full overlay.
    // Individual titles are no longer listed in the panel — the overlay handles that.
    let recsBody;
    const rd = data.recs;
    if (rd.status === 'loading') {
      recsBody = stateMsg('sh-state-loading', 'Loading…');
    } else if (rd.status === 'error') {
      recsBody = stateMsg('sh-state-error', "Couldn't load recommendations.");
    } else {
      const hasRecs = rd.status === 'data' && rd.items && rd.items.length > 0;
      if (hasRecs) {
        // Ready: clickable, opens the full overlay.
        recsBody = `
          <button type="button" class="sh-row sh-row--active sh-row--clickable" data-sh-open-recs="true">
            <div class="sh-row-icon">${SVG_STAR}</div>
            <div class="sh-row-body">
              <div class="sh-row-label">Friend Recommendations</div>
              <div class="sh-row-desc">See what your friends recommend.</div>
            </div>
            <span class="sh-badge sh-badge--ready">Ready</span>
          </button>`;
      } else {
        // Empty: still clickable so the user gets inline feedback on tap.
        // The overlay will NOT open; openRecsOverlay() shows the toast below.
        recsBody = `
          <button type="button" class="sh-row sh-row--active sh-row--clickable" data-sh-open-recs="true">
            <div class="sh-row-icon">${SVG_STAR}</div>
            <div class="sh-row-body">
              <div class="sh-row-label">Friend Recommendations</div>
              <div class="sh-row-desc">No friend picks yet.</div>
            </div>
            <span class="sh-badge">Empty</span>
          </button>
          <div class="sh-recs-toast" role="status"></div>`;
      }
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
        <div class="sh-row sh-row--active sh-row--second">
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
        <button type="button" class="sh-row sh-row--active sh-row--clickable sh-row--second" data-sh-comfort-pick="true">
          <div class="sh-row-icon">${SVG_HEART}</div>
          <div class="sh-row-body">
            <div class="sh-row-label">Comfort Pick</div>
            <div class="sh-row-desc">Let Helper choose something familiar.</div>
          </div>
          <span class="sh-badge sh-badge--ready">Ready</span>
        </button>
        <div class="sh-comfort-toast" role="status"></div>`;
    }

    return `
      ${header}
      ${recsBody}
      ${comfortBody}
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
  panel.setAttribute('aria-hidden', 'true');
  panel.inert = true;
  // Start with the not-connected state as the default; storage read below
  // will update it immediately if a different value has been stored.
  panel.innerHTML = buildPanelHTML(false);
  wrapper.appendChild(panel);

  // ── Background-validated connection state ─────────────────────────────────

  // These are declared before the initial request below. The previous ordering
  // invoked fetchAndRenderPanelData() while panelFetchVersion was still in its
  // temporal dead zone, leaving the panel in permanent loading after refresh.
  let panelFetchVersion = 0;
  let panelLoadState = 'loading';
  let currentComfortItems = [];
  let currentRecItems = [];

  async function sendBackgroundMessage(message) {
    let timer;
    try {
      return await Promise.race([
        chrome.runtime.sendMessage(message),
        new Promise(function (_, reject) {
          timer = setTimeout(function () {
            reject(new Error('MESSAGE_TIMEOUT'));
          }, MESSAGE_TIMEOUT_MS);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function openTitleAction(item, action, button, status, onSuccess) {
    if (!button || button.disabled) return;
    const actionGroup = status.parentElement;
    if (actionGroup?.dataset.opening === 'true') return;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    if (actionGroup) {
      actionGroup.dataset.opening = 'true';
      actionGroup.querySelectorAll('button').forEach(function (candidate) {
        candidate.disabled = true;
      });
    }
    button.textContent = 'Opening...';
    status.textContent = '';
    status.setAttribute('role', 'status');
    try {
      const response = await sendBackgroundMessage({
        type: 'OPEN_TITLE_DESTINATION',
        destination: action.destination,
        title: item.title,
        tmdbId: action.destination === 'tmdb' ? item.tmdbId ?? null : null,
        mediaType: action.destination === 'tmdb' ? item.mediaType ?? null : null,
      });
      if (!response?.success) throw new Error(response?.error || 'TAB_OPEN_FAILED');
      status.textContent = 'Opened in a new tab.';
      if (typeof onSuccess === 'function') onSuccess();
    } catch (_) {
      status.setAttribute('role', 'alert');
      status.textContent = "Couldn't open a new tab. Try again.";
      if (actionGroup) {
        delete actionGroup.dataset.opening;
        actionGroup.querySelectorAll('button').forEach(function (candidate) {
          candidate.disabled = false;
        });
      } else {
        button.disabled = false;
      }
      button.removeAttribute('aria-busy');
      button.textContent = originalLabel;
    }
  }

  function appendTitleActions(container, item, options) {
    const actions = titleActionsFor(item);
    const status = document.createElement('div');
    status.className = options.statusClass;
    status.setAttribute('aria-live', 'polite');

    if (!actions.length) {
      const note = document.createElement('div');
      note.className = options.noteClass;
      note.textContent = 'No link available for this title yet.';
      container.appendChild(note);
      return status;
    }

    actions.forEach(function (action, index) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `${options.buttonClass}${index === 0 && action.kind === 'search'
        ? ` ${options.primaryClass}`
        : ''}`;
      button.textContent = action.label;
      button.addEventListener('click', function () {
        openTitleAction(item, action, button, status, options.onSuccess);
      });
      container.appendChild(button);
    });

    const disclosure = document.createElement('div');
    disclosure.className = options.disclosureClass;
    disclosure.textContent =
      'Opens a search or title details in a new tab. No playback starts automatically.';
    container.appendChild(disclosure);
    container.appendChild(status);
    return status;
  }

  // Re-renders whenever the service worker publishes validated auth state.
  // When connected, shows a loading skeleton immediately then requests safe
  // panel rows from the background broker.
  function applyAuthState(state) {
    if (state?.status === 'connected') {
      panelLoadState = 'loading';
      panel.innerHTML = buildPanelHTML(true, DATA_LOADING);
      fetchAndRenderPanelData().catch(function () {
        panelLoadState = 'error';
        panel.innerHTML = buildPanelHTML(false, null, true);
      });
    } else if (state?.status === 'offline' || state?.status === 'service_error') {
      panelLoadState = 'error';
      panel.innerHTML = buildPanelHTML(false, null, true);
    } else {
      panelLoadState = 'signed_out';
      panel.innerHTML = buildPanelHTML(false);
    }
  }

  chrome.runtime.onMessage.addListener(function (message) {
    if (message?.type === 'AUTH_STATE_CHANGED') applyAuthState(message.state);
  });

  panel.innerHTML = buildPanelHTML(false, null, false, true);
  fetchAndRenderPanelData().catch(function () {
    panelLoadState = 'error';
    panel.innerHTML = buildPanelHTML(false, null, true);
  });

  // ── Panel click delegation ────────────────────────────────────────────────
  // Single listener on the stable panel element — survives every innerHTML
  // re-render triggered by applyAuthState().
  //
  //  [data-sh-connect]       — not-connected CTA cards → try to open popup
  //  [data-sh-retry]         — retry a transient panel-data failure in place
  //  [data-sh-comfort-pick]  — connected Comfort Pick action card → random pick
  panel.addEventListener('click', function (e) {
    if (e.target.closest('[data-sh-retry]')) {
      panel.innerHTML = buildPanelHTML(false, null, false, true);
      panelLoadState = 'loading';
      fetchAndRenderPanelData().catch(function () {
        applyAuthState({ status: 'service_error' });
      });
    } else if (e.target.closest('[data-sh-connect]')) {
      requestOpenPopup();
    } else if (e.target.closest('[data-sh-comfort-pick]')) {
      handleComfortPick();
    } else if (e.target.closest('[data-sh-open-recs]')) {
      clearComfortPick();
      openRecsOverlay();
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

  // Randomly pick one title from currentComfortItems and show it in the inline
  // comfort toast, with a single explicit "Open <Title>" action. One-click
  // "choose for me" — but never auto-opens; the user must click Open.
  let lastComfortPickIndex = -1;

  function clearComfortPick() {
    const toast = panel.querySelector('.sh-comfort-toast');
    if (!toast) return;
    toast.textContent = '';
    toast.classList.remove('sh-comfort-toast--visible');
  }

  function handleComfortPick() {
    const toast = panel.querySelector('.sh-comfort-toast');
    if (!toast) return;

    toast.textContent = '';
    toast.classList.add('sh-comfort-toast--visible');

    if (!currentComfortItems.length) {
      toast.textContent = 'Add comfort titles in the companion app.';
      return;
    }

    let pickIndex = Math.floor(Math.random() * currentComfortItems.length);
    if (currentComfortItems.length > 1 && pickIndex === lastComfortPickIndex) {
      pickIndex = (pickIndex + 1) % currentComfortItems.length;
    }
    lastComfortPickIndex = pickIndex;
    const pick = currentComfortItems[pickIndex];

    const line = document.createElement('div');
    line.className = 'sh-comfort-line';
    line.textContent = `Picked: ${pick.title}`;
    toast.appendChild(line);

    const actions = document.createElement('div');
    actions.className = 'sh-comfort-actions';
    appendTitleActions(actions, pick, {
      buttonClass: 'sh-comfort-open',
      primaryClass: '',
      noteClass: 'sh-comfort-note',
      disclosureClass: 'sh-comfort-disclosure',
      statusClass: 'sh-comfort-status',
      onSuccess: closePanel,
    });
    const another = document.createElement('button');
    another.type = 'button';
    another.className = 'sh-comfort-open sh-comfort-open--secondary';
    another.textContent = 'Pick another';
    another.addEventListener('click', handleComfortPick);
    actions.appendChild(another);
    toast.appendChild(actions);
  }

  // ── Friend Recommendations overlay ────────────────────────────────────────
  // Full-screen cinematic overlay that opens when the user clicks "Browse ›"
  // in the connected panel. Reuses currentRecItems — no second fetch needed.

  const OVERLAY_CSS = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    .sho-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(10, 10, 16, 0.93);
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
                   'Helvetica Neue', Arial, sans-serif;
      animation: sho-in 0.18s ease;
    }
    @keyframes sho-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .sho-content {
      flex: 0 1 auto;
      display: flex;
      flex-direction: column;
      max-width: 1200px;
      width: 100%;
      max-height: 90vh;
      min-height: 480px;
      padding: 36px 48px 32px;
      min-width: 0;
    }

    /* ── Top bar ── */
    .sho-topbar {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 36px;
      flex-shrink: 0;
    }
    .sho-close {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.10);
      color: #c4c4cf;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.14s ease, color 0.14s ease;
    }
    .sho-close:hover { background: rgba(255, 255, 255, 0.12); color: #e4e4e7; }
    .sho-close svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .sho-heading {
      font-size: 20px;
      font-weight: 600;
      color: #e4e4e7;
      letter-spacing: -0.01em;
    }

    /* ── Cards area ── */
    .sho-cards {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      align-content: center;
      flex-wrap: wrap;
      gap: 20px;
      overflow-y: auto;
      padding: 8px 0;
      min-height: 0;
    }
    .sho-card {
      flex: 1 1 155px;
      max-width: 195px;
      min-width: 130px;
      background: #14141e;
      border: 1.5px solid #1f1f2e;
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
      outline: none;
      transition: transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
    }
    .sho-card:hover {
      transform: translateY(-4px);
      border-color: #5b5bd6;
    }
    .sho-card:focus-visible {
      border-color: #5b5bd6;
      box-shadow: 0 0 0 3px rgba(91, 91, 214, 0.30);
    }
    .sho-card--selected {
      border-color: #5b5bd6;
      box-shadow: 0 0 0 2px rgba(91, 91, 214, 0.35);
      transform: translateY(-4px);
    }

    /* Poster — 2:3 aspect ratio */
    .sho-card-thumb {
      width: 100%;
      aspect-ratio: 2 / 3;
      background: linear-gradient(145deg, #1a1a2e 0%, #0f0f1e 100%);
      position: relative;
      overflow: hidden;
    }
    .sho-card-thumb img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 1;
    }
    /* Fallback title text sits behind the image; visible when image is absent
       or fails to load (onerror hides the img element, exposing this layer). */
    .sho-card-fallback-text {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
      text-align: center;
      font-size: 12px;
      font-weight: 500;
      color: #6b6b9e;
      line-height: 1.4;
      z-index: 0;
    }

    .sho-card-info { padding: 10px 11px 12px; }
    .sho-card-title {
      font-size: 12px;
      font-weight: 600;
      color: #e4e4e7;
      line-height: 1.35;
      margin-bottom: 4px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .sho-card-from {
      font-size: 11px;
      color: #8b8b9e;
      margin-bottom: 7px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sho-platform-badge {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
      background: #1e1e2e;
      color: #7b7b9e;
      border: 1px solid #2a2a3e;
    }

    /* ── Bottom bar ── */
    .sho-bottombar {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      padding-top: 16px;
      position: relative;
    }
    .sho-pick-btn {
      padding: 10px 28px;
      background: #5b5bd6;
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      letter-spacing: 0.01em;
      transition: background 0.15s ease, transform 0.10s ease;
    }
    .sho-pick-btn:hover  { background: #7c7ce8; }
    .sho-pick-btn:active { transform: scale(0.97); }
    .sho-all-recs {
      position: absolute;
      right: 0;
      font-size: 12px;
      color: #5b5b6e;
      text-decoration: none;
      white-space: nowrap;
      transition: color 0.14s ease;
    }
    .sho-all-recs:hover { color: #8b8b9e; }

    /* ── Pick / select action area ── */
    .sho-action {
      margin-top: 12px;
      min-height: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .sho-action-msg {
      text-align: center;
      font-size: 13px;
      font-weight: 500;
      color: #5b5bd6;
    }
    .sho-action-btns {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .sho-action-btn {
      padding: 8px 16px;
      background: #1e1e2e;
      color: #c4c4cf;
      border: 1px solid #2a2a3e;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
    }
    .sho-action-btn:hover {
      background: #26263a;
      color: #e4e4e7;
      border-color: #3a3a50;
    }
    .sho-action-btn:disabled {
      opacity: 1;
      cursor: default;
    }
    .sho-action-btn--primary {
      background: #5b5bd6;
      color: #fff;
      border-color: #5b5bd6;
    }
    .sho-action-btn--primary:hover {
      background: #7c7ce8;
      border-color: #7c7ce8;
      color: #fff;
    }
    .sho-action-note {
      font-size: 12px;
      color: #8b8b9e;
    }
    .sho-action-disclosure {
      flex-basis: 100%;
      text-align: center;
      font-size: 10px;
      color: #6b6b7e;
    }
    .sho-action-status {
      flex-basis: 100%;
      text-align: center;
      font-size: 12px;
      color: #b8b8c8;
    }
    .sho-close:focus-visible,
    .sho-pick-btn:focus-visible,
    .sho-action-btn:focus-visible,
    .sho-all-recs:focus-visible {
      outline: 2px solid #9a9ae8;
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      .sho-backdrop,
      .sho-card {
        animation: none;
        transition: none;
      }
      .sho-card:hover,
      .sho-card--selected {
        transform: none;
      }
    }

    @media (max-width: 600px) {
      .sho-content { padding: 20px 16px 20px; }
      .sho-topbar  { margin-bottom: 24px; }
      .sho-heading { font-size: 16px; }
      .sho-all-recs { position: static; margin-top: 10px; }
      .sho-bottombar { flex-direction: column; gap: 8px; }
    }
  `;

  // Builds the inner HTML for the overlay from the cached rec items.
  function buildOverlayHTML(items) {
    const cardsHTML = items.map(function (item, index) {
      const imgHTML = item.thumbnail
        ? `<img src="${esc(item.thumbnail)}" alt="" onerror="this.style.display='none'" />`
        : '';
      const fromHTML = item.senderName
        ? `<div class="sho-card-from">From ${esc(item.senderName)}</div>`
        : '';
      const platformHTML = (Array.isArray(item.platforms) ? item.platforms : [])
        .slice(0, 5)
        .map(function (platform) {
          return `<span class="sho-platform-badge">${esc(platform)}</span>`;
        })
        .join(' ');
      return `
        <button type="button" class="sho-card" data-rec-index="${index}"
                aria-label="${esc(item.title)}">
          <div class="sho-card-thumb">
            ${imgHTML}
            <div class="sho-card-fallback-text">${esc(item.title)}</div>
          </div>
          <div class="sho-card-info">
            <div class="sho-card-title">${esc(item.title)}</div>
            ${fromHTML}
            ${platformHTML}
          </div>
        </button>`;
    }).join('');

    return `
      <div class="sho-backdrop" role="dialog" aria-modal="true" aria-labelledby="sho-heading">
        <div class="sho-content">
          <div class="sho-topbar">
            <button class="sho-close" aria-label="Close">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <h2 id="sho-heading" class="sho-heading">Recommended by your Friends</h2>
          </div>
          <div class="sho-cards">${cardsHTML}</div>
          <div class="sho-bottombar">
            <button class="sho-pick-btn">Pick for Me</button>
            <a class="sho-all-recs" href="${esc(COMPANION_APP_URL)}"
               target="_blank" rel="noopener noreferrer">All recommendations ↗</a>
          </div>
          <div class="sho-action" role="status">
            <div class="sho-action-msg"></div>
            <div class="sho-action-btns"></div>
          </div>
        </div>
      </div>`;
  }

  // Tracks the current overlay host element; null when the overlay is closed.
  let overlayHost = null;

  // Opens the full-screen overlay. Closes the small panel first.
  // If there are no rec items, shows a brief inline hint in the panel instead.
  function openRecsOverlay() {
    if (overlayHost) return;

    if (!currentRecItems || !currentRecItems.length) {
      // Surface an inline hint rather than silently doing nothing.
      const toast = panel.querySelector('.sh-recs-toast');
      if (toast && !toast.classList.contains('sh-recs-toast--visible')) {
        toast.textContent = 'No friend recommendations yet.';
        toast.classList.add('sh-recs-toast--visible');
      }
      return;
    }

    closePanel();

    overlayHost = document.createElement('div');
    overlayHost.id = 'sh-overlay-root';
    overlayHost.style.cssText = [
      'position: fixed',
      'inset: 0',
      'z-index: 2147483647',
      'pointer-events: auto',
    ].join(';');
    document.body.appendChild(overlayHost);

    const overlayShadow = overlayHost.attachShadow({ mode: 'closed' });

    const overlayStyleEl = document.createElement('style');
    overlayStyleEl.textContent = OVERLAY_CSS;
    overlayShadow.appendChild(overlayStyleEl);

    const overlayContainer = document.createElement('div');
    overlayContainer.innerHTML = buildOverlayHTML(currentRecItems);
    overlayShadow.appendChild(overlayContainer);

    // Close button
    overlayShadow.querySelector('.sho-close')
      .addEventListener('click', closeRecsOverlay);

    // Clicking directly on the dark backdrop (outside the content box) closes.
    overlayShadow.querySelector('.sho-backdrop')
      .addEventListener('click', function (e) {
        if (e.target === this) closeRecsOverlay();
      });
    overlayShadow.querySelector('.sho-backdrop')
      .addEventListener('keydown', function (event) {
        if (event.key !== 'Tab') return;
        const focusable = Array.from(overlayShadow.querySelectorAll(
          'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'
        ));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && overlayShadow.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && overlayShadow.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });

    // "Pick for Me" button
    overlayShadow.querySelector('.sho-pick-btn')
      .addEventListener('click', function () {
        handleOverlayPickForMe(overlayShadow);
      });

    // Individual card clicks
    overlayShadow.querySelectorAll('.sho-card').forEach(function (card) {
      card.addEventListener('click', function () {
        handleCardSelect(overlayShadow, card);
      });
    });
    setTimeout(function () {
      overlayShadow.querySelector('.sho-close')?.focus();
    }, 0);
  }

  // Removes the overlay element from the DOM and resets the reference.
  function closeRecsOverlay(options) {
    if (!overlayHost) return;
    overlayHost.remove();
    overlayHost = null;
    if (options?.focusTrigger !== false) btn.focus();
  }

  // Randomly selects one rec, highlights its card, and shows the action area.
  function handleOverlayPickForMe(shadow) {
    if (!currentRecItems.length) return;
    const pickIdx = Math.floor(Math.random() * currentRecItems.length);
    const pick = currentRecItems[pickIdx];

    shadow.querySelectorAll('.sho-card').forEach(function (c) {
      c.classList.remove('sho-card--selected');
    });
    const pickCard = shadow.querySelector(`.sho-card[data-rec-index="${pickIdx}"]`);
    if (pickCard) pickCard.classList.add('sho-card--selected');

    renderOverlaySelection(shadow, pick, 'Picked');
  }

  // Highlights the clicked card and shows the action area with "Selected: …".
  function handleCardSelect(shadow, card) {
    shadow.querySelectorAll('.sho-card').forEach(function (c) {
      c.classList.remove('sho-card--selected');
    });
    card.classList.add('sho-card--selected');

    const index = parseInt(card.getAttribute('data-rec-index'), 10);
    const item = isNaN(index) ? null : currentRecItems[index];
    if (!item) return;

    renderOverlaySelection(shadow, item, 'Selected');
  }

  // Renders the bottom action area: "<verb>: <title>" plus explicit open
  // buttons. Never auto-opens — the user must click a button. Shows both an
  // "Open on <Platform>" button (platform search) and a "View on TMDB" button
  // when available; if neither can be built, shows an inline note.
  function renderOverlaySelection(shadow, item, verb) {
    const msg  = shadow.querySelector('.sho-action-msg');
    const btns = shadow.querySelector('.sho-action-btns');
    if (!msg || !btns) return;

    msg.textContent = `${verb}: ${item.title}`;
    btns.textContent = '';

    appendTitleActions(btns, item, {
      buttonClass: 'sho-action-btn',
      primaryClass: 'sho-action-btn--primary',
      noteClass: 'sho-action-note',
      disclosureClass: 'sho-action-disclosure',
      statusClass: 'sho-action-status',
      onSuccess: closeRecsOverlay,
    });
  }

  // ── Supabase data fetch ────────────────────────────────────────────────────

  // Requests safe recommendation and comfort-title rows from the background
  // broker, then maps them into presentation data. Tokens never cross the
  // service-worker/content-script boundary.
  async function fetchAndRenderPanelData() {
    const version = ++panelFetchVersion;
    panelLoadState = 'loading';
    let response;
    try {
      response = await sendBackgroundMessage({ type: 'FETCH_PANEL_DATA' });
    } catch (_) {
      response = { success: false, error: 'NETWORK_ERROR' };
    }

    if (version !== panelFetchVersion) return;

    if (!response?.success && ['AUTH_REQUIRED', 'SIGNED_OUT'].includes(response?.error)) {
      panelLoadState = 'signed_out';
      applyAuthState({ status: 'signed_out' });
      return;
    }
    if (!response?.success &&
        ['OFFLINE', 'SERVICE_ERROR', 'NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMITED',
          'STORAGE_UNAVAILABLE']
          .includes(response?.error)) {
      panelLoadState = 'error';
      applyAuthState({ status: response.error === 'OFFLINE' ? 'offline' : 'service_error' });
      return;
    }

    const recRows = response?.success && Array.isArray(response.data?.recommendations)
      ? response.data.recommendations
      : [];
    const comfortRows = response?.success && Array.isArray(response.data?.comfortTitles)
      ? response.data.comfortTitles
      : null;

    // Persist the full comfort list so handleComfortPick() can pick randomly
    // without needing access to the local panelData closure below.
    currentComfortItems = (comfortRows || []).map(function (c) {
      return {
        title:     c.title || '—',
        platform:  c.platform || null,
        mediaType: c.media_type || null,
        tmdbId:    c.tmdb_id || null,
      };
    });

    // Map rec rows once; both the panel and the overlay share this array.
    const mappedRecItems = recRows.map(function (r) {
      return {
        title:      r.title         || '—',
        platforms:  Array.isArray(r.platforms) ? r.platforms.slice(0, 10) : [],
        mediaType:  r.media_type,
        senderName: r.source_name   || null,
        thumbnail:  r.thumbnail_url || null,
        tmdbId:     r.tmdb_id       || null,
      };
    });
    // Cache for the overlay — persists across panel re-renders.
    currentRecItems = mappedRecItems;

    const panelData = {
      recs: {
        status: !response?.success ? 'error'
              : recRows.length === 0 ? 'empty'
              : 'data',
        items: mappedRecItems,
      },
      comfort: {
        // Items are cached in currentComfortItems; only the status is needed here.
        status: !response?.success ? 'error'
              : !comfortRows || !comfortRows.length ? 'empty'
              : 'data',
      },
    };

    // Discard this result if a newer fetch cycle has already started.
    if (version !== panelFetchVersion) return;

    panelLoadState = 'ready';
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
    panel.setAttribute('aria-hidden', 'false');
    panel.inert = false;
    btn.classList.add('sh-open');
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', 'Close Streaming Helper');
    if (panelLoadState === 'error') {
      panel.innerHTML = buildPanelHTML(false, null, false, true);
      fetchAndRenderPanelData().catch(function () {
        applyAuthState({ status: 'service_error' });
      });
    }
    const firstFocusable = panel.querySelector('button, a[href], input, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) setTimeout(function () { firstFocusable.focus(); }, 0);
  }

  function closePanel(options) {
    clearComfortPick();
    isOpen = false;
    panel.classList.remove('sh-visible');
    panel.setAttribute('aria-hidden', 'true');
    panel.inert = true;
    btn.classList.remove('sh-open');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Open Streaming Helper');
    if (options?.focusTrigger !== false) btn.focus();
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    isOpen ? closePanel() : openPanel();
  });

  document.addEventListener('click', function (e) {
    if (isOpen && !host.contains(e.target)) closePanel();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (overlayHost) closeRecsOverlay();
      else if (isOpen) closePanel();
    }
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
  window.addEventListener('pagehide', function (event) {
    if (event.persisted) return;
    clearInterval(navCheckInterval);
    hostMountObserver.disconnect();
    clearTimeout(positionTimer);
  });

  document.addEventListener('sh:watch-mode-enter', function () {
    if (overlayHost) closeRecsOverlay({ focusTrigger: false });
    if (isOpen) closePanel({ focusTrigger: false });
  });

  // ── 8. Initial positioning ────────────────────────────────────────────────
  // Run immediately for the best-available position, then retry after short
  // delays to catch navbars that are rendered after the initial page paint.
  positionHost();
  setTimeout(positionHost, 400);
  setTimeout(positionHost, 1500);
})();
