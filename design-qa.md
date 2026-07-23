# Beta 2 Extension Recommendation Design QA

## Source of truth

- `docs/audit/beta2-extension-recommendation-flow/01-active-icon.png`
- `docs/audit/beta2-extension-recommendation-flow/02-title-detected.png`
- `docs/audit/beta2-extension-recommendation-flow/03-friend-picker.png`
- `docs/audit/beta2-extension-recommendation-flow/04-success-feedback.png`

## Implementation under review

- `helper-extension/recommend.js`
- `helper-extension/icons/recommend-active.png`

## Target state

- Desktop Chrome on a supported HTTPS streaming title page.
- Detected-title icon at the upper-right.
- Confirmed-title picker containing accepted friends.
- Success feedback after an authorized send.

## Checks completed

- The supplied PNG heart asset is used directly rather than redrawn.
- The compact dark-purple picker follows the supplied hierarchy: active icon,
  friend list, explicit Send, and recipient-specific confirmation.
- Long friend names truncate, the list scrolls, and the dialog is viewport
  bounded.
- Controls have semantic button/checkbox roles, visible keyboard focus,
  Escape handling, live-region feedback, and reduced-motion behavior.
- Loading, signed-out, no-friends, stale-context, friendship-changed, service
  error, success, and undo-unavailable states are implemented.

## Comparison and iteration history

1. Initial code review found no explicit title confirmation, insufficient error
   states, and unsafe assumptions around Undo in the supplied mock.
2. The implementation added a canonical title header, recoverable states, and
   server-authorized Undo.
3. Integration review found an RPC signature mismatch and an incorrect Undo
   offer for reactivated rows. Both were corrected.
4. Lifecycle review found a late-mounted helper could appear beside the active
   icon. Helper replacement is now idempotent and reversible.

## Final result

**Blocked pending runtime capture.** A trustworthy visual pass requires the
actual unpacked extension running on a supported streaming title page after the
backend migration and Edge Functions are approved and deployed. At that point,
capture the picker at the same state as reference 03 and the success state as
reference 04, place each reference and runtime capture in one comparison image,
and verify spacing, typography, contrast, clipping, focus, and zoom before
merge.
