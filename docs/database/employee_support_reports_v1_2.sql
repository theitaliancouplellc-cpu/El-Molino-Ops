-- El Molino Ops: optimize Staff support manager-read RLS evaluation.
-- Authorization semantics stay identical; stable request identity/location/role helpers
-- are initplan-cached once per statement instead of being re-evaluated per row.

drop policy if exists employee_support_reports_manager_read on public.employee_support_reports;
create policy employee_support_reports_manager_read on public.employee_support_reports
for select to authenticated
using(
  (select auth.uid()) is not null
  and location_id=(select public.current_location_id())
  and (select public.current_app_role()) in ('admin','manager')
);
