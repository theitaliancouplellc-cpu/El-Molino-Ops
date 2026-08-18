-- El Molino Ops: keep low-level SECURITY DEFINER primitives internal.
--
-- Employee-facing training/time-clock RPCs authenticate and scope callers before
-- invoking these helpers. The helpers themselves deliberately accept primitive
-- identifiers and do not perform the full API authorization contract, so exposing
-- them directly through PostgREST creates unnecessary enumeration surfaces.
--
-- All database callers of both helpers are postgres-owned SECURITY DEFINER
-- functions. Keep service-role/internal execution while removing direct
-- public/anonymous/authenticated RPC access.

revoke all on function public.training_lesson_is_unlocked(uuid,uuid) from public, anon, authenticated;
grant execute on function public.training_lesson_is_unlocked(uuid,uuid) to service_role;

revoke all on function public.time_clock_employee_id_for_user(uuid) from public, anon, authenticated;
grant execute on function public.time_clock_employee_id_for_user(uuid) to service_role;
