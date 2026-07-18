-- ============================================================
-- Migration 026 - SECURITY DEFINER and function ACL cleanup
--
-- Trigger functions execute through their owning triggers and do not need
-- PostgREST/API execution grants. User-facing RPCs are restated with the
-- smallest role set required by the current product flows.
--
-- The obsolete delete_my_account() RPC is retained for migration-history
-- compatibility but is not API-callable. Production account deletion uses the
-- delete-account Edge Function, which removes auth.users and related data.
--
-- No tables, policies, triggers, or user data are changed.
-- Safe to re-run: ALTER FUNCTION, REVOKE, and GRANT are idempotent here.
-- ============================================================

-- Lock mutable search paths. Each function either uses only PL/pgSQL trigger
-- records/built-ins or schema-qualifies every referenced relation/function.
alter function public.handle_new_user() set search_path = '';
alter function public.handle_new_profile_notification_prefs() set search_path = '';
alter function public.invitations_before_insert() set search_path = '';
alter function public.profiles_reserve_username_on_delete() set search_path = '';
alter function public.set_notification_preferences_updated_at() set search_path = '';
alter function public.set_email_jobs_updated_at() set search_path = '';
alter function public.delete_my_account() set search_path = '';

-- Trigger-only helpers must not be callable through any API role. Trigger
-- execution is unaffected because PostgreSQL does not check function EXECUTE
-- privileges when a trigger fires.
revoke all on function public.handle_new_user()
  from public, anon, authenticated, service_role;
revoke all on function public.handle_new_profile_notification_prefs()
  from public, anon, authenticated, service_role;
revoke all on function public.invitations_before_insert()
  from public, anon, authenticated, service_role;
revoke all on function public.profiles_reserve_username_on_delete()
  from public, anon, authenticated, service_role;
revoke all on function public.set_notification_preferences_updated_at()
  from public, anon, authenticated, service_role;
revoke all on function public.set_email_jobs_updated_at()
  from public, anon, authenticated, service_role;

-- Disable the obsolete partial account-cleanup RPC for all API roles. The
-- delete-account Edge Function is the sole product account-deletion path.
revoke all on function public.delete_my_account()
  from public, anon, authenticated, service_role;

-- Public invitation lookup is intentionally available before authentication.
-- Response and friend removal always require a signed-in user.
revoke all on function public.lookup_invitation(text)
  from public, anon, authenticated, service_role;
grant execute on function public.lookup_invitation(text)
  to anon, authenticated, service_role;

revoke all on function public.respond_invitation(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.respond_invitation(text, text)
  to authenticated, service_role;

revoke all on function public.remove_friend(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.remove_friend(uuid)
  to authenticated, service_role;
