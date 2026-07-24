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
├── recommend.js     Content script — detects titles and renders the friend picker
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

1. Click the extension toolbar icon and sign in with a Streaming Helper email
   address or claimed username.
2. Confirm the connected view shows the profile display name and `@username`,
   never the account email.
3. Go to [netflix.com](https://www.netflix.com) and look for the floating helper.
4. Open it and verify friend recommendations and comfort picks load.
5. Open a movie or show. Confirm the supplied heart icon replaces the passive
   helper and its tooltip names the detected title.
6. Open the heart, confirm the resolved title, select one or more accepted
   friends, send, and verify the success/undo state.
7. Refresh the streaming page and verify neither surface remains in Loading.
8. Disconnect from the popup and confirm already-open streaming tabs switch to
   passive mode without a page reload.
9. Reconnect, reload the extension service worker, and confirm the session is
   restored or refreshed without another sign-in.

Repeat the streaming-page checks on Prime Video, Disney+, Hulu, and Max.

Authentication and Supabase requests run only in the background service worker.
The content script receives sanitized UI data and never receives access tokens,
refresh tokens, passwords, emails, or full Auth user objects. Companion links
always open [streaminghelper.net](https://streaminghelper.net/).

## Notes on the icons

The Chrome toolbar/management icons are packaged PNG files at 16, 48, and
128 pixels. The detected-title surface uses the separately supplied
`icons/recommend-active.png` asset.

## Shadow DOM isolation

The floating button and panel are injected inside a
[Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM)
attached to a host `<div id="sh-root">`. This means:

- The streaming site's CSS **cannot** affect the helper UI.
- The helper's CSS **cannot** leak into the streaming site.
- The helper's `z-index: 2147483647` ensures it always floats above the
  streaming player controls.
- The roots are closed to reduce casual page-script inspection. Shadow DOM is
  still style isolation rather than a complete confidentiality boundary.

## Backend prerequisites

The Beta 2 recommendation flow requires:

- the reviewed recommendation-security migration;
- the `extension-login` Edge Function with JWT verification disabled because
  the function itself verifies the password exchange;
- the `resolve-streaming-title` Edge Function with gateway JWT verification
  disabled because the handler validates the bearer token through Supabase Auth
  and must allow CORS preflight requests to reach the handler;
- a `TMDB_API_KEY` Edge Function secret;
- an `EXTENSION_ALLOWED_ORIGINS` secret containing the exact
  `chrome-extension://<extension-id>` origin from `chrome://extensions`;
- a random, server-only `EXTENSION_LOGIN_HASH_PEPPER` of at least 32 bytes.

Do not deploy these prerequisites or apply SQL until the reviewed production
change is explicitly approved.

## Roadmap (not in this branch)

- Hesitation detection — notice when the user is browsing without choosing.
- Notification badge on the extension icon for new recommendations.

## Copyright

© 2026 Atharva Patil. All rights reserved.

Streaming Helper’s Chrome extension code, interface, branding, and assets are owned by Atharva Patil and may not be copied, distributed, modified, or reused without permission.
