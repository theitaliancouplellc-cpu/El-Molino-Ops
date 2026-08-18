-- El Molino Ops: a run item must belong to the same checklist template as its run.
--
-- checklist_run_items has independent foreign keys to checklist_runs and
-- checklist_template_items. Without this cross-reference invariant, a caller who
-- may update a run could try to attach a valid item UUID from a different template.
-- Enforce the relationship twice: at the RLS boundary for authenticated inserts
-- and with a table trigger so privileged/internal writes cannot create drift.

create or replace function private.guard_checklist_run_item_template_match()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  run_template uuid;
  item_template uuid;
begin
  select r.checklist_template_id
    into run_template
  from public.checklist_runs r
  where r.id = new.checklist_run_id;

  select i.checklist_template_id
    into item_template
  from public.checklist_template_items i
  where i.id = new.template_item_id;

  if run_template is null
     or item_template is null
     or run_template is distinct from item_template then
    raise exception 'checklist run item must belong to the run template';
  end if;

  return new;
end
$function$;

revoke all on function private.guard_checklist_run_item_template_match() from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_checklist_run_item_template_match on public.checklist_run_items;
create trigger trg_guard_checklist_run_item_template_match
before insert or update of checklist_run_id, template_item_id
on public.checklist_run_items
for each row execute function private.guard_checklist_run_item_template_match();

-- Mirror the same invariant in the authenticated INSERT policy.
drop policy if exists checklist_run_items_insert on public.checklist_run_items;
create policy checklist_run_items_insert
on public.checklist_run_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.checklist_runs r
    join public.checklist_templates c
      on c.id = r.checklist_template_id
    join public.checklist_template_items i
      on i.id = checklist_run_items.template_item_id
     and i.checklist_template_id = r.checklist_template_id
    left join public.employees e
      on e.id = r.assigned_employee_id
    where r.id = checklist_run_items.checklist_run_id
      and c.location_id = public.current_location_id()
      and (
        public.current_app_role() in ('admin','manager')
        or r.created_by = (select auth.uid())
        or (
          e.user_id = (select auth.uid())
          and e.location_id = c.location_id
          and e.deleted_at is null
        )
      )
  )
);

-- Trigger functions are invoked by PostgreSQL, not as client RPCs. Remove legacy
-- default EXECUTE grants from the remaining private trigger helpers.
revoke all on function private.guard_non_manager_comment_update() from public, anon, authenticated, service_role;
revoke all on function private.guard_non_manager_task_update() from public, anon, authenticated, service_role;
revoke all on function private.guard_row_identity() from public, anon, authenticated, service_role;
