# Acquisition and activation foundation

## Product objective

Acquire users by shortening the friend-powered cold start. A new account is
activated when the user has connected with at least one friend and sent their
first recommendation. Extension installation supports that journey, but is not
treated as complete until the extension can verify its connection to the web
account.

## Funnel definitions

| Stage | Definition | Event or source |
| --- | --- | --- |
| Account created | Supabase returns a new account from signup | `account_created` |
| Friend action | A friend request or new-user invitation succeeds | `friend_request_sent` / `invitation_sent` |
| Friend connected | Backend-derived friend count becomes positive | `friend_connected` |
| First recommendation | Backend-derived sent recommendation count becomes positive | `first_recommendation_sent` |
| Activated | Account has at least one sent recommendation | Server-derived dashboard state |

The pending-invitation state is shown as “waiting for friend”; it is not counted
as a connected friend.

## KPI framework

Primary KPI:

- First-recommendation activation rate: percentage of newly created accounts
  that send at least one recommendation. Add a seven-day cohort window once
  reporting can reliably join account creation and activation without exposing
  personal data.

Driver metrics:

- Percentage of new users who send a friend request or invitation.
- Percentage of new users who connect with a friend.
- Invitation-to-connection conversion.
- Median time from account creation to first recommendation.
- Extension store click-through from the first-run checklist.

Guardrails:

- Friend request and invitation error rate.
- Recommendation send error rate.
- No email, username, title, recommendation ID, friend ID, or invitation token
  in analytics.

Targets should be set only after a stable baseline is collected.

## Event privacy contract

The analytics adapter allowlists properties per event. Unknown properties are
dropped before data reaches Google Analytics or Vercel Analytics. Approved
properties describe only the acquisition surface or method, such as `source`,
`method`, `action`, and coarse activation `state`.

## Current implementation

- Dashboard activation state is derived from backend-fetched friends, sent
  invitations, and sent recommendations.
- The first-run card guides account → friend → first recommendation.
- A pending email invitation creates a truthful waiting state.
- Friend request, invitation, invitation acceptance, checklist actions, and
  extension-store clicks are instrumented with privacy-safe properties.
- Existing friend and first-recommendation milestones remain deduplicated in
  the browser per authenticated account.
- GA4 loads on `/app` in milestone-only mode with automatic page views disabled.
  The production measurement ID has a built-in fallback so missing Vercel
  client configuration cannot silently drop activation events.

## Known limitation and next step

An extension-store click is not proof that the extension was installed or
connected. Add an authenticated, versioned extension-to-site handshake before
displaying extension completion or calculating install-to-signup conversion.
Do not infer installation from a store click.

After the funnel is validated in GA4 and Vercel Analytics, consider title-safe
invitation previews for non-users and group onboarding. Those are deliberately
outside this foundation release.
