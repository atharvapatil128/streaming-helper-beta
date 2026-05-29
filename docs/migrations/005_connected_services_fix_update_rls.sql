-- Migration 005 — connected_services: add WITH CHECK to update policy
-- Without an explicit with check clause, Supabase can silently block UPDATE
-- operations when the row-level check fails (returns 0 rows, no error).
-- Dropping and re-creating guarantees both the USING filter and the
-- post-update constraint are explicit, matching the pattern used for
-- recommendations in migration 004.

drop policy if exists "Users can update their own connected services" on public.connected_services;

create policy "Users can update their own connected services"
  on public.connected_services for update
  using    (auth.uid() = user_id)
  with check (auth.uid() = user_id);
