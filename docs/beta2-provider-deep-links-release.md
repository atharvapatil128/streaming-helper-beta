# Beta 2 Provider Deep Links

## 1. User problem

Opening a recommendation currently lands on a provider search or TMDB page.
Users must locate the title again, and the result may not be the same catalog
entry the sender was watching.

## 2. Feature goal

When Streaming Helper can safely verify a Netflix or Prime Video catalog
reference from the sender's current watch tab, show that exact destination
first while retaining Search and TMDB as reliable fallbacks.

## 3. In-scope behavior

- Netflix `/watch/<id>` and Prime Video `/detail/<catalog-id>` references.
- Capture from the trusted Chrome sender tab only.
- Revalidate the sender tab when Send is clicked.
- Store an allowlisted provider key and provider-relative reference.
- Show `Open on Netflix` or `Open on Prime Video` before existing fallbacks.
- Support old recommendations and old clients with nullable/defaulted fields.

## 4. Out-of-scope behavior

- Arbitrary or user-supplied URLs.
- Guaranteed playback, subscription availability, region availability, or
  profile selection.
- Hulu, Disney+, Max, or other provider-specific links.
- Provider account credentials or provider API integrations.
- Programmatically clicking Play or bypassing a provider's normal UI.

## 5. User flow and UI states

1. The sender opens the recommendation picker on a supported watch screen.
2. The worker resolves the title and privately binds a verified provider
   reference to the short-lived title handle.
3. On Send, the worker rechecks the current tab:
   - exact match: store the provider pair;
   - changed/invalid tab: send normally with no provider pair.
4. The recipient sees:
   - exact provider action first when the stored pair is valid;
   - provider Search and TMDB actions after it;
   - only the existing fallbacks for old or invalid rows.
5. Opening a destination creates a new tab and clears the picker state.

## 6. Database/backend implications

- Add nullable `recommendations.provider_key` and `provider_ref`.
- Enforce both-or-neither and provider-specific formats with a table check.
- Keep one public `send_title_recommendation` RPC with two trailing nullable
  default parameters, preserving legacy PostgREST payloads.
- Preserve the existing duplicate identity, quota, friendship, trigger, Undo,
  and return-shape behavior.
- No new index, table, paid Supabase feature, or background schedule.

## 7. Security and privacy constraints

- Never store or accept a complete URL.
- Accept only canonical HTTPS `www.netflix.com` and `www.primevideo.com`
  sender-tab routes.
- Revalidate database values before constructing an outbound URL.
- Do not expose captured provider references to the content-script picker.
- Keep direct INSERT and provider-column UPDATE unavailable to authenticated
  browser clients.
- Keep the providerless helper function in a non-exposed schema with no client
  execution grant.

## 8. Edge cases

- SPA navigation between picker opening and Send removes the exact link.
- Partial, malformed, unsupported, or malicious provider pairs reject the
  entire send before quota, recommendation, trigger, or Undo side effects.
- `ALREADY_ACTIVE` never mutates provider data.
- `REACTIVATED` replaces provider data only when a valid pair is supplied;
  legacy reactivation preserves an existing pair.
- Netflix references may identify an episode while the recommendation is for a
  series; the UI therefore says `Open on Netflix`, not `Play series`.

## 9. Acceptance criteria

- A valid Netflix/Prime recommendation opens the reconstructed allowlisted URL.
- Search and TMDB remain available after a direct action.
- Old null/null rows behave exactly as before.
- The extension sends successfully without provider data when the tab changes.
- Both legacy eight-field and new ten-field PostgREST RPC payloads return 200.
- Invalid pairs create no recommendation, quota event, email job, or Undo row.
- No new Chrome permission is present.

## 10. Test plan

- Run `npm.cmd run test:extension`.
- Run `npm.cmd run build`.
- Replay the repository schema through migration 027 in disposable local
  Supabase Postgres, apply the candidate migration, and execute
  `supabase/tests/provider_deep_links_full_schema_assertions.sql`.
- Exercise the two JSON fixtures in `supabase/tests` through local PostgREST.
- After the approved database-first rollout, manually test:
  - send from one Netflix watch route;
  - send from one Prime detail/watch route;
  - navigate away before Send and confirm fallback-only behavior;
  - open exact, Search, and TMDB actions;
  - confirm old recommendations still open;
  - confirm Undo for a fresh Send.

## 11. Recommended implementation and release sequence

1. Merge the reviewed migration/application PR.
2. Apply the migration to Supabase and run its verification queries/advisors.
3. Smoke-test both old and new RPC payloads against production.
4. Deploy the web application.
5. Test extension `0.5.0` unpacked against production.
6. Upload the reviewed ZIP to the official Chrome Web Store listing:
   `fnbhllmhjamdfnfjlmipkcefbjnfnhej`.
7. Keep extension `0.4.2` available until the database and web checks pass.

The rollout is intentionally database-first because the new application queries
select the provider columns. Deploying the web or extension first would make
recommendation reads fail until the migration exists.
