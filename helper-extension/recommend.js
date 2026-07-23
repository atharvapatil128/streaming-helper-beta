/**
 * Streaming Helper — detected-title recommendation flow (Beta 2).
 *
 * This content script owns only the compact recommendation surface. Authentication,
 * title resolution, friend IDs, recommendation IDs, and writes remain in the
 * background service worker. The page sees opaque handles and safe display text.
 */
(function () {
  'use strict';

  if (document.getElementById('sh-recommend-root')) return;

  const ACTIVE_ICON_URL = chrome.runtime.getURL('icons/recommend-active.png');
  const APP_URL = 'https://streaminghelper.net/';
  const MAX_FRIENDS = 20;

  const PLATFORM_CONFIG = {
    netflix: {
      host: /(^|\.)netflix\.com$/,
      paths: [/^\/watch\/\d+/i, /^\/title\/\d+/i],
      selectors: [
        '.video-title h4',
        '[data-uia="video-title"] h4',
        '.video-title',
        '[data-uia="video-title"]',
        '[data-uia="previewModal--player-titleTreatment-logo"]',
        'h1',
      ],
    },
    primevideo: {
      host: /(^|\.)primevideo\.com$/,
      paths: [/\/detail\//i, /\/gp\/video\/detail\//i],
      selectors: ['[data-testid="detail-title"]', 'h1', '[class*="atf-title"]'],
    },
    disneyplus: {
      host: /(^|\.)disneyplus\.com$/,
      paths: [/\/video\//i, /\/movies\//i, /\/series\//i, /\/play\//i],
      selectors: ['h1', '[data-testid="details-title"]', '[class*="title"] h1'],
    },
    hulu: {
      host: /(^|\.)hulu\.com$/,
      paths: [/\/watch\//i, /\/movie\//i, /\/series\//i],
      selectors: ['h1', '[data-testid="details-title"]', '[class*="Title"]'],
    },
    max: {
      host: /(^|\.)max\.com$|(^|\.)hbomax\.com$/,
      paths: [/\/video\/watch\//i, /\/movies\//i, /\/shows\//i, /\/watch\//i],
      selectors: ['h1', '[data-testid="content-title"]', '[class*="Title"] h1'],
    },
  };

  const GENERIC_TITLES = new Set([
    'netflix',
    'prime video',
    'amazon prime video',
    'disney+',
    'hulu',
    'max',
    'hbo max',
    'watch',
    'home',
  ]);

  function currentPlatform() {
    const host = location.hostname.toLowerCase();
    return Object.entries(PLATFORM_CONFIG).find(([, value]) => value.host.test(host)) || null;
  }

  function isLikelyTitlePath(config) {
    return config.paths.some(function (pattern) { return pattern.test(location.pathname); });
  }

  function cleanTitle(raw) {
    if (typeof raw !== 'string') return null;
    let value = raw.replace(/\s+/g, ' ').trim();
    value = value
      .replace(/^\s*(watch|stream)\s+/i, '')
      .replace(/\s*[-–—|]\s*(netflix|prime video|amazon prime video|disney\+|hulu|max|hbo max)\s*$/i, '')
      .replace(/\s*\|\s*official site\s*$/i, '')
      .trim();
    if (!value || value.length > 160 || GENERIC_TITLES.has(value.toLowerCase())) return null;
    return value;
  }

  function selectorTitle(config) {
    for (const selector of config.selectors) {
      let nodes = [];
      try { nodes = document.querySelectorAll(selector); } catch (_) { continue; }
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        const value = cleanTitle(node.textContent);
        if (value) return value;
      }
    }
    return null;
  }

  function metadataTitle() {
    const candidates = [
      document.querySelector('meta[property="og:title"]')?.content,
      document.querySelector('meta[name="twitter:title"]')?.content,
      document.title,
    ];
    for (const candidate of candidates) {
      const value = cleanTitle(candidate);
      if (value) return value;
    }
    return null;
  }

  function mediaTypeHint(platform, title) {
    const path = location.pathname.toLowerCase();
    if (path.includes('/series/') || /\b(s\d+\s*e\d+|season|episode)\b/i.test(title)) {
      return 'series';
    }
    if (path.includes('/movie') || path.includes('/movies/')) return 'movie';
    if (platform === 'netflix' && document.querySelector('[data-uia*="episode"]')) return 'series';
    return null;
  }

  function detectTitle() {
    const match = currentPlatform();
    if (!match) return null;
    const [platform, config] = match;
    if (!isLikelyTitlePath(config)) return null;
    const title = selectorTitle(config) || metadataTitle();
    if (!title) return null;
    return { title, platform, mediaTypeHint: mediaTypeHint(platform, title) };
  }

  function sendMessage(message) {
    return chrome.runtime.sendMessage(message);
  }

  const host = document.createElement('div');
  host.id = 'sh-recommend-root';
  host.style.setProperty('position', 'fixed', 'important');
  host.style.setProperty('top', '72px', 'important');
  host.style.setProperty('right', '24px', 'important');
  host.style.setProperty('z-index', '2147483647', 'important');
  host.style.setProperty('display', 'none', 'important');
  host.style.setProperty(
    'font-family',
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
    'important',
  );
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; }
    .root { position: relative; color: #f7f4ff; }
    .trigger {
      width: 52px; height: 52px; padding: 0; border: 0; border-radius: 50%;
      background: transparent; cursor: pointer; display: grid; place-items: center;
      filter: drop-shadow(0 6px 18px rgba(0,0,0,.55));
      transition: transform .16s ease, filter .16s ease;
    }
    .trigger:hover, .trigger:focus-visible {
      transform: scale(1.06);
      filter: drop-shadow(0 8px 22px rgba(123,92,240,.48));
    }
    .trigger:focus-visible { outline: 3px solid #ffffff; outline-offset: 3px; }
    .trigger img { width: 52px; height: 52px; display: block; }
    .tooltip {
      position: absolute; right: 62px; top: 7px; width: max-content; max-width: 280px;
      padding: 10px 12px; border-radius: 8px; color: #202027; background: #ffffff;
      font-size: 12px; line-height: 1.35; box-shadow: 0 8px 24px rgba(0,0,0,.32);
      opacity: 0; visibility: hidden; transform: translateX(4px);
      transition: opacity .14s ease, transform .14s ease, visibility .14s;
      pointer-events: none;
    }
    .tooltip::after {
      content: ""; position: absolute; right: -7px; top: 13px;
      border-width: 7px 0 7px 8px; border-style: solid;
      border-color: transparent transparent transparent #ffffff;
    }
    .trigger:hover + .tooltip, .trigger:focus-visible + .tooltip {
      opacity: 1; visibility: visible; transform: translateX(0);
    }
    .dialog {
      position: absolute; right: 0; top: 62px; width: 248px; max-height: min(420px, calc(100vh - 150px));
      overflow: hidden; border: 1px solid #3a3150; border-radius: 14px;
      background: #17131f; box-shadow: 0 18px 50px rgba(0,0,0,.68);
    }
    .dialog[hidden] { display: none; }
    .panel { display: flex; flex-direction: column; min-height: 120px; max-height: inherit; }
    .header { padding: 13px 14px 10px; border-bottom: 1px solid #332944; }
    .eyebrow { margin: 0 0 4px; color: #a997c7; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .title { margin: 0; color: #f7f4ff; font-size: 14px; font-weight: 650; line-height: 1.35; overflow-wrap: anywhere; }
    .meta { margin: 4px 0 0; color: #a99fba; font-size: 11px; }
    .body { padding: 10px; overflow: auto; }
    .status { min-height: 88px; padding: 18px 10px; display: grid; place-items: center; text-align: center; color: #c9bfd9; font-size: 12px; line-height: 1.45; }
    .spinner {
      width: 20px; height: 20px; margin: 0 auto 9px; border: 2px solid #3b314d;
      border-top-color: #9d7cff; border-radius: 50%; animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .friend-list { display: flex; flex-direction: column; gap: 4px; }
    .friend {
      display: flex; align-items: center; gap: 9px; min-height: 44px; padding: 7px 8px;
      border-radius: 8px; color: #eee8f8; background: #241c31; cursor: pointer;
    }
    .friend:hover { background: #302342; }
    .friend:focus-within { outline: 2px solid #a98aff; outline-offset: 1px; }
    .friend input { width: 17px; height: 17px; margin: 0; accent-color: #9d7cff; flex: 0 0 auto; }
    .friend-copy { min-width: 0; flex: 1; }
    .friend-name { display: block; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .friend-user { display: block; color: #9f94b1; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .footer { display: grid; gap: 7px; padding: 10px; border-top: 1px solid #332944; }
    .button {
      min-height: 44px; border: 0; border-radius: 9px; padding: 9px 12px;
      font: inherit; font-size: 12px; font-weight: 650; cursor: pointer;
    }
    .button:focus-visible { outline: 3px solid #ffffff; outline-offset: 2px; }
    .button.primary { color: #ffffff; background: linear-gradient(135deg,#6f83ef,#a45bf2); }
    .button.primary:disabled { color: #888094; background: #34303b; cursor: not-allowed; }
    .button.secondary { color: #d7cde5; background: #2b2633; }
    .button.link { color: #b9a9d2; background: transparent; font-weight: 500; }
    .notice { margin: 0; color: #ffb8c4; font-size: 11px; line-height: 1.4; text-align: center; }
    .success { padding: 18px 14px; text-align: center; }
    .success-title { margin: 0 0 6px; color: #ffffff; font-size: 13px; font-weight: 650; }
    .success-copy { margin: 0; color: #c9bfd9; font-size: 11px; line-height: 1.45; }
    .live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
    @media (max-width: 600px) {
      .dialog { width: min(248px, calc(100vw - 32px)); }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
    }
  `;
  shadow.appendChild(style);

  const root = document.createElement('div');
  root.className = 'root';
  const trigger = document.createElement('button');
  trigger.className = 'trigger';
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  const icon = document.createElement('img');
  icon.src = ACTIVE_ICON_URL;
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');
  trigger.appendChild(icon);
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.setAttribute('role', 'tooltip');
  const dialog = document.createElement('section');
  dialog.className = 'dialog';
  dialog.hidden = true;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'false');
  dialog.setAttribute('aria-label', 'Recommend this title');
  const live = document.createElement('div');
  live.className = 'live';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  root.append(trigger, tooltip, dialog, live);
  shadow.appendChild(root);

  let detected = null;
  let context = null;
  let contextVersion = 0;
  let isOpen = false;
  let hiddenHelper = null;
  let previousHelperDisplay = '';
  let selectedHandles = new Set();

  function helperHost() { return document.getElementById('sh-root'); }

  function setHelperVisibility(showRecommendation) {
    const helper = helperHost();
    if (showRecommendation) {
      if (!helper) return;
      if (hiddenHelper && hiddenHelper !== helper) {
        hiddenHelper.style.display = previousHelperDisplay;
      }
      if (hiddenHelper !== helper) {
        hiddenHelper = helper;
        previousHelperDisplay = helper.style.display;
      }
      helper.style.display = 'none';
    } else if (hiddenHelper) {
      hiddenHelper.style.display = previousHelperDisplay;
      hiddenHelper = null;
      previousHelperDisplay = '';
    } else if (helper) {
      // Nothing was hidden by this script, so preserve the helper's own state.
      return;
    }
  }

  function announce(message) {
    live.textContent = '';
    setTimeout(function () { live.textContent = message; }, 10);
  }

  function setHostDisplay(value) {
    host.style.setProperty('display', value, 'important');
  }

  function closePicker(options) {
    isOpen = false;
    contextVersion += 1;
    dialog.hidden = true;
    dialog.textContent = '';
    trigger.setAttribute('aria-expanded', 'false');
    if (options?.focusTrigger) trigger.focus();
  }

  function setDetected(next) {
    const unchanged = detected && next &&
      detected.title === next.title && detected.platform === next.platform &&
      detected.mediaTypeHint === next.mediaTypeHint;
    if (unchanged) {
      // The main helper may have mounted after title detection.
      setHelperVisibility(true);
      return;
    }
    closePicker();
    context = null;
    selectedHandles = new Set();
    detected = next;
    if (!next) {
      setHostDisplay('none');
      setHelperVisibility(false);
      return;
    }
    setHostDisplay('block');
    setHelperVisibility(true);
    const label = `Recommend ${next.title} to your friends`;
    trigger.setAttribute('aria-label', label);
    tooltip.textContent = label;
  }

  function header(title, meta) {
    const wrapper = document.createElement('div');
    wrapper.className = 'header';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'Recommend';
    const heading = document.createElement('h2');
    heading.className = 'title';
    heading.textContent = title;
    wrapper.append(eyebrow, heading);
    if (meta) {
      const detail = document.createElement('p');
      detail.className = 'meta';
      detail.textContent = meta;
      wrapper.appendChild(detail);
    }
    return wrapper;
  }

  function statusView(message, action) {
    dialog.textContent = '';
    const panel = document.createElement('div');
    panel.className = 'panel';
    if (detected) panel.appendChild(header(detected.title, null));
    const body = document.createElement('div');
    body.className = 'status';
    const content = document.createElement('div');
    const copy = document.createElement('p');
    copy.textContent = message;
    content.appendChild(copy);
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button secondary';
      button.style.marginTop = '12px';
      button.textContent = action.label;
      button.addEventListener('click', action.run);
      content.appendChild(button);
    }
    body.appendChild(content);
    panel.appendChild(body);
    dialog.appendChild(panel);
  }

  function loadingView() {
    dialog.textContent = '';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.appendChild(header(detected?.title || 'Current title', null));
    const body = document.createElement('div');
    body.className = 'status';
    const content = document.createElement('div');
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const text = document.createElement('p');
    text.textContent = 'Confirming the title and loading your friends…';
    content.append(spinner, text);
    body.appendChild(content);
    panel.appendChild(body);
    dialog.appendChild(panel);
  }

  function openApp() {
    window.open(APP_URL, '_blank', 'noopener,noreferrer');
  }

  async function openSignIn() {
    try {
      const response = await sendMessage({ type: 'OPEN_EXTENSION_POPUP' });
      if (response?.success) {
        closePicker();
        return;
      }
    } catch (_) {
      // Fall through to the official web sign-in when popup opening is unavailable.
    }
    openApp();
  }

  function contextError(response) {
    if (response?.error === 'SIGNED_OUT') {
      return {
        message: 'Sign in to Streaming Helper before recommending this title.',
        action: { label: 'Open sign in', run: openSignIn },
      };
    }
    if (response?.error === 'TITLE_NOT_FOUND') {
      return {
        message: 'We could not confidently match this title yet.',
        action: { label: 'Try again', run: loadContext },
      };
    }
    if (response?.error === 'RATE_LIMITED') {
      return { message: 'Too many attempts. Please wait a few minutes and try again.' };
    }
    return {
      message: 'The recommendation helper is temporarily unavailable.',
      action: { label: 'Try again', run: loadContext },
    };
  }

  async function loadContext() {
    if (!detected || !isOpen) return;
    const version = ++contextVersion;
    loadingView();
    let response;
    try {
      response = await sendMessage({
        type: 'FETCH_RECOMMENDATION_CONTEXT',
        detectedTitle: detected.title,
        platform: detected.platform,
        mediaTypeHint: detected.mediaTypeHint,
      });
    } catch (_) {
      response = { success: false, error: 'NETWORK_ERROR' };
    }
    if (version !== contextVersion || !isOpen) return;
    if (!response?.success) {
      const failure = contextError(response);
      statusView(failure.message, failure.action);
      announce(failure.message);
      return;
    }
    const data = response.data || {};
    if (!data.title?.handle || !Array.isArray(data.friends)) {
      statusView('The recommendation helper returned an invalid response.', {
        label: 'Try again',
        run: loadContext,
      });
      return;
    }
    context = data;
    selectedHandles = new Set();
    renderPicker();
  }

  function friendLabel(friend) {
    const display = typeof friend.displayName === 'string' ? friend.displayName.trim() : '';
    const username = typeof friend.username === 'string' ? friend.username.replace(/^@/, '').trim() : '';
    return {
      name: display || (username ? `@${username}` : 'Streaming Helper friend'),
      username: display && username ? `@${username}` : '',
    };
  }

  function updateSendButton(button) {
    const count = selectedHandles.size;
    button.disabled = count === 0;
    button.textContent = count === 0
      ? 'Select a friend'
      : count === 1 ? 'Send recommendation' : `Send to ${count} friends`;
  }

  function renderPicker(notice) {
    dialog.textContent = '';
    const panel = document.createElement('div');
    panel.className = 'panel';
    const resolved = context.title;
    const meta = [resolved.year, resolved.mediaType === 'series' ? 'Series' : 'Movie']
      .filter(Boolean).join(' · ');
    panel.appendChild(header(resolved.title || detected.title, meta));

    if (context.friends.length === 0) {
      const body = document.createElement('div');
      body.className = 'status';
      body.textContent = 'Add an accepted friend before sending recommendations.';
      const footer = document.createElement('div');
      footer.className = 'footer';
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'button secondary';
      add.textContent = 'Add friends';
      add.addEventListener('click', openApp);
      footer.appendChild(add);
      panel.append(body, footer);
      dialog.appendChild(panel);
      return;
    }

    const body = document.createElement('div');
    body.className = 'body';
    const list = document.createElement('div');
    list.className = 'friend-list';
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', 'Choose friends');
    const send = document.createElement('button');

    context.friends.slice(0, MAX_FRIENDS).forEach(function (friend, index) {
      if (!friend?.handle) return;
      const label = document.createElement('label');
      label.className = 'friend';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = friend.handle;
      checkbox.checked = selectedHandles.has(friend.handle);
      const names = friendLabel(friend);
      checkbox.setAttribute('aria-label', `Recommend to ${names.name}`);
      checkbox.addEventListener('change', function () {
        if (checkbox.checked) selectedHandles.add(friend.handle);
        else selectedHandles.delete(friend.handle);
        updateSendButton(send);
      });
      const copy = document.createElement('span');
      copy.className = 'friend-copy';
      const name = document.createElement('span');
      name.className = 'friend-name';
      name.textContent = names.name;
      copy.appendChild(name);
      if (names.username) {
        const username = document.createElement('span');
        username.className = 'friend-user';
        username.textContent = names.username;
        copy.appendChild(username);
      }
      label.append(checkbox, copy);
      list.appendChild(label);
      if (index === 0) setTimeout(function () { checkbox.focus(); }, 0);
    });
    body.appendChild(list);
    panel.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'footer';
    if (notice) {
      const error = document.createElement('p');
      error.className = 'notice';
      error.setAttribute('role', 'alert');
      error.textContent = notice;
      footer.appendChild(error);
    }
    send.type = 'button';
    send.className = 'button primary';
    updateSendButton(send);
    send.addEventListener('click', function () { submitRecommendation(send); });
    const helper = document.createElement('button');
    helper.type = 'button';
    helper.className = 'button link';
    helper.textContent = 'Open Streaming Helper';
    helper.addEventListener('click', openApp);
    footer.append(send, helper);
    panel.appendChild(footer);
    dialog.appendChild(panel);
  }

  function recipientSummary(results) {
    const names = (results || [])
      .map(function (item) { return item.displayName; })
      .filter(function (name) { return typeof name === 'string' && name.trim(); });
    if (names.length === 0) return 'your selected friends';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names[0]}, ${names[1]}, and ${names.length - 2} more`;
  }

  async function submitRecommendation(button) {
    if (!context?.title?.handle || selectedHandles.size === 0) return;
    button.disabled = true;
    button.textContent = 'Sending…';
    let response;
    try {
      response = await sendMessage({
        type: 'SEND_TITLE_RECOMMENDATION',
        titleHandle: context.title.handle,
        recipientHandles: Array.from(selectedHandles),
      });
    } catch (_) {
      response = { success: false, error: 'NETWORK_ERROR' };
    }
    if (!isOpen) return;
    if (!response?.success) {
      if (response?.error === 'STALE_CONTEXT') {
        context = null;
        statusView('The extension restarted. Refreshing your friend list…');
        setTimeout(loadContext, 350);
        return;
      }
      if (response?.error === 'FRIENDSHIP_CHANGED') {
        context = null;
        statusView('Your friend list changed. Refreshing before you send…');
        setTimeout(loadContext, 350);
        return;
      }
      renderPicker(
        response?.error === 'SIGNED_OUT'
          ? 'Your session ended. Sign in again to continue.'
          : 'Could not send the recommendation. Please try again.',
      );
      return;
    }
    renderSuccess(response);
  }

  function renderSuccess(response) {
    dialog.textContent = '';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.appendChild(header(context?.title?.title || detected.title, null));
    const success = document.createElement('div');
    success.className = 'success';
    const title = document.createElement('p');
    title.className = 'success-title';
    title.textContent = `Recommended to ${recipientSummary(response.results)}`;
    const copy = document.createElement('p');
    copy.className = 'success-copy';
    const already = (response.results || []).filter(function (item) {
      return item.status === 'ALREADY_ACTIVE';
    }).length;
    copy.textContent = already
      ? `${already} selected friend${already === 1 ? '' : 's'} already had this recommendation.`
      : 'The recommendation was added to their list.';
    success.append(title, copy);
    panel.appendChild(success);
    const footer = document.createElement('div');
    footer.className = 'footer';
    if (response.undoHandle) {
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'button secondary';
      undo.textContent = 'Undo';
      undo.addEventListener('click', function () { undoRecommendation(response.undoHandle); });
      footer.appendChild(undo);
    }
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'button primary';
    done.textContent = 'Done';
    done.addEventListener('click', function () { closePicker({ focusTrigger: true }); });
    footer.appendChild(done);
    panel.appendChild(footer);
    dialog.appendChild(panel);
    announce(title.textContent);
    setTimeout(function () { (footer.querySelector('button') || done).focus(); }, 0);
  }

  async function undoRecommendation(undoHandle) {
    statusView('Undoing the recommendation…');
    let response;
    try {
      response = await sendMessage({ type: 'UNDO_TITLE_RECOMMENDATION', undoHandle });
    } catch (_) {
      response = { success: false, error: 'NETWORK_ERROR' };
    }
    if (!isOpen) return;
    if (!response?.success) {
      statusView('This recommendation could not be undone here.', {
        label: 'Done',
        run: function () { closePicker({ focusTrigger: true }); },
      });
      return;
    }
    statusView('Recommendation undone.', {
      label: 'Done',
      run: function () { closePicker({ focusTrigger: true }); },
    });
    announce('Recommendation undone');
  }

  trigger.addEventListener('click', function (event) {
    event.stopPropagation();
    if (!detected) return;
    if (isOpen) {
      closePicker({ focusTrigger: true });
      return;
    }
    isOpen = true;
    dialog.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    loadContext();
  });

  document.addEventListener('click', function (event) {
    if (!isOpen) return;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (!path.includes(host)) closePicker();
  }, true);

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      closePicker({ focusTrigger: true });
    }
  }, true);

  let detectionTimer = null;
  function scheduleDetection(delay) {
    clearTimeout(detectionTimer);
    detectionTimer = setTimeout(function () { setDetected(detectTitle()); }, delay);
  }

  const observer = new MutationObserver(function () {
    if (!host.isConnected) document.documentElement.appendChild(host);
    scheduleDetection(450);
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  let lastHref = location.href;
  const navigationTimer = setInterval(function () {
    if (location.href === lastHref) return;
    lastHref = location.href;
    setDetected(null);
    scheduleDetection(650);
  }, 750);

  window.addEventListener('popstate', function () {
    setDetected(null);
    scheduleDetection(650);
  });
  window.addEventListener('pagehide', function () {
    observer.disconnect();
    clearInterval(navigationTimer);
    clearTimeout(detectionTimer);
  });

  scheduleDetection(250);
  setTimeout(function () { scheduleDetection(0); }, 1200);
})();
