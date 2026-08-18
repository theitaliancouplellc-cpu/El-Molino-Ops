-- El Molino Ops: closed payroll must be historically stable.
--
-- A closed period previously recalculated estimated wages from today's employee
-- hourly rates and today's overtime/workweek settings. Later configuration changes
-- could therefore rewrite the apparent payroll history without touching a punch.
-- Closed periods now persist the exact approved payroll report at close time and
-- closed-report reads return that immutable snapshot. Pay-period date ranges are
-- also prevented from overlapping, and cadence/anchor changes are rejected after
-- period history exists instead of silently creating ambiguous accounting windows.

alter table public.time_clock_pay_periods
  add column if not exists payroll_snapshot jsonb,
  add column if not exists payroll_snapshot_at timestamptz,
  add column if not exists payroll_snapshot_by uuid;

do $guard$
begin
  if exists(
    select 1 from public.time_clock_pay_periods
    where status='closed' and (payroll_snapshot is null or payroll_snapshot_at is null)
  ) then
    raise exception 'legacy closed pay periods require an explicit payroll snapshot before this migration';
  end if;
end
$guard$;

alter table public.time_clock_pay_periods
  drop constraint if exists time_clock_pay_period_snapshot_state_chk;
alter table public.time_clock_pay_periods
  add constraint time_clock_pay_period_snapshot_state_chk check (
    (status='open' and payroll_snapshot is null and payroll_snapshot_at is null)
    or
    (status='closed' and payroll_snapshot is not null and payroll_snapshot_at is not null)
  );

alter table public.time_clock_pay_periods
  drop constraint if exists time_clock_pay_periods_no_overlap;
alter table public.time_clock_pay_periods
  add constraint time_clock_pay_periods_no_overlap
  exclude using gist (
    location_id with =,
    daterange(starts_on,ends_on,'[]') with &&
  );

create or replace function public.guard_time_clock_settings()
returns trigger
language plpgsql
set search_path to 'pg_catalog','public'
as $function$
begin
  if new.location_id<>public.current_location_id() then
    raise exception 'time clock settings location mismatch';
  end if;
  if new.geofence_enabled and (new.geofence_latitude is null or new.geofence_longitude is null) then
    raise exception 'geofence coordinates are required when geofencing is enabled';
  end if;

  if tg_op='UPDATE'
     and (
       new.pay_period_frequency is distinct from old.pay_period_frequency
       or new.pay_period_anchor is distinct from old.pay_period_anchor
     )
     and exists(
       select 1 from public.time_clock_pay_periods p
       where p.location_id=old.location_id
     ) then
    raise exception 'pay-period cadence cannot change after payroll periods exist';
  end if;

  if tg_op='INSERT' then
    new.created_by:=auth.uid();
    new.created_at:=now();
  else
    new.created_by:=old.created_by;
    new.created_at:=old.created_at;
  end if;
  new.updated_by:=auth.uid();
  new.updated_at:=now();
  return new;
end
$function$;

create or replace function public.ensure_time_clock_pay_period(p_date date default current_date)
returns public.time_clock_pay_periods
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  loc uuid:=public.current_location_id();
  cfg public.time_clock_settings%rowtype;
  span_days int;
  delta int;
  start_date date;
  out_row public.time_clock_pay_periods%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into cfg from public.time_clock_settings where location_id=loc;
  if not found then
    insert into public.time_clock_settings(location_id) values(loc) returning * into cfg;
  end if;
  span_days:=case cfg.pay_period_frequency when 'weekly' then 7 else 14 end;
  delta:=p_date-cfg.pay_period_anchor;
  start_date:=cfg.pay_period_anchor + (floor(delta::numeric/span_days)::int*span_days);

  begin
    insert into public.time_clock_pay_periods(location_id,starts_on,ends_on)
    values(loc,start_date,start_date+span_days-1)
    on conflict(location_id,starts_on) do update
      set updated_at=public.time_clock_pay_periods.updated_at
    returning * into out_row;
  exception when exclusion_violation then
    raise exception 'pay-period cadence overlaps existing payroll history';
  end;
  return out_row;
