# Streaming Helper Marketing Landing Page — Approved Scope

Status: Implemented on `codex/marketing-landing-page`; awaiting review
Product wording: Use **Beta** only
Primary production URL: `https://streaminghelper.net/`
Primary conversion: Install the Chrome extension
Secondary conversion: Open or sign in to the companion dashboard

## Product decision

Use the approved dark, violet/cornflower, editorial landing-page direction with
four concise sections:

1. Hero and product explanation.
2. Three-step “How it works.”
3. The decision-fatigue problem.
4. Real product capabilities and final CTA.

The page must explain a person-to-person recommendation flow:

1. Maya is watching a title and thinks Ava would enjoy it.
2. Maya clicks the Streaming Helper heart on the watch screen.
3. Maya selects Ava and sends the recommendation.
4. Later, Ava opens her Received recommendations.
5. Ava reviews the title and chooses where to open it.
6. Ava can dismiss or retain the recommendation and separately manage Comfort
   Picks and friends.

The page must not imply that Streaming Helper connects to streaming accounts,
reads watch history, imports libraries, guarantees title availability, or
automatically starts playback.

## Real-image strategy

Use real captures of Streaming Helper’s own dashboard and extension UI wherever
the approved design shows the product. These captures are content, not layout:
the page structure must not depend on controls being at exact screenshot
coordinates.

Create a single marketing-media manifest that owns:

- Hero dashboard capture.
- Extension heart and friend-picker capture.
- Received recommendations capture.
- Comfort Picks capture.
- Decision-fatigue editorial image.

Each entry must define its source, intrinsic dimensions, aspect ratio, alt text,
and responsive crop behavior. Components consume the manifest rather than
importing image files directly. A future dashboard redesign should therefore
require replacing an asset and updating one manifest entry, without changing
section markup.

Use versioned source assets so deployments receive new cache-busted filenames.
Provide AVIF or WebP derivatives and retain a lossless source capture outside
the production bundle.

### Capture rules

- Capture from dedicated demo accounts with fictional names and seeded content.
- Do not expose real usernames, email addresses, account IDs, browser profiles,
  access tokens, network panels, or production-only records.
- Crop browser and operating-system chrome unless it is necessary to explain
  the extension.
- Capture loading, success, and error UI separately when those states are shown.
- Use the real extension panel over a neutral or product-safe playback
  background when a streaming-platform screen would introduce avoidable
  copyright or trademark risk.
- Use original, licensed, or otherwise approved title artwork. A real product
  screenshot does not automatically grant marketing rights to third-party
  posters visible inside it.
- Record the capture date and product version in the media manifest or adjacent
  documentation.

## 1. User problem

People receive recommendations in conversations while they are busy or already
watching something. When they later want a show, those recommendations are hard
to find. They fall back to scrolling across services, asking the same friends
again, or rewatching something familiar without an easy way to choose.

The current public entry screen explains authentication but does not function
as a complete marketing page. A new visitor may not understand the relationship
between the extension, friend recommendations, the dashboard, and Comfort
Picks before being asked to sign in.

## 2. Feature goal

Create a fast public landing page that lets a first-time visitor understand the
product in one scroll and confidently choose one of two actions:

- Add Streaming Helper to Chrome.
- Open the dashboard to sign in or create an account.

The visitor should understand within the hero and first three steps that:

- Recommendations come from friends.
- A recommendation can be sent while watching.
- The recipient can find it later in the dashboard.
- Comfort Pick is available when the user wants something familiar.

## 3. In-scope behavior

### Public route

- `https://streaminghelper.net/` displays the marketing landing page for both
  signed-in and signed-out visitors.
- “Open the dashboard” and “Sign in” navigate to `/app`.
- `/app` preserves the current behavior: authenticated visitors see the
  dashboard and anonymous visitors see the existing authentication screen.
- Existing public privacy, invitation, and password-recovery routes continue to
  work.
- The extension’s “Open companion app” destination changes to `/app`.
- The extension’s forgot-password destination uses `/app?auth=forgot` unless a
  dedicated authentication route is approved during implementation.

### Navigation

- Logo returns to the top of the landing page.
- Product, How it works, and Friends links scroll to real page sections.
- Sign in opens `/app`.
- Add to Chrome opens the official Chrome Web Store listing.
- Desktop navigation becomes a keyboard-accessible mobile menu at small widths.

### Hero

- Explain the product using friend-powered recommendation language.
- Use “Add to Chrome” as the only primary CTA.
- Use “Open the dashboard” as the secondary CTA.
- Show a real, sanitized Recommendations dashboard capture.
- Preserve the approved near-black background, warm off-white type, and
  violet/cornflower gradient.

### How it works

Present exactly three steps:

1. Add friends you trust.
2. Recommend while watching.
3. Find it when you need it.

