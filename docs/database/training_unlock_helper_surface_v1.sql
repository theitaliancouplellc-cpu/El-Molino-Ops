-- El Molino Ops: training unlock arithmetic is an internal primitive.
--
-- The public employee-facing training RPCs already authenticate the caller,
-- scope the assignment to the current location/employee (or management), and then
-- invoke this helper under SECURITY DEFINER. The low-level helper itself accepts
-- arbitrary assignment/course-lesson UUIDs and does not enforce caller ownership,
-- so it must not be directly exposed as a PostgREST RPC to signed-in clients.
--
-- Keep service-role access and postgres-owned SECURITY DEFINER callers working,
-- while removing the direct public/anonymous/authenticated execution surface.

revoke all on function public.training_lesson_is_unlocked(uuid,uuid) from public, anon, authenticated;
grant execute on function public.training_lesson_is_unlocked(uuid,uuid) to service_role;
