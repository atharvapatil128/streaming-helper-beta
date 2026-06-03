# Streaming Helper — Chrome Extension (Beta 1 MVP)

A Manifest V3 Chrome extension that injects a passive floating helper into
supported streaming pages. No build step required — load the folder directly
as an unpacked extension.

## Project structure

```
helper-extension/
├── manifest.json    Manifest V3 — declares the extension, content script sites
├── content.js       Content script — injects the shadow-DOM floating button
├── popup.html       Toolbar popup — shown when clicking the extension icon
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

## How to test on Netflix

1. Go to [netflix.com](https://www.netflix.com) and sign in.
2. Look for the **purple circular button** in the bottom-right corner.
3. Click it — the helper panel slides up above the button.
4. The panel shows three "Coming soon" rows:
   - Friend Recommendations
   - Comfort Pick
   - Now Playing
5. Click the button again (or press **Escape**, or click anywhere outside) to
   close the panel.

Repeat the same test on Prime Video, Disney+, Hulu, and Max.

The extension icon in the Chrome toolbar opens a small popup showing which
sites are supported and a green "Extension active" status indicator.

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

## Roadmap (not in this MVP)

- Connect to Supabase — surface real recommendations from friends.
- Comfort Pick — show the user's pinned comfort title.
- Hesitation detection — notice when the user is browsing without choosing.
- "Now Playing" detection — read the current title from the page DOM.
- Notification badge on the extension icon for new recommendations.

## Copyright

© 2026 Atharva Patil. All rights reserved.

Streaming Helper’s Chrome extension code, interface, branding, and assets are owned by Atharva Patil and may not be copied, distributed, modified, or reused without permission.