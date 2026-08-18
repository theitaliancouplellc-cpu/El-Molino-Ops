-- El Molino Ops: a closed pay period is an immutable payroll boundary.
--
-- Every punch mutation that can change payroll evidence now acquires the relevant
-- pay-period row lock before touching the punch. This serializes edits/attestation/
-- approval against period close and prevents a punch from being moved out of a
-- closed historical period into an open one.

create or replace function private.time_clock_lock_open_periods(
  p_location uuid,
  p_timestamps timestamptz[]
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  tz text;
  stamp timestamptz;
  local_date date;
  pp public.time_clock_pay_periods%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_location is null or p_location is distinct from public.current_location_id() then
    raise exception 'time clock location is not available';
  end if;
  if p_timestamps is null or coalesce(array_length(p_timestamps,1),0)=0 then
    raise exception 'at least one punch timestamp is required';
  end if;

  tz:=public.schedule_timezone(p_location);
  foreach stamp in array p_timestamps loop
    if stamp is null then raise exception 'punch timestamp is required'; end if;
    local_date:=(stamp at time zone tz)::date;
    perform public.ensure_time_clock_pay_period(local_date);
  end loop;

  -- Lock every matching period in deterministic date/id order so cross-period
  -- manager edits cannot deadlock one another.
  for pp in
    select p.*
    from public.time_clock_pay_periods p
    where p.location_id=p_location
      and exists(
        select 1
        from unnest(p_timestamps) as x(ts)
        where (x.ts at time zone tz)::date between p.starts_on and p.ends_on
      )
    order by p.starts_on,p.id
    for update
  loop
    if pp.status<>'open' then
      raise exception 'reopen the pay period before changing timecard evidence';
    end if;
  end loop;

  if exists(
    select 1
    from unnest(p_timestamps) as x(ts)
    where not exists(
      select 1
      from public.time_clock_pay_periods p
      where p.location_id=p_location
        and (x.ts at time zone tz)::date between p.starts_on and p.ends_on
        and p.status='open'
    )
  ) then
    raise exception 'an open pay period could not be resolved for the timecard';
  end if;
end
$function$;

revoke all on function private.time_clock_lock_open_periods(uuid,timestamptz[]) from public,anon,authenticated;

create or replace function public.manager_upsert_time_clock_punch(
  p_punch_id uuid,
  p_employee_id uuid,
  p_clock_in timestamptz,
  p_clock_out timestamptz,
  p_note text default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  loc uuid:=public.current_location_id();
  pid uuid;
  sid uuid;
  before_row jsonb;
  after_row jsonb;
  observed_clock_in timestamptz;
  locked_clock_in timestamptz;
begin
  if auth.uid() is null or public.current_app_role() not in ('admin','manager') then
    raise exception 'manager access required';
  end if;
  if not exists(
    select 1 from public.employees
    where id=p_employee_id and location_id=loc and active and deleted_at is null
  ) then raise exception 'active employee not found'; end if;
  if p_clock_in is null then raise exception 'clock in is required'; end if;
  if p_clock_out is not null and p_clock_out<=p_clock_in then
    raise exception 'clock out must be after clock in';
  end if;

  if p_punch_id is null then
    perform private.time_clock_lock_open_periods(loc,array[p_clock_in]);
  else
    -- Discover the original accounting period without holding a punch lock. Then
    -- lock both the original and proposed periods in deterministic period order.
    select p.clock_in into observed_clock_in
    from public.time_clock_punches p
    where p.id=p_punch_id and p.location_id=loc;
    if not found then raise exception 'punch not found'; end if;

    perform private.time_clock_lock_open_periods(loc,array[observed_clock_in,p_clock_in]);

    select to_jsonb(p),p.clock_in into before_row,locked_clock_in
    from public.time_clock_punches p
    where p.id=p_punch_id and p.location_id=loc
    for update;
    if not found then raise exception 'punch not found'; end if;
    if locked_clock_in is distinct from observed_clock_in then
      raise exception 'punch changed concurrently; reload and retry';
    end if;
  end if;

  sid:=public.time_clock_match_shift(p_employee_id,p_clock_in);
  if p_punch_id is null then
    insert into public.time_clock_punches(
      location_id,employee_id,shift_id,clock_in,clock_out,source,note,created_by,updated_by
    ) values(
      loc,p_employee_id,sid,p_clock_in,p_clock_out,'manager',
      nullif(left(trim(coalesce(p_note,'')),2000),''),auth.uid(),auth.uid()
    ) returning id into pid;
    insert into public.time_clock_punch_audit(
      punch_id,location_id,action,actor_user_id,after_data,reason
    )
    select id,loc,'manager_created',auth.uid(),to_jsonb(time_clock_punches),
           nullif(left(trim(coalesce(p_reason,'')),2000),'')
    from public.time_clock_punches where id=pid;
  else
    update public.time_clock_punches
    set employee_id=p_employee_id,shift_id=sid,clock_in=p_clock_in,clock_out=p_clock_out,
        source='manager',note=nullif(left(trim(coalesce(p_note,'')),2000),''),
        manager_approved_by=null,manager_approved_at=null,
        employee_approval_status='pending',employee_approved_at=null,employee_dispute_note=null,
        updated_by=auth.uid(),updated_at=now()
    where id=p_punch_id
    returning id,to_jsonb(time_clock_punches) into pid,after_row;
    insert into public.time_clock_punch_audit(
      punch_id,location_id,action,actor_user_id,before_data,after_data,reason
    ) values(
      pid,loc,'manager_edited',auth.uid(),before_row,after_row,
      nullif(left(trim(coalesce(p_reason,'')),2000),'')
    );
  end if;
  return pid;
end
$function$;

create or replace function public.employee_attest_time_clock_punch(
  p_punch_id uuid,
  p_approved boolean,
  p_dispute_note text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  eid uuid;
  loc uuid:=public.current_location_id();
  observed_clock_in timestamptz;
  p public.time_clock_punches%rowtype;
  cfg public.time_clock_settings%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  eid:=public.time_clock_employee_id_for_user(auth.uid());
  if eid is null then raise exception 'your account is not linked to an active employee'; end if;

  select x.clock_in into observed_clock_in
  from public.time_clock_punches x
  where x.id=p_punch_id and x.employee_id=eid and x.location_id=loc;
  if not found then raise exception 'punch not found'; end if;

  perform private.time_clock_lock_open_periods(loc,array[observed_clock_in]);

  select * into p
  from public.time_clock_punches
  where id=p_punch_id and employee_id=eid and location_id=loc
  for update;
  if not found then raise exception 'punch not found'; end if;
  if p.clock_in is distinct from observed_clock_in then
    raise exception 'punch changed concurrently; reload and retry';
  end if;
  if p.clock_out is null then raise exception 'an open punch cannot be attested'; end if;

  select * into cfg from public.time_clock_settings where location_id=p.location_id;
  if not coalesce(cfg.employee_approval_enabled,true) then
    raise exception 'employee punch approval is disabled';
  end if;

  if p_approved then
    update public.time_clock_punches
    set employee_approval_status='approved',employee_approved_at=now(),employee_dispute_note=null,
        updated_by=auth.uid(),updated_at=now()
    where id=p.id;
  else
    if length(trim(coalesce(p_dispute_note,'')))<3 then
      raise exception 'explain what needs to be corrected';
    end if;
    update public.time_clock_punches
    set employee_approval_status='disputed',employee_approved_at=null,
        employee_dispute_note=left(trim(p_dispute_note),2000),
        manager_approved_by=null,manager_approved_at=null,
        updated_by=auth.uid(),updated_at=now()
    where id=p.id;
  end if;
  return true;
end
$function$;

create or replace function public.manager_approve_time_clock_punch(p_punch_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  loc uuid:=public.current_location_id();
  observed_clock_in timestamptz;
  p public.time_clock_punches%rowtype;
begin
  if auth.uid() is null or public.current_app_role() not in ('admin','manager') then
    raise exception 'manager access required';
  end if;

  select x.clock_in into observed_clock_in
  from public.time_clock_punches x
  where x.id=p_punch_id and x.location_id=loc;
  if not found then raise exception 'punch not found'; end if;

  perform private.time_clock_lock_open_periods(loc,array[observed_clock_in]);

  select * into p
  from public.time_clock_punches
  where id=p_punch_id and location_id=loc
  for update;
  if not found then raise exception 'punch not found'; end if;
  if p.clock_in is distinct from observed_clock_in then
    raise exception 'punch changed concurrently; reload and retry';
  end if;
  if p.clock_out is null then raise exception 'open punches cannot be approved'; end if;
  if exists(select 1 from public.time_clock_breaks where punch_id=p.id and ended_at is null) then
    raise exception 'open breaks must be ended before approval';
  end if;

  update public.time_clock_punches
  set manager_approved_by=auth.uid(),manager_approved_at=now(),updated_by=auth.uid(),updated_at=now()
  where id=p.id;
  insert into public.time_clock_punch_audit(punch_id,location_id,action,actor_user_id,after_data)
  select id,loc,'manager_approved',auth.uid(),to_jsonb(time_clock_punches)
  from public.time_clock_punches where id=p.id;
  return true;
end
$function$;

create or replace function public.manager_approve_all_time_clock_punches(p_pay_period_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  loc uuid:=public.current_location_id();
  pp public.time_clock_pay_periods%rowtype;
  tz text;
  n int;
begin
  if auth.uid() is null or public.current_app_role() not in ('admin','manager') then
    raise exception 'manager access required';
  end if;

  select * into pp
  from public.time_clock_pay_periods
  where id=p_pay_period_id and location_id=loc
  for update;
  if not found then raise exception 'pay period not found'; end if;
  if pp.status<>'open' then raise exception 'reopen the pay period before approving punches'; end if;

  tz:=public.schedule_timezone(loc);
  if exists(
    select 1 from public.time_clock_punches p
    where p.location_id=loc
      and (p.clock_in at time zone tz)::date between pp.starts_on and pp.ends_on
      and p.clock_out is null
  ) then raise exception 'resolve open punches before approving all'; end if;

  update public.time_clock_punches p
  set manager_approved_by=auth.uid(),manager_approved_at=now(),updated_by=auth.uid(),updated_at=now()
  where p.location_id=loc
    and (p.clock_in at time zone tz)::date between pp.starts_on and pp.ends_on
    and p.clock_out is not null
    and p.manager_approved_at is null;
  get diagnostics n=row_count;
  return n;
end
$function$;
