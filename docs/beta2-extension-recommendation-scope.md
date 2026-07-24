# Beta 2 Extension Recommendation Flow

## 1. User problem

The extension currently accepts only an email address, can remain stuck in a
loading state after a streaming-page refresh, and cannot recommend the title
the user is currently viewing.

## 2. Feature goal

Give signed-in users a reliable, privacy-safe extension session and a
one-click path from a detected streaming title to an explicit recommendation
sent to one or more accepted friends.

## 3. In-scope behavior

- Sign in with either an email address or a claimed username plus password.
- Keep username-to-email resolution on the server and return generic credential
  failures.
- Recover the helper panel after page refreshes, service-worker restarts,
  timeouts, and transient network failures.
- Detect actual movie/show playback screens on supported services.
- Replace the passive helper button with the supplied heart recommendation
  asset in the same screen position only while the user is watching a title.
- Resolve the detected title to a confirmed TMDB movie/series candidate only
  after the user opens the recommendation picker.
- List current accepted friends using safe display fields and opaque
  extension-only selection handles.
- Allow 1–20 friends to be selected and send the same title atomically.
- Show sent, already-active, reactivated, empty, stale-context,
  offline, and retry states.
- Provide a short-lived undo action when the server reports that undo is safe.
- Preserve the existing recommendation inbox and comfort-pick helper on browse,
  search, and title-detail pages.

## 4. Out-of-scope behavior

- Automatic recommendations without an explicit Send action.
- Persisting viewing history or detected page titles.
- Fuzzy/ambiguous title selection beyond a conservative best TMDB match.
- Recommendations to pending, declined, removed, or non-friend accounts.
- Editing the recommendation message.
- Streaming-service preference filtering.
- Mobile-browser support.
- A redesign of the companion web application.

## 5. User flow and UI states

1. The extension starts passive on supported browsing pages.
2. On an actual playback screen, the heart replaces the passive helper in the
   same position and exposes a title-specific tooltip.
3. Clicking it opens a compact picker in a loading state.
4. The background validates the session, resolves the title, and returns safe
   friend labels plus opaque handles.
5. The picker shows the confirmed title and friend checkboxes.
6. Send remains disabled until at least one friend is selected.
7. Sending shows progress and prevents duplicate submission.
8. Success names the recipients and offers Undo only when safe.
9. Empty, stale, offline, signed-out, rate-limited, and service-error states
   explain the next action and never remain as indefinite loading.

## 6. Database/backend implications

- Add a server-authoritative batch recommendation RPC.
- Derive the sender and source display name on the server.
- Require mutual friendship edges backed by an accepted request or invitation.
- Revoke direct recommendation inserts and broad recommendation updates.
- Limit recipient updates to their own `dismissed` state.
- Add a service-role-only login rate-limit function/table.
- Add an unauthenticated Edge Function for private username-or-email password
  exchange.
- Add an authenticated Edge Function for transient TMDB title resolution.
- Require a `TMDB_API_KEY` Edge Function secret before deployment.

## 7. Security and privacy constraints

- Never expose or persist email, password, service keys, access tokens, refresh
  tokens, profile UUIDs, friendship UUIDs, or recommendation UUIDs in a content
  script.
- Unknown username, unknown email, incorrect password, unconfirmed account, and
  unsupported password account return the same public credential error.
- All recommendation recipients are authorized atomically on the server.
- Detected titles are untrusted input, bounded, resolved, and never persisted as
  viewing history.
- Extension messages require the extension ID, HTTPS supported origins, exact
  message keys, and bounded values.
- Shadow roots are closed; this reduces casual host-page inspection but is not
  treated as a complete confidentiality boundary.

## 8. Edge cases

- Service worker stops between loading friends and sending.
- A friendship is removed between picker load and Send.
- The detected title changes during SPA navigation.
- TMDB returns no safe match or a conflicting media type.
- A title is already active, was previously dismissed, or is selected for
  multiple recipients.
- The network stalls rather than immediately failing.
- A stale response completes after a newer title or panel request.
- There are no accepted friends.
- The user signs out while a request is in flight.

## 9. Acceptance criteria

- Email and username sign-in reach the same account without returning email.
- A supported-page refresh always leaves loading through success, signed-out,
  or recoverable error within the request timeout.
- The active icon appears only when a plausible title is locally detected on an
  actual playback screen.
- Browse, search, and title-detail pages show only the original helper.
- Playback screens show only the active recommendation icon in the helper's
  original position.
- The picker displays the resolved title before Send.
- Only accepted friends appear and no database IDs cross into the content
  script.
- Mixed valid/invalid recipient batches insert nothing.
- Duplicate, reactivated, sent, and undo-safe outcomes are deterministic.
- A removed friendship cannot receive a new recommendation.
- All visible controls work by keyboard and expose accessible names.

## 10. Test plan

- Background unit tests for auth rotation, identifier login, timeouts, sender
  validation, opaque handles, batch sending, stale context, and undo.
- Static content-script boundary tests for initialization order, supported
  platforms, HTTPS scope, privacy, accessibility hooks, and packaged assets.
- Manual unpacked-Chrome tests for page refresh, title detection, SPA title
  changes, stale responses, picker selection, retry, keyboard operation, and
  success feedback.
- SQL verification for grants, RLS, friendship authorization, duplicate races,
  batch atomicity, and recommendation immutability.
- Edge Function tests for generic login errors, rate limits, response privacy,
  JWT validation, TMDB timeouts, and bounded metadata.
- Manual unpacked-Chrome tests on each supported service.
- Visual comparison against the four supplied flow references.

## 11. Recommended implementation sequence

1. Fix content initialization and recovery defects.
2. Add private identifier login and update the popup.
3. Add authoritative friend/recommendation database contracts.
4. Add transient title resolution.
5. Add title detection, active icon, picker, send, and undo UI.
6. Run automated, security, privacy, accessibility, and visual QA.
7. Independently review database and Edge Function changes.
8. Obtain production approval, deploy backend prerequisites, and run the manual
   unpacked-extension test before merge.
