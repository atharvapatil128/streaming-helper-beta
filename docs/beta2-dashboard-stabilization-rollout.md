# Beta 2 Dashboard Stabilization

## Release goal

Ship a dependable, visually coherent version of the existing authenticated
dashboard for Beta 2 without changing its backend contracts or beginning the
larger dashboard redesign.

## User problem

The current dashboard works, but inconsistent spacing, stretched cards,
crowded controls, weak responsive behavior, and a bottom obstruction make the
product feel unfinished and can prevent users from comfortably managing
recommendations.

## Feature goal

Preserve every existing workflow while making the current dashboard stable,
responsive, readable, and visually aligned with the approved matte graphite
direction.

## In scope

- A deterministic desktop viewport and scroll model.
- Normal document scrolling below the desktop breakpoint.
- A compact header containing the primary Recommendations and Comfort List
  navigation.
- A persistent friend filter rail on desktop and a single-scroll drawer on
  smaller screens.
- Responsive recommendation controls, filters, cards, notifications, and
  status messages.
- Clear selected, hover, focus, disabled, and loading states.
- Restrained depth, shadows, and lavender emphasis.
- Existing dashboard links to the public website.

## Out of scope

- Database changes, migrations, Edge Functions, or Supabase configuration.
- Authentication changes.
- Recommendation, friendship, notification, or comfort-title contract changes.
- New settings capabilities.
- The larger control-surface redesign or information-architecture overhaul.
- Production deployment before review and approval.

## User flow and UI states

1. A signed-in user lands on Recommendations.
2. They can filter by a friend from the desktop rail or mobile drawer.
3. They can switch between received and sent recommendations.
4. They can search, filter, change card layout, open a card, or recommend a
   title.
5. They can switch to Comfort List without losing the stable application shell.
6. Notifications open beside the desktop trigger or as a bounded mobile sheet.
7. Status messages stack without covering one another or overflowing the
   viewport.

All existing loading, empty, error, selected, and modal states remain wired to
their current application behavior.

## Backend and database implications

None. This release consumes the same hooks, queries, RPCs, and mutation paths
as the current production dashboard.

## Security and privacy constraints

- Do not bypass authentication in production.
- Do not expose emails, credentials, tokens, or database identifiers in UI
  state.
- Keep current safe profile and friendship display fallbacks.
- Do not add analytics or external data transmission as part of this work.

## Edge cases

- Long friend names and zero recommendations.
- Many friends in the filter rail.
- Multiple simultaneous status messages.
- Empty, loading, and recoverable error states.
- 200% browser zoom and 768–1280 px constrained desktop widths.
- Mobile safe-area insets, coarse pointers, and on-screen keyboards.
- Very narrow phone widths and long notification copy.

## Acceptance criteria

- No black or empty block obscures the bottom of Recommendations.
- Desktop dashboard content scrolls inside a bounded viewport.
- Mobile and tablet layouts use normal page scrolling with no horizontal
  overflow.
- Primary navigation remains usable from 320 px through wide desktop sizes.
- Recommendation cards do not stretch beyond their intended readable width.
- Cards and controls have clear selected and focus states.
- Touch targets are at least 44 by 44 px for coarse pointers.
- Mobile notifications do not cover the primary navigation.
- Status messages wrap, stay within the viewport, and never overlap.
- All existing dashboard workflows and modals remain functional.
- Production build, marketing route tests, and extension regression tests pass.

## Test plan

### Automated

- Run `npm run build`.
- Run `npm run test:marketing`.
- Run `npm run test:extension`.
- Run the Impeccable layout detector over changed dashboard files.

### Manual

Test `/app` at 320, 375, 430, 768, 900, 1024, 1280, and 1440 px:

- Sign in normally and verify website navigation.
- Switch Recommendations and Comfort List.
- Select and clear friend filters.
- Search and change recommendation filters.
- Switch received/sent and grid/list.
- Open, recommend, dismiss, undo, and delete as applicable.
- Open and close notifications, settings, onboarding, and account controls.
- Trigger more than one status message and confirm the stack remains readable.
- Verify keyboard focus order and 200% zoom.

## Recommended implementation sequence

1. Bound the desktop height chain and remove the bottom obstruction.
2. Stabilize the header, navigation, and friend rail.
3. Normalize responsive breakpoints and mobile overlays.
4. Polish cards, filters, selected states, and buttons.
5. Consolidate status-message placement.
6. Run automated and manual regression checks.
7. Review the Vercel branch preview.
8. Merge through a pull request, then verify production.

## Rollback

The work is isolated on `codex/beta2-dashboard-stabilization`. Before merge,
the preview can be discarded with no production impact. After merge, rollback
is the normal revert of the dashboard stabilization pull request; no database
rollback is required.
