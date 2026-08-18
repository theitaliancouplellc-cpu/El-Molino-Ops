-- El Molino Ops: enforce the closed-pay-period boundary at the table itself.
--
-- Function-level checks are defense in depth, but Toast ingestion, future RPCs, or
-- privileged maintenance paths could otherwise mutate a punch without using those
-- wrappers. This trigger locks every matching pay-period row before any punch
-- INSERT/UPDATE and rejects closed history. Clock-in also acquires the period lock
-- before its duplicate-open-punch check so concurrent taps return the intended
-- deterministic error instead of racing into the unique index.

create or replace function private.guard_time_clock_pay_period_mutation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  pp public.time_clock_pay_periods%rowtype;
begin
  if tg_op='INSERT' then
    for pp in
      select p.*
      from public.time_clock_pay_periods p
      where p.location_id=new.location_id
        and (new.clock_in at time zone public.schedule_timezone(p.location_id))::date between p.starts_on and p.ends_on
      order by p.location_id,p.starts_on,p.id
      for update
    loop
      if pp.status<>'open' then
        raise exception 'reopen the pay period before changing timecard evidence';
      end if;
    end loop;
  elsif tg_op='UPDATE' then
    for pp in
      select p.*
      from public.time_clock_pay_periods p
      where (
        p.location_id=old.location_id
        and (old.clock_in at time zone public.schedule_timezone(p.location_id))::date between p.starts_on and p.ends_on
      ) or (
        p.location_id=new.location_id
        and (new.clock_in at time zone public.schedule_timezone(p.location_id))::date between p.starts_on and p.ends_on
      )
      order by p.location_id,p.starts_on,p.id
      for update
    loop
      if pp.status<>'open' then
        raise exception 'reopen the pay period before changing timecard evidence';
      end if;
    end loop;
  end if;
  return new;
end
$function$;

revoke all on function private.guard_time_clock_pay_period_mutation() from public,anon,authenticated;

drop trigger if exists trg_guard_time_clock_pay_period_mutation on public.time_clock_punches;
create trigger trg_guard_time_clock_pay_period_mutation
before insert or update on public.time_clock_punches
for each row execute function private.guard_time_clock_pay_period_mutation();

create or replace function public.time_clock_clock_in_internal(
  p_employee_id uuid,
  p_source text,
  p_lat numeric,
  p_lng numeric,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog','public','private'
as $function$
declare
  e public.employees%rowtype;
  cfg public.time_clock_settings%rowtype;
  sid uuid;
  dist numeric;
  pid uuid;
  now_ts timestamptz:=clock_timestamp();
begin
  select * into e
  from public.employees
  where id=p_employee_id and active and deleted_at is null;
  if not found then raise exception 'active employee not found'; end if;
  if e.location_id<>public.current_location_id() then raise exception 'employee location mismatch'; end if;

  select * into cfg from public.time_clock_settings where location_id=e.location_id;
  if not found or not cfg.enabled then raise exception 'time clocking is disabled'; end if;

  -- Ensure + lock the period before inspecting the unique open-punch invariant.
  -- Concurrent web/mobile/kiosk clock-ins for this location must serialize here.
  perform private.time_clock_lock_open_periods(e.location_id,array[now_ts]);

  if exists(
    select 1 from public.time_clock_punches
    where employee_id=e.id and location_id=e.location_id and clock_out is null
  ) then raise exception 'employee is already clocked in'; end if;

  sid:=public.time_clock_match_shift(e.id,now_ts);
  if cfg.require_scheduled_shift and sid is null then
    raise exception 'a matching scheduled shift is required to clock in';
  end if;
  dist:=public.time_clock_validate_geo(p_source,p_lat,p_lng,e.location_id);

  insert into public.time_clock_punches(
    location_id,employee_id,shift_id,clock_in,source,
    clock_in_latitude,clock_in_longitude,clock_in_distance_meters,created_by,updated_by
  ) values(
    e.location_id,e.id,sid,now_ts,p_source,p_lat,p_lng,dist,p_actor,p_actor
  ) returning id into pid;
  return pid;
end
$function$;

-- Keep this implementation internal: public clock_in and the manager-launched
-- kiosk RPC are the only intended callers.
revoke all on function public.time_clock_clock_in_internal(uuid,text,numeric,numeric,uuid)
from public,anon,authenticated;
grant execute on function public.time_clock_clock_in_internal(uuid,text,numeric,numeric,uuid)
to service_role;
