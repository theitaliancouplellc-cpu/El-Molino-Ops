-- El Molino Ops reliability hotfix.
--
-- Authenticated RLS policies in onboarding, training, team announcements, tips,
-- and time clock surfaces call time_clock_employee_id_for_user(auth.uid()).
-- The helper itself is safe for authenticated direct execution: it rejects
-- arbitrary-user lookups for non-management callers and scopes all results to
-- the caller's current location and an active, non-deleted employee record.
--
-- Keep anonymous access closed, but restore authenticated execution so those
-- policies can evaluate rather than fail with an EXECUTE permission error.

grant execute on function public.time_clock_employee_id_for_user(uuid) to authenticated;
revoke execute on function public.time_clock_employee_id_for_user(uuid) from anon;
