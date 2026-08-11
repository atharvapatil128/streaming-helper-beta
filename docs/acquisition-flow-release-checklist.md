# Acquisition flow release checklist

This checklist covers the path from a new visitor to a connected friend and a
first recommendation. It intentionally excludes group onboarding and public
recommendation previews.

## Product behavior

- [ ] A new account sees the Getting Started guide.
- [ ] A user with no friends can open Add Friend from the guide, floating
  shortcut, and recommendation empty state.
- [ ] A sent email invitation changes the guide to `Invitation sent` without
  incorrectly counting the friend as connected.
- [ ] An invitation link remains available through sign-up, email confirmation,
  refresh, and a return to `/app`.
- [ ] Accepting an invitation opens `/app` and the connected friend appears.
- [ ] Invalid, expired, accepted, declined, or revoked invitation tokens are
  removed from local browser storage.
- [ ] A connected user with no sent recommendations sees a direct
  `Recommend a title` action.
- [ ] Sending the first recommendation completes the guide.
- [ ] Search/filter empty states offer `Clear filters` instead of a dead end.

## Extension continuity

- [ ] Website behavior remains unchanged with extension 0.5.1 or no extension.
- [ ] From `https://streaminghelper.net` DevTools, a status request sent to the
  unpacked 0.5.2 extension ID returns only coarse connection state. The normal
  website UI will use the official Web Store ID after publication.
- [ ] A signed-out extension is described only as detected.
- [ ] A signed-in extension is described as detected and signed in.
- [ ] The website receives no token, email, username, account ID, friend data,
  or title data from the extension.
- [ ] Detection is rejected from non-HTTPS, lookalike, localhost, and unrelated
  origins.
- [ ] Send a title to a friend, dismiss it from the receiver's dashboard, then
  send the same title again. The sender remains connected, sees a successful
  recommendation, and the receiver sees the restored title without a duplicate.
- [ ] If one recommendation-context request fails transiently, the open panel
  reconnects once before showing a recoverable error and does not swap back to
  the normal helper icon while the watch title remains detected.

## Analytics

- [ ] GA4 Realtime shows `friend_request_sent` or `invitation_sent` after a
  successful friend action.
- [ ] GA4 Realtime shows `friend_connected` after the backend friend count
  becomes positive.
- [ ] GA4 Realtime shows `first_recommendation_sent` after the first successful
  send.
- [ ] GA4 Realtime shows `extension_connection_observed` only after 0.5.2 is
  detected.
- [ ] Event parameters contain only the allowlisted coarse values `source`,
  `method`, `action`, and `state`.
- [ ] No title, email, username, token, friend ID, user ID, or recommendation ID
  appears in GA4 or Vercel Analytics.

## Responsive and accessibility checks

- [ ] Test the guide and both empty states at 390 px, 768 px, and 1440 px.
- [ ] All actions are reachable with Tab and show a visible focus state.
- [ ] The guide receives focus after the floating shortcut is activated.
- [ ] Status text is announced without relying on color alone.
- [ ] Reduced-motion mode does not animate scrolling or the onboarding glow.

## Release steps

- [ ] Merge and deploy the website changes first.
- [ ] Load `helper-extension` unpacked and complete the extension checks above.
- [ ] Package the exact verified `helper-extension` folder as version 0.5.2.
- [ ] Upload 0.5.2 to the Chrome Web Store for review.
- [ ] After approval, verify extension detection on the production domain.
- [ ] Observe the acquisition events for at least one complete test account.

## Rollback

- Website: redeploy the previous Vercel production deployment.
- Extension: do not publish 0.5.2 if unpacked testing fails. Version 0.5.1
  remains compatible with the website because missing detection is treated as
  unavailable, not as an error.
