# SEO and acquisition launch checklist

## What ships in this change

- Physical, pre-rendered HTML for every indexable public route.
- A branded `404.html` with `noindex, follow` and no global SPA rewrite.
- Plain-text `robots.txt` and XML `sitemap.xml`.
- Unique titles, descriptions, self-referential canonicals, Open Graph, and
  Twitter metadata for every public page.
- `noindex, nofollow` HTML and response headers for app, recovery, invitation,
  concept, and preview routes.
- Six substantive search-intent pages with internal links, real extension
  screenshots, product boundaries, and activation calls to action.
- A 1200 x 630 social-sharing image.
- Privacy-safe acquisition events in Google Analytics and Vercel Analytics.

## Analytics event contract

| Event | Meaning | Allowed properties |
| --- | --- | --- |
| `account_created` | Supabase accepted a new email signup | `method` |
| `extension_install_clicked` | A user opened the Chrome Web Store from Streaming Helper | `source` |
| `friend_connected` | An authenticated account has at least one connected friend | `source` |
| `first_recommendation_sent` | An authenticated account has sent at least one recommendation | `source` |

Do not add titles, recommendation IDs, friend IDs, usernames, emails, search
terms, or invitation tokens to analytics events.

`extension_install_clicked` is an installation-intent proxy. A website cannot
confirm that the Chrome Web Store installation completed. Use Chrome Web Store
analytics for completed installs. A future first-party extension activation
event can close this gap after its privacy and store-policy implications are
reviewed.

## Google Search Console after production deployment

1. Confirm `https://streaminghelper.net/google8ace3faeec1c18ae.html` loads.
2. In Search Console, open the `streaminghelper.net` property.
3. Submit `https://streaminghelper.net/sitemap.xml` under Sitemaps.
4. Inspect `https://streaminghelper.net/` and select **Test live URL**.
5. Confirm the rendered HTML contains the homepage heading and the page is
   indexable, then request indexing.
6. Inspect `/help`, `/privacy`, and one new search page to confirm their
   canonicals point to themselves.
7. Inspect a deliberately unknown URL and verify that it returns HTTP 404 and
   is excluded by `noindex`.
8. Inspect `/app` and verify the response includes
   `X-Robots-Tag: noindex, nofollow`.

## Production smoke checks

- `curl -I https://streaminghelper.net/this-route-does-not-exist` returns 404.
- `curl -I https://streaminghelper.net/robots.txt` reports `text/plain`.
- `curl -I https://streaminghelper.net/sitemap.xml` reports XML.
- `/`, `/help`, and `/privacy` each expose a unique canonical.
- The sitemap contains only successful, canonical public URLs.
- Signup, extension click, friend connection, and first recommendation events
  appear in GA DebugView or Realtime without sensitive payloads.

## Chrome Web Store copy direction

Lead with the problem and current value:

> Good show recommendations get buried in messages. Streaming Helper gives
> recommendations from friends a place to wait until you are ready to watch.

Then explain the two extension states:

- On a supported watch page, use the heart to send the current title to a
  connected friend.
- Elsewhere, use the normal helper icon to view Friend Recommendations or ask
  Comfort Pick for something familiar.

Keep the current boundaries visible: Chrome desktop, supported providers,
regional availability, no streaming-account connection, no watch-history
collection, and no automatic playback.

## Known follow-up

Create a dedicated demo account and capture a sanitized production dashboard
image. Do not publish screenshots from a real user account. The current public
pages use repository-owned extension audit captures and the homepage's accurate
dashboard rendering until that safe dashboard capture exists.