Use a real extension heart/friend-picker capture and a real Received
recommendations capture. The section may use short entrance transitions but
must remain understandable as static content.

### Decision-fatigue section

- Explain that recommendations are lost in old chats.
- Show one editorial night-time image.
- Use a short indecision exchange that resolves with a friend recommendation.
- List only verified benefits:
  - Friends’ picks in one place.
  - Received and Sent lists.
  - Comfort Pick for familiar choices.
  - Opening titles on supported streaming platforms.

### Product capabilities

Show only:

- Friend recommendations.
- Comfort Picks.
- Friend management.
- Opening titles on supported platforms.

Use a real, sanitized dashboard capture. The content may describe opening a
platform page or search, but not direct automatic playback.

### Footer and metadata

- Privacy link.
- Chrome Web Store link.
- Dashboard/sign-in link.
- Contact link only if a monitored contact destination exists.
- Page title, description, canonical URL, Open Graph metadata, social preview,
  favicon, and basic SoftwareApplication structured data with only verifiable
  claims.
- All public product-stage wording says “Beta,” never “Beta 1” or “Beta 2.”

### Motion

- Restrained section entrance transitions.
- Subtle product-image depth or glow on desktop.
- No long pinned-scroll sequence in the first implementation.
- No autoplaying carousel or video.
- Disable nonessential motion under `prefers-reduced-motion`.

## 4. Out-of-scope behavior

- Dashboard redesign.
- Authentication redesign.
- Google or social authentication.
- Pricing, paid plans, subscriptions, or checkout.
- Streaming-account connections.
- Watch-history ingestion.
- Universal watchlist or library import.
- Personalized algorithmic recommendations.
- Automatic title playback.
- Guaranteed provider availability.
- Public social feeds, ratings, likes, or activity.
- New Supabase tables, migrations, policies, functions, or production data.
- CMS integration.
- Blog, FAQ, testimonials, pricing page, or multi-page marketing site.
- Editing the Chrome Web Store listing or uploading a new extension package.
- Rebuilding screenshots into fake interactive dashboards.

## 5. User flow and UI states

### Primary visitor flow

1. Visitor lands on `/`.
2. Hero explains friend-powered recommendations.
3. Visitor sees the extension-to-dashboard flow.
4. Visitor selects “Add to Chrome.”
5. Chrome Web Store opens in a new tab with safe `noopener` behavior.

### Existing-user flow

1. Visitor lands on `/`.
2. Visitor selects “Open the dashboard” or “Sign in.”
3. `/app` opens.
4. If authenticated, the dashboard renders.
5. If anonymous, the existing authentication screen renders.

### Extension companion flow

1. Extension opens `https://streaminghelper.net/app`.
2. Existing auth/session behavior determines dashboard or sign-in.
3. Forgot password opens `/app?auth=forgot`.
4. Existing reset-email and `/update-password` flow remains unchanged.

### Required UI states

- Default desktop, tablet, and mobile landing layouts.
- Mobile navigation open and closed.
- CTA hover, focus, active, and disabled-safe external-link behavior.
- Product image loading, loaded, and fallback states.
- Reduced-motion state.
- No-JavaScript content remains readable, though enhanced navigation may not.
- Missing marketing image displays a designed fallback with meaningful alt
  text, without collapsing layout.

## 6. Database and backend implications

No database, migration, RLS, Edge Function, or production-data change is
required.

The landing page is static and must not query authenticated user data. It must
not initialize recommendation, friend, notification, or Comfort Pick data
hooks.

The route split should occur before the authenticated dashboard mounts so a
public landing visit does not pay the cost of dashboard hooks or Supabase
queries. A minimal route dispatcher is preferred over a broad routing rewrite.

The existing Vercel SPA rewrite can continue serving `index.html` for `/app`,
`/privacy`, invitation routes, and `/update-password`.

## 7. Security and privacy constraints

- No production account data in marketing captures.
- No secrets, tokens, Supabase keys beyond already-public client configuration,
  or extension storage values in screenshots.
- No marketing-page calls to authenticated Supabase resources.
- External links use safe target/relationship attributes.
- Analytics, if added later, must not capture friend names, title names,
  account IDs, free-form text, or authentication data.
- Do not claim perfect privacy or unsupported security certification.
- Product screenshots must not expose notifications, emails, or usernames from
  real users.
- Preserve the existing invitation, recovery, and privacy-route protections.

## 8. Edge cases

- Signed-in user visits `/`: show the marketing page; “Open dashboard” takes
  them to `/app` without asking them to sign in again.
- Anonymous user visits `/app`: show the current authentication screen.
- Extension still points to the old root URL: root remains useful but opens the
  marketing page; the extension package should be updated before release so the
  direct companion flow returns to `/app`.
- Password-reset query is opened at the root from an older extension version:
  temporarily preserve or redirect `/?auth=forgot` to `/app?auth=forgot`.
