# Streaming Helper — Chrome Extension (Beta 2)

A Manifest V3 Chrome extension that injects a passive floating helper into
supported streaming pages and securely connects to a Streaming Helper account.
No build step is required — load the folder directly as an unpacked extension.

## Project structure

```
helper-extension/
├── manifest.json    Manifest V3 — declares the extension, content script sites
├── background.js    Service worker — owns authentication and Supabase requests
├── content.js       Content script — renders safe recommendation/comfort data
├── popup.html       Toolbar popup — sign-in and connection status
├── popup.js         Message-driven popup behavior (no direct token access)
├── popup.css        Popup styles
├── icons/
│   └── icon.svg     Extension icon (shown on chrome://extensions)
└── README.md        This file
```

## How to load the extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** on (top-right switch).
3. Click **Load unpacked**.
4. Select the `helper-extension` folder (the folder that contains `manifest.json`).
5. The "Streaming Helper" extension appears in the list with a green status dot.

The extension is now active. No build step, no `npm install`.

To reload after editing a file:

- On `chrome://extensions`, click the circular **refresh** ↺ icon on the
  Streaming Helper card.
- On the tab you're testing, hard-refresh the page (`Ctrl+Shift+R` /
  `Cmd+Shift+R`).

## How to test

1. Click the extension toolbar icon and sign in with a Streaming Helper account.
2. Confirm the connected view shows the profile display name and `@username`,
   never the account email.
3. Go to [netflix.com](https://www.netflix.com) and look for the floating helper.
4. Open it and verify friend recommendations and comfort picks load.
5. Disconnect from the popup and confirm already-open streaming tabs switch to
   passive mode without a page reload.
6. Reconnect, reload the extension service worker, and confirm the session is
   restored or refreshed without another sign-in.

Repeat the same test on Prime Video, Disney+, Hulu, and Max.

Repeat the streaming-page checks on Prime Video, Disney+, Hulu, and Max.

Authentication and Supabase requests run only in the background service worker.
The content script receives sanitized UI data and never receives access tokens,
refresh tokens, passwords, emails, or full Auth user objects. Companion links
always open [streaminghelper.net](https://streaminghelper.net/).

## Notes on the icon

Chrome accepts SVG files in the `icons` field of the manifest and displays them
on the `chrome://extensions` management page. The browser toolbar action icon
may show a generic grey puzzle piece on some Chrome versions (SVG support for
action icons varies). This is cosmetic only — the content script and popup work
regardless. Replace `icons/icon.svg` with `icon16.png`, `icon48.png`, and
`icon128.png` named in `manifest.json` if you want a fully rendered toolbar icon.

## Shadow DOM isolation

The floating button and panel are injected inside a
[Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM)
attached to a host `<div id="sh-root">`. This means:

- The streaming site's CSS **cannot** affect the helper UI.
- The helper's CSS **cannot** leak into the streaming site.
- The helper's `z-index: 2147483647` ensures it always floats above the
  streaming player controls.

## Roadmap (not in this branch)

- Send recommendations to username-based friends.
- Friend recipient selection in the extension.
- Improved title-opening behavior per streaming service.
- Hesitation detection — notice when the user is browsing without choosing.
- "Now Playing" detection — read the current title from the page DOM.
- Notification badge on the extension icon for new recommendations.

## Copyright

© 2026 Atharva Patil. All rights reserved.

Streaming Helper’s Chrome extension code, interface, branding, and assets are owned by Atharva Patil and may not be copied, distributed, modified, or reused without permission.
