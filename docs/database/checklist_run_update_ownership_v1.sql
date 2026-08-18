-- El Molino Ops: keep checklist-run ownership and assignment fields manager-controlled.
--
-- Existing RLS constrained which row a non-manager could begin updating, but its
-- WITH CHECK only revalidated the template location. An assigned employee or the
-- original creator could therefore attempt to rewrite the template/assignment/date
-- fields and retain a row in the same location. Preserve those authority-bearing
-- fields across employee updates and make the post-update RLS test mirror the
-- pre-update authority boundary.

create or replace function private.guard_checklist_run_non_manager_update()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null
     or private.current_app_role() in ('admin'::public.app_role,'manager'::public.app_role) then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.checklist_template_id is distinct from old.checklist_template_id
     or new.assigned_employee_id is distinct from old.assigned_employee_id
     or new.assigned_role_id is distinct from old.assigned_role_id
     or new.business_date is distinct from old.business_date
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'checklist assignment and identity fields are manager-controlled';
  end if;

  if old.started_at is not null and new.started_at is distinct from old.started_at then
    raise exception 'checklist start time is immutable once recorded';
  end if;
  if old.completed_at is not null and new.completed_at is distinct from old.completed_at then
    raise exception 'completed checklist cannot be reopened by staff';
  end if;

  if old.started_at is null and new.started_at is not null then
    new.started_at := now();
  end if;
  if old.completed_at is null and new.completed_at is not null then
    new.completed_at := now();
  end if;

  return new;
end
$function$;

revoke all on function private.guard_checklist_run_non_manager_update() from public, anon, authenticated;

drop trigger if exists trg_guard_checklist_run_non_manager_update on public.checklist_runs;
create trigger trg_guard_checklist_run_non_manager_update
before update on public.checklist_runs
for each row execute function private.guard_checklist_run_non_manager_update();

drop policy if exists checklist_runs_update on public.checklist_runs;
create policy checklist_runs_update
on public.checklist_runs
for update
to authenticated
using (
  exists (
    select 1
    from public.checklist_templates c
    where c.id = checklist_runs.checklist_template_id
      and c.location_id = public.current_location_id()
  )
  and (
    public.current_app_role() in ('admin','manager')
    or created_by = (select auth.uid())
    or exists (
      select 1
      from public.employees e
      where e.id = checklist_runs.assigned_employee_id
        and e.location_id = public.current_location_id()
        and e.user_id = (select auth.uid())
        and e.deleted_at is null
    )
  )
)
with check (
  exists (
    select 1
    from public.checklist_templates c
    where c.id = checklist_runs.checklist_template_id
      and c.location_id = public.current_location_id()
  )
  and (
    public.current_app_role() in ('admin','manager')
    or created_by = (select auth.uid())
    or exists (
      select 1
      from public.employees e
      where e.id = checklist_runs.assigned_employee_id
        and e.location_id = public.current_location_id()
        and e.user_id = (select auth.uid())
        and e.deleted_at is null
    )
  )
);
