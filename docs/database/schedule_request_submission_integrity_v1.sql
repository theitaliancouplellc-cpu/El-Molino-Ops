-- El Molino Ops: enforce employee schedule-request ownership and consent invariants.
--
-- Direct table writes must not be able to manufacture manager approval, forge a
-- coworker's swap acceptance, or attach manager-only review metadata. The normal
-- employee RPCs remain supported, including a target employee accepting/declining
-- a reciprocal trade through respond_to_my_shift_trade().

create or replace function public.guard_employee_schedule_self_service()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  uid_now uuid := auth.uid();
  role_now public.app_role := public.current_app_role();
  actor_employee uuid;
  shift_employee uuid;
  target_shift_employee uuid;
  source_status text;
  source_ends_at timestamptz;
  target_status text;
begin
  if uid_now is null or role_now in ('admin'::public.app_role,'manager'::public.app_role) then
    return new;
  end if;

  actor_employee := public.current_schedule_employee_id();
  if actor_employee is null then
    raise exception 'active employee account required';
  end if;

  if tg_table_name='employee_availability' then
    if tg_op='UPDATE' and (
      new.location_id is distinct from old.location_id
      or new.employee_id is distinct from old.employee_id
    ) then
      raise exception 'availability ownership cannot be changed';
    end if;

  elsif tg_table_name='time_off_requests' then
    if tg_op='INSERT' then
      if new.location_id is distinct from public.current_location_id()
        or new.employee_id is distinct from actor_employee
        or new.requested_by is distinct from uid_now then
        raise exception 'time-off request must belong to the authenticated employee';
      end if;
      if new.status is distinct from 'pending'
        or new.reviewed_by is not null
        or new.reviewed_at is not null
        or new.manager_note is not null
        or new.employee_cancelled_at is not null then
        raise exception 'employee time-off requests must start pending and unreviewed';
      end if;

    elsif tg_op='UPDATE' then
      if new.location_id is distinct from old.location_id
        or new.employee_id is distinct from old.employee_id
        or new.requested_by is distinct from old.requested_by
        or new.reviewed_by is distinct from old.reviewed_by
        or new.reviewed_at is distinct from old.reviewed_at
        or new.manager_note is distinct from old.manager_note then
        raise exception 'time-off request ownership/review fields cannot be changed';
      end if;
      if old.employee_id is distinct from actor_employee
        or old.requested_by is distinct from uid_now then
        raise exception 'employee may only change their own time-off request';
      end if;
      if old.status<>'pending' or new.status not in ('pending','cancelled') then
        raise exception 'employee may only edit or cancel a pending time-off request';
      end if;
      if new.status='pending' then
        if new.employee_cancelled_at is distinct from old.employee_cancelled_at then
          raise exception 'pending time-off request cannot carry cancellation metadata';
        end if;
      else
        -- Cancellation is an employee action, not a review action. Stamp it here
        -- so direct clients cannot forge somebody else's cancellation timestamp.
        new.employee_cancelled_at := now();
      end if;
    end if;

  elsif tg_table_name='shift_change_requests' then
    if tg_op='INSERT' then
      if new.location_id is distinct from public.current_location_id()
        or new.requested_by is distinct from uid_now
        or new.requested_by_employee_id is distinct from actor_employee then
        raise exception 'shift-change request must belong to the authenticated employee';
      end if;
      if new.request_type not in ('coverage','swap') then
        raise exception 'employees may only request coverage or a reciprocal swap';
      end if;
      if new.status is distinct from 'pending'
        or new.reviewed_by is not null
        or new.reviewed_at is not null
        or new.target_responded_at is not null
        or new.target_responded_by is not null then
        raise exception 'employee shift-change requests must start pending and unreviewed';
      end if;

      select s.employee_id,s.status,s.ends_at
        into shift_employee,source_status,source_ends_at
      from public.schedule_shifts s
      where s.id=new.shift_id and s.location_id=new.location_id;
      if shift_employee is distinct from actor_employee
        or source_status not in ('scheduled','covered')
        or source_ends_at<=now() then
        raise exception 'shift-change request must reference an active future shift owned by the requester';
      end if;

      if new.request_type='coverage' then
        if new.target_shift_id is not null
          or new.target_employee_id is not null
          or new.target_response is distinct from 'not_required' then
          raise exception 'coverage request cannot contain swap consent fields';
        end if;
      else
        if new.target_shift_id is null or new.target_shift_id=new.shift_id then
          raise exception 'swap requires a different target shift';
        end if;
        select s.employee_id,s.status
          into target_shift_employee,target_status
        from public.schedule_shifts s
        where s.id=new.target_shift_id and s.location_id=new.location_id;
        if target_shift_employee is null
          or target_shift_employee=actor_employee
          or target_status not in ('scheduled','covered')
          or new.target_employee_id is distinct from target_shift_employee then
          raise exception 'swap target must match another assigned shift';
        end if;
        if not exists(
          select 1 from public.employees e
          where e.id=target_shift_employee
            and e.location_id=new.location_id
            and e.active
            and e.deleted_at is null
            and coalesce(e.employment_status,'active')='active'
        ) then
          raise exception 'swap target employee is not active';
        end if;
        if new.target_response is distinct from 'pending' then
          raise exception 'swap must wait for the target employee response';
        end if;
      end if;

    elsif tg_op='UPDATE' then
      if new.location_id is distinct from old.location_id
        or new.shift_id is distinct from old.shift_id
        or new.request_type is distinct from old.request_type
        or new.requested_by_employee_id is distinct from old.requested_by_employee_id
        or new.target_employee_id is distinct from old.target_employee_id
        or new.target_shift_id is distinct from old.target_shift_id
        or new.requested_by is distinct from old.requested_by
        or new.reviewed_by is distinct from old.reviewed_by
        or new.reviewed_at is distinct from old.reviewed_at then
        raise exception 'shift-change request identity/review fields cannot be changed';
      end if;

      -- A target employee may respond only to their own pending reciprocal swap.
      -- This branch is what allows the SECURITY DEFINER response RPC to decline
      -- (pending -> denied) while preventing the requester from forging consent.
      if old.request_type='swap'
        and old.status='pending'
        and old.target_response='pending'
        and old.target_employee_id=actor_employee
        and old.requested_by_employee_id is distinct from actor_employee then
        if new.reason is distinct from old.reason then
          raise exception 'target employee may not edit the trade request';
        end if;
        if new.target_response not in ('accepted','declined') then
          raise exception 'invalid trade response';
        end if;
        if new.target_responded_by is distinct from uid_now
          or new.target_responded_at is null then
          raise exception 'trade response must be attributed to the target employee';
        end if;
        if (new.target_response='accepted' and new.status<>'pending')
          or (new.target_response='declined' and new.status<>'denied') then
          raise exception 'trade response status is inconsistent';
        end if;
        return new;
      end if;

      if old.requested_by_employee_id is distinct from actor_employee
        or old.requested_by is distinct from uid_now then
        raise exception 'employee may only edit or cancel their own shift-change request';
      end if;
      if new.target_response is distinct from old.target_response
        or new.target_responded_at is distinct from old.target_responded_at
        or new.target_responded_by is distinct from old.target_responded_by then
        raise exception 'requester may not change coworker response fields';
      end if;
      if old.status<>'pending' or new.status not in ('pending','cancelled') then
        raise exception 'employee may only edit or cancel a pending shift-change request';
      end if;
    end if;
  end if;

  return new;
end
$function$;

-- Defense in depth: direct PostgREST inserts must satisfy the same employee
-- submission invariants before the trigger even evaluates the row.
drop policy if exists time_off_requests_insert on public.time_off_requests;
create policy time_off_requests_insert
on public.time_off_requests
for insert
to authenticated
with check (
  location_id=public.current_location_id()
  and employee_id=public.current_schedule_employee_id()
  and requested_by=(select auth.uid())
  and status='pending'
  and reviewed_by is null
  and reviewed_at is null
  and manager_note is null
  and employee_cancelled_at is null
);

drop policy if exists shift_change_requests_insert on public.shift_change_requests;
create policy shift_change_requests_insert
on public.shift_change_requests
for insert
to authenticated
with check (
  location_id=public.current_location_id()
  and requested_by=(select auth.uid())
  and requested_by_employee_id=public.current_schedule_employee_id()
  and request_type in ('coverage','swap')
  and status='pending'
  and reviewed_by is null
  and reviewed_at is null
  and target_responded_at is null
  and target_responded_by is null
  and (
    (request_type='coverage' and target_shift_id is null and target_employee_id is null and target_response='not_required')
    or
    (request_type='swap' and target_shift_id is not null and target_employee_id is not null and target_response='pending')
  )
);
