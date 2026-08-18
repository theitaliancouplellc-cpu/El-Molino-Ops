-- El Molino Ops: make employee availability private by default.
-- Managers/admins need location-wide visibility for scheduling; employees may read
-- only their own recurring and temporary availability records.

drop policy if exists employee_availability_select on public.employee_availability;
create policy employee_availability_select
on public.employee_availability
for select
to authenticated
using (
  location_id = public.current_location_id()
  and (
    public.current_app_role() in ('admin','manager')
    or exists (
      select 1
      from public.employees e
      where e.id = employee_availability.employee_id
        and e.location_id = employee_availability.location_id
        and e.user_id = auth.uid()
        and e.deleted_at is null
    )
  )
);

drop policy if exists employee_availability_overrides_read on public.employee_availability_overrides;
create policy employee_availability_overrides_read
on public.employee_availability_overrides
for select
to authenticated
using (
  location_id = public.current_location_id()
  and (
    public.current_app_role() in ('admin','manager')
    or exists (
      select 1
      from public.employees e
      where e.id = employee_availability_overrides.employee_id
        and e.location_id = employee_availability_overrides.location_id
        and e.user_id = auth.uid()
        and e.deleted_at is null
    )
  )
);
