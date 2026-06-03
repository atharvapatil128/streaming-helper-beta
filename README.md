# Streaming Helper

Streaming Helper is a companion web app and Chrome extension that helps people decide what to watch by using friend recommendations and comfort rewatch titles.

The project started as an HCI/d capstone exploring streaming decision fatigue. Beta 1 focuses on a friend-powered recommendation layer and a lightweight Chrome extension that appears on supported streaming platforms.

## Beta 1 Features

* Create an account and manage a personal Streaming Helper profile
* Add friends and send/receive show or movie recommendations
* Browse recommendations by friend, platform, media type, and view mode
* Save comfort titles for low-effort rewatch decisions
* Use the Chrome extension on supported streaming platforms
* Open recommendation and comfort picks through platform search or TMDB fallback
* Manage notifications, privacy settings, account settings, and account deletion
* Lightweight onboarding for new users

## Chrome Extension

The Chrome extension injects a small helper interface into supported streaming sites. It can show friend recommendations, comfort picks, and open platform search pages for selected titles.

Supported platforms in Beta 1:

* Netflix
* Prime Video
* Disney+
* Hulu
* HBO Max / Max

The extension does not directly connect to streaming accounts, read watch history, or auto-play titles in Beta 1.

## Tech Stack

* React
* TypeScript
* Vite
* Tailwind CSS
* Supabase
* Vercel
* Chrome Extension Manifest V3

## Running the Web App Locally

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The local app usually runs at:

```bash
http://localhost:5173
```

## Extension Development

The Chrome extension lives in:

```bash
helper-extension/
```

To load it locally:

1. Open Chrome and go to `chrome://extensions`
2. Turn on Developer mode
3. Click “Load unpacked”
4. Select the `helper-extension` folder
5. Reload the extension after making changes

Make sure the companion app URL inside the extension points to the correct environment before testing or publishing.

## Privacy

Streaming Helper has a public Privacy Policy available in the web app at:

```bash
/privacy
```

Beta 1 does not directly connect to Netflix, Prime Video, Disney+, Hulu, HBO Max, or any streaming account. It does not read watch history or automatically play titles.

## Project Status

Current release: Beta 1

This is an early beta intended for testing the core product loop:

1. Add friends
2. Exchange recommendations
3. Save comfort titles
4. Use the extension while browsing streaming platforms

## Original Design Source

This project was initially generated from a Figma design bundle and has since been extended into a working web app and Chrome extension.

Original design file:

https://www.figma.com/design/4sse2ZvxHuOqTAltvygC9B/Streaming-Helper-Dashboard-Design

## Copyright

© 2026 Atharva Patil. All rights reserved.

Streaming Helper, including its source code, interface design, branding, copy, Chrome extension, and related assets, is owned by Atharva Patil. This repository is private and may not be copied, distributed, modified, or reused without permission.
