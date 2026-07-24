# Beta 2 Extension Recommendation Flow Audit

## Audit scope

Combined UX and accessibility review of the four user-supplied reference states
for detecting and recommending the currently open streaming title.

## User goal and accessibility target

Recommend the current movie or episode to one or more accepted friends without
leaving playback, using a flow that remains understandable and operable by
keyboard and assistive technology.

## Numbered flow

1. **Active icon — healthy with clarification needed.** The supplied heart asset
   is distinctive and visually consistent with Streaming Helper. It needs an
   accessible name and must not rely on color alone to communicate detection.
2. **Title detected — healthy concept, copy risk.** The tooltip clearly explains
   the action. Dynamic copy should name the detected title where space allows,
   and it must also appear on keyboard focus.
3. **Friend picker — structurally useful, accessibility work required.** The
   compact list and checkbox affordance support multi-select. The coded version
   needs a visible title confirmation, real checkboxes, scroll handling, a
   disabled-until-selected Send button, focus management, and explicit
   loading/empty/error states.
4. **Success feedback — healthy confirmation, undo semantics required.** Naming
   the recipient builds trust. Undo must only be shown when the server can
   safely reverse the exact operation; otherwise the confirmation should omit
   it rather than offer a misleading control.

## Strengths

- The flow is short and preserves the streaming context.
- The heart icon, picker, and confirmation use one consistent visual language.
- Friend selection is explicit before any recommendation is sent.
- The success message identifies the affected friend.

## UX risks

- The references do not show title confirmation inside the picker, increasing
  the risk of sending a misdetected title.
- Loading, no-friends, signed-out, offline, duplicate, partial-result, and stale
  service-worker states are not represented.
- The tiny picker may become unusable with long names or many friends unless it
  scrolls and truncates safely.
- The mock does not define whether multiple friends may be selected; the
  checkbox treatment implies multi-select, which this scope adopts.

## Accessibility risks

- The tooltip must appear on focus as well as hover and be associated with the
  button.
- The picker needs dialog semantics, focus entry/return, Escape handling, and a
  sensible tab order.
- Checkboxes and Send/Undo controls need at least 44-by-44 effective targets or
  equivalent spacing.
- Success and error changes need live-region announcements.
- Contrast and zoom behavior still require testing in the coded extension.

## Evidence limits

The supplied screenshots are visual targets, not captures of a running
extension. They cannot prove keyboard behavior, focus order, screen-reader
output, responsive reflow, network recovery, or streaming-site compatibility.
Those items remain implementation and manual-test gates.

## Recommendations

- Display and require confirmation of the resolved title before Send.
- Keep friend IDs and recommendation IDs out of the content script.
- Add explicit loading, empty, retry, signed-out, stale-context, sending,
  success, and undo-unavailable states.
- Use real semantic controls and manage focus.
- Treat the supplied layout as the compact visual target while preserving the
  existing passive helper on non-title pages.
