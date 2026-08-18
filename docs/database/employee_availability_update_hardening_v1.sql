-- El Molino Ops: prevent an employee from reassigning an availability row to another employee.
-- The previous UPDATE policy correctly scoped the existing row in USING, but its
-- WITH CHECK clause validated only the location. An employee who owned a row could
-- therefore attempt to change employee_id to a coworker in the same location.

drop policy if exists employee_availability_update on public.employee_availability;
create policy employee_availability_update
on public.employee_availability
for update
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
)
with check (
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
