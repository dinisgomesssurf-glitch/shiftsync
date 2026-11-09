-- Security fix (found by Supabase's advisor after Phase 1):
-- get_org_member_emails() returned every member's email for ANY organization id
-- to anyone holding the public anon key, without signing in. Only the
-- notify-schedule edge function needs it, and that runs as service_role.
revoke all on function public.get_org_member_emails(uuid) from public, anon, authenticated;
grant execute on function public.get_org_member_emails(uuid) to service_role;

-- Trigger function: never meant to be called over the API.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- These require a signed-in user anyway; don't expose them to anon.
revoke all on function public.create_organization(text) from public, anon;
grant execute on function public.create_organization(text) to authenticated;
revoke all on function public.join_organization_by_code(text) from public, anon;
grant execute on function public.join_organization_by_code(text) to authenticated;

-- check_username_available stays callable by anon (used on the sign-up form).
-- is_org_member / is_org_admin stay callable (used inside RLS policies).