- A dashboard screenshot becomes outdated: update the media manifest without
  changing page layout.
- Image fails to load: reserve dimensions and show an accessible fallback.
- Narrow screen: product captures remain legible and may use a focused crop
  rather than shrinking the entire dashboard.
- High zoom or long translated copy: no clipped CTA or horizontal overflow.
- Reduced motion: every section and product explanation remains complete.
- Chrome Web Store URL changes: keep it in one shared constant.
- Third-party artwork rights are uncertain: use original fictional artwork.

## 9. Acceptance criteria

- A first-time visitor can state that Streaming Helper lets friends recommend
  titles while watching and lets recipients find them later.
- The hero contains one primary “Add to Chrome” CTA and one secondary dashboard
  CTA.
- Every visible product claim maps to existing repository behavior.
- No copy claims streaming-account connection, watch-history access,
  personalized algorithms, universal library import, or automatic playback.
- `/` renders the landing page without mounting authenticated dashboard data
  hooks.
- `/app` preserves existing authenticated and anonymous behavior.
- `/privacy`, invitation routes, `/update-password`, and forgot-password entry
  continue to work.
- Extension companion and forgot-password URLs point to the intended `/app`
  entry.
- Real product captures use fictional/sanitized data and can be replaced through
  one media manifest.
- No real customer data or unapproved third-party artwork appears.
- Navigation and primary interactions work with keyboard, mouse, and touch.
- Focus is visible and contrast meets WCAG 2.2 AA.
- The page works at 320 px width and 200% zoom without horizontal scrolling.
- `prefers-reduced-motion` removes nonessential animation.
- Target LCP is under 2.5 seconds, CLS under 0.1, and INP under 200 ms on a
  representative mid-range mobile test.
- Page metadata, canonical URL, social preview, favicon, and production links
  are correct.
- Public wording uses “Beta” only.

## 10. Test plan

### Automated

- Production build succeeds.
- Unit test route selection for `/`, `/app`, `/privacy`, invitation paths,
  `/update-password`, and forgot-password query handling.
- Component tests for navigation, mobile menu, CTA URLs, and reduced-motion
  behavior.
- Assert the Chrome Web Store URL and `/app` companion URL come from shared
  constants.
- Assert public landing render does not invoke authenticated data hooks.
- Accessibility scan for headings, landmarks, names, contrast, focus, and alt
  text.
- Link check for internal and external destinations.
- Lighthouse or equivalent budget check in a production build.

### Visual

- Compare implementation with the approved direction at desktop, tablet, and
  mobile breakpoints.
- Verify product captures are not stretched, clipped unintentionally, or too
  small to understand.
- Verify replacement of each media-manifest item does not change section
  dimensions.
- Test dark display, Windows high contrast, 200% zoom, and reduced motion.

### Manual

- New visitor understands the product after hero plus How it works.
- Add to Chrome opens the official listing.
- Sign in and Open dashboard route to `/app`.
- Existing session goes directly to the dashboard from `/app`.
- Anonymous `/app` visit shows sign-in/sign-up.
- Extension “Open companion app” opens `/app`.
- Extension forgot password opens the correct form.
- Reset email reaches `/update-password` and completes successfully.
- Privacy and invitation links remain functional.
- Check current Chrome, Edge, Firefox, and Safari desktop plus representative
  iOS and Android viewport sizes.

## 11. Recommended implementation sequence

1. Create a new `codex/marketing-landing-page` branch from current `main`.
2. Capture and approve sanitized real product images using dedicated demo data.
3. Define the shared product URLs and the replaceable marketing-media manifest.
4. Add the minimal `/` versus `/app` route dispatcher while preserving existing
   public and recovery routes.
5. Build the landing page as semantic static sections with responsive layout.
6. Connect navigation, Chrome Web Store CTA, dashboard CTA, and sign-in path.
7. Update extension companion and forgot-password destinations to `/app`.
8. Add restrained motion and reduced-motion alternatives.
9. Add metadata, structured data, social preview, and footer links.
10. Run automated, accessibility, responsive, route-regression, and extension
    manual tests.
11. Review the final implementation against the approved visual direction and
    real captures.
12. Commit, push the branch, open a PR, verify preview deployment, and merge
    only after the route and authentication regression gates pass.

## Manual inputs required from the product owner

- Approve the final hero, extension, Recommendations, and Comfort Picks
  captures before merge.
- Confirm that any third-party artwork visible in a capture is licensed for
  marketing use; otherwise approve fictional replacement artwork.
- Confirm the monitored contact destination before a Contact link is published.
- Perform the final signed-in `/app`, extension companion-link, and password
  recovery checks using real accounts.

## Release boundary

This scope creates no Supabase production change. It changes the public website
and, because the companion URL moves to `/app`, requires a matching extension
URL update and a new Chrome Web Store package before the direct extension entry
uses the new route.