end
$function$;

create or replace function public.time_clock_worked_hours_wages(
  p_pay_period_id uuid,
  p_approved_only boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  loc uuid:=public.current_location_id();
  pp public.time_clock_pay_periods%rowtype;
  tz text;
  cfg public.time_clock_settings%rowtype;
  ot_after numeric:=40;
  ot_mult numeric:=1.5;
  rows jsonb;
  summary jsonb;
begin
  if auth.uid() is null or public.current_app_role() not in ('admin','manager') then
    raise exception 'manager access required';
  end if;
  select * into pp
  from public.time_clock_pay_periods
  where id=p_pay_period_id and location_id=loc;
  if not found then raise exception 'pay period not found'; end if;

  if pp.status='closed' then
    if pp.payroll_snapshot is null then
      raise exception 'closed pay period is missing its payroll snapshot';
    end if;
    return pp.payroll_snapshot;
  end if;

  tz:=public.schedule_timezone(loc);
  select * into cfg from public.time_clock_settings where location_id=loc;
  select coalesce(overtime_after_hours,40),coalesce(overtime_multiplier,1.5)
    into ot_after,ot_mult
  from public.schedule_settings
  where location_id=loc;

  with base as (
    select p.id,p.employee_id,e.full_name,p.clock_in,p.clock_out,p.manager_approved_at,
      p.employee_approval_status,coalesce(sp.hourly_rate,0) hourly_rate,
      greatest(
        0::numeric,
        extract(epoch from (p.clock_out-p.clock_in))/3600.0
        -coalesce((
          select sum(extract(epoch from (b.ended_at-b.started_at))/3600.0)
          from public.time_clock_breaks b
          where b.punch_id=p.id and not b.paid and b.ended_at is not null and b.deleted_at is null
        ),0)
      ) worked_hours,
      ((p.clock_in at time zone tz)::date
        -((extract(dow from (p.clock_in at time zone tz)::date)::int-cfg.workweek_starts_on+7)%7))::date workweek_start
    from public.time_clock_punches p
    join public.employees e on e.id=p.employee_id
    left join public.employee_schedule_profiles sp
      on sp.employee_id=p.employee_id and sp.location_id=p.location_id
    where p.location_id=loc
      and p.clock_out is not null
      and (p.clock_in at time zone tz)::date between pp.starts_on and pp.ends_on
      and (not p_approved_only or p.manager_approved_at is not null)
  ), weekly as (
    select employee_id,workweek_start,sum(worked_hours) week_hours,max(hourly_rate) hourly_rate
    from base group by employee_id,workweek_start
  ), premiums as (
    select employee_id,
      sum(greatest(week_hours-ot_after,0)) overtime_hours,
      sum(greatest(week_hours-ot_after,0)*hourly_rate*greatest(ot_mult-1,0)) overtime_premium
    from weekly group by employee_id
  ), employee_rows as (
    select b.employee_id,max(b.full_name) full_name,round(sum(b.worked_hours),2) worked_hours,
      max(b.hourly_rate) hourly_rate,round(sum(b.worked_hours)*max(b.hourly_rate),2) base_wages,
      round(coalesce(max(pr.overtime_hours),0),2) overtime_hours,
      round(coalesce(max(pr.overtime_premium),0),2) overtime_premium,
      round(sum(b.worked_hours)*max(b.hourly_rate)+coalesce(max(pr.overtime_premium),0),2) estimated_wages,
      count(*) punches
    from base b
    left join premiums pr on pr.employee_id=b.employee_id
    group by b.employee_id
  )
  select
    coalesce(jsonb_agg(to_jsonb(employee_rows) order by full_name),'[]'::jsonb),
    jsonb_build_object(
      'employees',count(*),
      'worked_hours',round(coalesce(sum(worked_hours),0),2),
      'base_wages',round(coalesce(sum(base_wages),0),2),
      'overtime_hours',round(coalesce(sum(overtime_hours),0),2),
      'overtime_premium',round(coalesce(sum(overtime_premium),0),2),
      'estimated_wages',round(coalesce(sum(estimated_wages),0),2)
    )
  into rows,summary
  from employee_rows;

  return jsonb_build_object(
    'pay_period',jsonb_build_object(
      'id',pp.id,'starts_on',pp.starts_on,'ends_on',pp.ends_on,'status',pp.status
    ),
    'approved_only',p_approved_only,
    'rules',jsonb_build_object(
      'timezone',tz,
      'workweek_starts_on',cfg.workweek_starts_on,
      'overtime_after_hours',ot_after,
      'overtime_multiplier',ot_mult
    ),
    'rows',rows,
    'summary',summary
  );
end
$function$;

create or replace function public.close_time_clock_pay_period(p_pay_period_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  loc uuid:=public.current_location_id();
  pp public.time_clock_pay_periods%rowtype;
  tz text;
  cfg public.time_clock_settings%rowtype;
  snapshot jsonb;
  snap_at timestamptz:=clock_timestamp();
begin
  if auth.uid() is null or public.current_app_role() not in ('admin','manager') then
    raise exception 'manager access required';
  end if;
  select * into pp
  from public.time_clock_pay_periods
  where id=p_pay_period_id and location_id=loc
  for update;
  if not found then raise exception 'pay period not found'; end if;
  if pp.status='closed' then return true; end if;

  tz:=public.schedule_timezone(loc);
  select * into cfg from public.time_clock_settings where location_id=loc;
  if exists(
    select 1 from public.time_clock_punches p
    where p.location_id=loc
      and (p.clock_in at time zone tz)::date between pp.starts_on and pp.ends_on
      and p.clock_out is null
  ) then raise exception 'resolve all open punches before closing the pay period'; end if;
  if exists(
    select 1 from public.time_clock_punches p
    where p.location_id=loc
      and (p.clock_in at time zone tz)::date between pp.starts_on and pp.ends_on
      and p.clock_out is not null
      and p.manager_approved_at is null
  ) then raise exception 'approve all punches before closing the pay period'; end if;
  if coalesce(cfg.employee_approval_enabled,true) and exists(
    select 1 from public.time_clock_punches p
    where p.location_id=loc
      and (p.clock_in at time zone tz)::date between pp.starts_on and pp.ends_on
      and p.clock_out is not null
      and p.employee_approval_status<>'approved'
  ) then raise exception 'all employee timecards must be approved before closing the pay period'; end if;

  snapshot:=public.time_clock_worked_hours_wages(pp.id,true);
  snapshot:=jsonb_set(snapshot,'{pay_period,status}','"closed"'::jsonb,false)
    || jsonb_build_object('snapshot_at',snap_at,'snapshot_by',auth.uid());

  update public.time_clock_pay_periods
  set status='closed',closed_by=auth.uid(),closed_at=snap_at,
      payroll_snapshot=snapshot,payroll_snapshot_at=snap_at,payroll_snapshot_by=auth.uid(),
      updated_at=now()
  where id=pp.id;
  return true;
end
$function$;

create or replace function public.reopen_time_clock_pay_period(p_pay_period_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  loc uuid:=public.current_location_id();
  pp public.time_clock_pay_periods%rowtype;
begin
  if auth.uid() is null or public.current_app_role() not in ('admin','manager') then
    raise exception 'manager access required';
  end if;
  select * into pp
  from public.time_clock_pay_periods
  where id=p_pay_period_id and location_id=loc
  for update;
  if not found then raise exception 'pay period not found'; end if;
  if pp.status='open' then return true; end if;

  update public.time_clock_pay_periods
  set status='open',reopened_by=auth.uid(),reopened_at=now(),closed_by=null,closed_at=null,
      payroll_snapshot=null,payroll_snapshot_at=null,payroll_snapshot_by=null,updated_at=now()
  where id=pp.id;
  return true;
end
$function$;
