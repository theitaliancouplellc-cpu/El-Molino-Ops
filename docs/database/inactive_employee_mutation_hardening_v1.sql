-- El Molino Ops: terminated/inactive employee accounts must lose mutation authority
-- immediately even if their auth/profile session still exists.
--
-- Manager/admin authority remains unchanged. Employee task and operational-record
-- updates now require current_schedule_employee_id(), which only resolves an active,
-- non-deleted employee in the caller's current location.

create or replace function public.guard_task_employee_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  role_now app_role;
  actor_employee uuid;
  is_assignee boolean;
begin
  if auth.uid() is null then return new; end if;
  role_now := public.current_app_role();
  if role_now in ('admin'::app_role,'manager'::app_role) then return new; end if;

  actor_employee := public.current_schedule_employee_id();
  if actor_employee is null then
    raise exception 'active employee account required';
  end if;

  select (
    old.assigned_user_id=auth.uid()
    or old.assigned_employee_id=actor_employee
  ) into is_assignee;
  if not coalesce(is_assignee,false) then raise exception 'task update not allowed'; end if;

  if new.location_id is distinct from old.location_id
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.priority is distinct from old.priority
     or new.assigned_user_id is distinct from old.assigned_user_id
     or new.assigned_employee_id is distinct from old.assigned_employee_id
     or new.assigned_role_id is distinct from old.assigned_role_id
     or new.due_at is distinct from old.due_at
     or new.recurrence_rule is distinct from old.recurrence_rule
     or new.source_type is distinct from old.source_type
     or new.source_id is distinct from old.source_id
     or new.created_by is distinct from old.created_by
     or new.deleted_at is distinct from old.deleted_at then
    raise exception 'assignees may only update task progress';
  end if;
  if new.status not in ('open','in_progress','done') then raise exception 'assignee status transition not allowed'; end if;
  if new.status='done' and old.status<>'done' then
    new.completed_at:=now();
  elsif new.status<>'done' then
    new.completed_at:=null;
  end if;
  new.updated_at:=now();
  return new;
end
$function$;

create or replace function public.guard_ops_employee_update()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  uid uuid := auth.uid();
  role_now public.app_role;
  actor_employee uuid;
  allowed boolean := false;
  employee_ok boolean := false;
begin
  if uid is null then return new; end if;
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'operational record identity fields are immutable';
  end if;
  role_now := public.current_app_role();
  if role_now in ('admin'::public.app_role,'manager'::public.app_role) then
    new.updated_by := uid;
    return new;
  end if;

  actor_employee := public.current_schedule_employee_id();
  if actor_employee is null then
    raise exception 'active employee account required';
  end if;

  select (
    old.created_by=uid
    or old.assigned_user_id=uid
    or old.assigned_employee_id=actor_employee
  ) into allowed;
  if not coalesce(allowed,false) then raise exception 'operational record update not allowed'; end if;

  if new.location_id is distinct from old.location_id
     or new.kind is distinct from old.kind
     or new.sensitivity is distinct from old.sensitivity
     or new.priority is distinct from old.priority
     or new.assigned_user_id is distinct from old.assigned_user_id
     or new.assigned_employee_id is distinct from old.assigned_employee_id
     or new.created_by is distinct from old.created_by
     or new.deleted_at is distinct from old.deleted_at
     or new.archived_at is distinct from old.archived_at then
    raise exception 'restricted operational fields are manager-managed';
  end if;
  if old.kind in ('incident','temperature_log') then
    raise exception 'submitted safety records require manager changes';
  end if;
  if old.kind='training_progress' then
    select (old.assigned_employee_id=actor_employee or old.assigned_user_id=uid) into employee_ok;
    if not employee_ok then raise exception 'training record is not assigned to this employee'; end if;
    if new.title is distinct from old.title
       or new.tags is distinct from old.tags
       or new.due_at is distinct from old.due_at
       or new.occurred_at is distinct from old.occurred_at then
      raise exception 'only training completion may be changed';
    end if;
    if old.status='completed' or new.status<>'completed' then raise exception 'invalid training status transition'; end if;
    if (new.data-'completed_at') is distinct from (old.data-'completed_at') or nullif(new.data->>'completed_at','') is null then
      raise exception 'only completed_at may be added to training data';
    end if;
  end if;
  new.updated_by := uid;
  new.updated_at := now();
  return new;
end
$function$;

drop policy if exists tasks_assignee_or_manager_update on public.tasks;
create policy tasks_assignee_or_manager_update
on public.tasks
for update
to authenticated
using (
  location_id=public.current_location_id()
  and (
    public.current_app_role() in ('admin'::public.app_role,'manager'::public.app_role)
    or (
      public.current_schedule_employee_id() is not null
      and (
        assigned_user_id=(select auth.uid())
        or assigned_employee_id=public.current_schedule_employee_id()
      )
    )
  )
)
with check (location_id=public.current_location_id());

drop policy if exists ops_records_update on public.ops_records;
create policy ops_records_update
on public.ops_records
for update
to authenticated
using (
  location_id=public.current_location_id()
  and (
    public.current_app_role() in ('admin'::public.app_role,'manager'::public.app_role)
    or (
      public.current_schedule_employee_id() is not null
      and (
        created_by=(select auth.uid())
        or assigned_user_id=(select auth.uid())
        or assigned_employee_id=public.current_schedule_employee_id()
      )
    )
  )
)
with check (location_id=public.current_location_id());
