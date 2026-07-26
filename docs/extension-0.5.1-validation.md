# Streaming Helper Extension 0.5.1 Validation

## Release goal

Make the watch-page recommendation flow stable enough for Chrome Web Store
resubmission without weakening title-match safety.

## Changes

- Keep an open recommendation panel locked to its detected title while the
  streaming page changes controls, metadata, or other transient DOM content.
- Ignore media-type-only and formatting-only title changes instead of closing
  the panel and resetting selected friends.
- Reassert the heart icon when the normal helper host is remounted or briefly
  becomes visible during playback.
- Extend the title-loss grace period while the picker is open, while still
  exiting immediately when the page is definitively a detail/non-watch screen.
- Use trustworthy structured release-year metadata when it is available.
- Preserve standalone numeric titles such as `1917` during normalization.
- Return a bounded list of exact TMDB candidates when a title is genuinely
  ambiguous.
- Let the user choose the correct year/media type before selecting friends.
- Keep candidate and friend database identifiers private behind short-lived,
  opaque service-worker handles.

## Automated verification

- `npm.cmd run test:extension`
- `deno check supabase/functions/resolve-streaming-title/index.ts`
- `deno test supabase/functions/resolve-streaming-title/core_test.ts supabase/functions/resolve-streaming-title/service_test.ts`
- `node --check helper-extension/background.js`
- `node --check helper-extension/recommend.js`
- `node --check helper-extension/recommend-detection.js`
- `npm.cmd run build`
- `git diff --check`

## Production rollout order

1. Merge the reviewed branch.
2. Deploy only the `resolve-streaming-title` Edge Function.
3. Verify authenticated exact, ambiguous, unresolved, CORS, and rate-limit
   responses in production.
4. Load the packaged 0.5.1 extension locally and complete the manual test plan.
5. Upload the same verified ZIP to the Chrome Web Store.

The Edge Function change is backward compatible. Existing extension versions
continue to work for resolved titles. Extension 0.5.1 also understands the new
ambiguous-title response.

## Manual test plan

### Setup

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Remove or disable other local Streaming Helper copies.
4. Load the unpacked `helper-extension` folder from this branch.
5. Sign in and confirm the popup shows the connected profile.

### Netflix: stable send

1. Start a movie or episode.
2. Confirm only the heart icon is visible in the normal helper position.
3. Open the heart and select one friend.
4. Move the pointer, pause/play, show and hide player controls, and wait
   30 seconds.
5. Confirm the panel remains open, the selected friend remains selected, and
   the normal helper icon does not appear.
6. Send the recommendation once.
7. Confirm the panel remains open on the success state without requiring a
   second click.
8. Click Done and confirm the heart remains available.

### Ambiguous title

1. Play `72 HOURS`.
2. Open the heart.
3. If no trustworthy year is present in page metadata, confirm a short title
   chooser appears instead of the confidence error.
4. Choose the 2026 movie, select a friend, and send.
5. Confirm the sent recommendation uses the chosen title/year.
6. Reopen and use `Choose a different title` to confirm the choice is
   reversible before sending.

### Navigation and icon handoff

1. While the picker is open, leave playback for the title detail page.
2. Confirm the picker closes and the normal helper returns.
3. Resume playback.
4. Confirm the normal helper is replaced by the heart without overlap,
   flicker, or requiring hover.
5. Start another title and confirm the tooltip updates after the previous
   picker is closed.

### Prime Video

Repeat the stable-send and navigation tests on a Prime Video playback page.
Confirm a Prime detail page uses the normal helper and playback uses only the
heart.

### Other declared platforms

On Disney+, Hulu, and Max, verify:

- detail/browse pages show the normal helper;
- playback pages show the heart;
- opening, selecting, sending, success, Done, and outside-click dismissal are
  responsive and do not alternate between icons.

### Failure and recovery

1. Temporarily go offline after selecting a friend and click Send.
2. Confirm the panel stays open and offers a retry without losing the title.
3. Restore the connection and send successfully.
4. Reload the extension service worker while the page is open.
5. Confirm the stale-context recovery refreshes the panel rather than leaving
   it permanently loading.

## Release blockers

- Any normal-helper/heart overlap on a watch page.
- Picker closes or resets while controls appear/disappear.
- A send succeeds but the success state is not shown.
- Duplicate recommendations from one click.
- An ambiguous title is auto-selected without a year/type choice.
- Any identifier, access token, email, or internal database ID appears in the
  content-script response or page DOM.
