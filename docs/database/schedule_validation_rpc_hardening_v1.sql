-- El Molino Ops: schedule validation is management-only evidence.
-- Employees should not be able to use SECURITY DEFINER helpers to enumerate
-- staffing coverage or hidden coverage requirements.

create or replace function public.schedule_period_validation(p_period_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  p public.schedule_periods%rowtype;tz text;req record;d date;assigned_count integer;issues jsonb:='[]'::jsonb;require_full boolean:=true;st timestamptz;en timestamptz;
begin
  if auth.uid() is null or public.current_app_role() not in ('admin','manager') then raise exception 'manager access required'; end if;
  select * into p from public.schedule_periods where id=p_period_id;
  if not found or p.location_id<>public.current_location_id() then raise exception 'schedule period not found'; end if;
  tz:=public.schedule_timezone(p.location_id);select coalesce(s.require_full_coverage_to_publish,true) into require_full from public.schedule_settings s where s.location_id=p.location_id;require_full:=coalesce(require_full,true);
  for d in select generate_series(p.starts_on,p.ends_on,interval '1 day')::date loop
    for req in select r.* from public.schedule_coverage_requirements r where r.location_id=p.location_id and r.active and r.day_of_week=extract(dow from d)::integer and (r.effective_from is null or r.effective_from<=d) and (r.effective_to is null or r.effective_to>=d) loop
      st:=(d+req.starts_at) at time zone tz;en:=(d+req.ends_at) at time zone tz;assigned_count:=public.schedule_minimum_assigned_coverage(p.id,req.role_id,st,en);
      if assigned_count<req.min_staff then issues:=issues||jsonb_build_array(jsonb_build_object('severity',case when require_full then 'error' else 'warning' end,'code','under_minimum_coverage','date',d,'requirement_id',req.id,'name',req.name,'required',req.min_staff,'assigned',assigned_count));
      elsif assigned_count<req.target_staff then issues:=issues||jsonb_build_array(jsonb_build_object('severity','warning','code','below_target_coverage','date',d,'requirement_id',req.id,'name',req.name,'target',req.target_staff,'assigned',assigned_count)); end if;
    end loop;
  end loop;
  if exists(select 1 from public.schedule_shifts s where s.schedule_period_id=p.id and s.status='open') then issues:=issues||jsonb_build_array(jsonb_build_object('severity','warning','code','open_shifts','count',(select count(*) from public.schedule_shifts s where s.schedule_period_id=p.id and s.status='open'))); end if;
  if exists(select 1 from public.schedule_shifts s where s.schedule_period_id=p.id and s.status='callout') then issues:=issues||jsonb_build_array(jsonb_build_object('severity','warning','code','callouts','count',(select count(*) from public.schedule_shifts s where s.schedule_period_id=p.id and s.status='callout'))); end if;
  return issues;
end
$function$;

create or replace function public.schedule_department_validation(p_period_id uuid, p_department text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare p public.schedule_periods%rowtype;tz text;req record;d date;assigned_count integer;issues jsonb:='[]'::jsonb;require_full boolean:=true;st timestamptz;en timestamptz;
begin
  if auth.uid() is null or public.current_app_role() not in ('admin','manager') then raise exception 'manager access required'; end if;
  if p_department not in ('foh','boh','management','other') then raise exception 'invalid department'; end if;
  select * into p from public.schedule_periods where id=p_period_id;if not found or p.location_id<>public.current_location_id() then raise exception 'schedule period not found'; end if;
  tz:=public.schedule_timezone(p.location_id);select coalesce(s.require_full_coverage_to_publish,true) into require_full from public.schedule_settings s where s.location_id=p.location_id;require_full:=coalesce(require_full,true);
  for d in select generate_series(p.starts_on,p.ends_on,interval '1 day')::date loop
    for req in select r.* from public.schedule_coverage_requirements r join public.employee_roles er on er.id=r.role_id where r.location_id=p.location_id and r.active and coalesce(r.department,er.department,'other')=p_department and r.day_of_week=extract(dow from d)::int and (r.effective_from is null or r.effective_from<=d) and (r.effective_to is null or r.effective_to>=d) loop
      st:=(d+req.starts_at) at time zone tz;en:=(d+req.ends_at) at time zone tz;assigned_count:=public.schedule_minimum_assigned_coverage(p.id,req.role_id,st,en);
      if assigned_count<req.min_staff then issues:=issues||jsonb_build_array(jsonb_build_object('severity',case when require_full then 'error' else 'warning' end,'code','under_minimum_coverage','department',p_department,'date',d,'requirement_id',req.id,'name',req.name,'required',req.min_staff,'assigned',assigned_count));
      elsif assigned_count<req.target_staff then issues:=issues||jsonb_build_array(jsonb_build_object('severity','warning','code','below_target_coverage','department',p_department,'date',d,'requirement_id',req.id,'name',req.name,'target',req.target_staff,'assigned',assigned_count)); end if;
    end loop;
  end loop;
  if exists(select 1 from public.schedule_shifts s join public.employee_roles er on er.id=s.role_id where s.schedule_period_id=p.id and s.status='open' and coalesce(er.department,'other')=p_department) then issues:=issues||jsonb_build_array(jsonb_build_object('severity','warning','code','open_shifts','department',p_department,'count',(select count(*) from public.schedule_shifts s join public.employee_roles er on er.id=s.role_id where s.schedule_period_id=p.id and s.status='open' and coalesce(er.department,'other')=p_department))); end if;
  return issues;
end
$function$;

-- Internal coverage arithmetic is consumed by the management-only validation
-- functions above. Remove the direct authenticated RPC surface so a staff client
-- cannot probe arbitrary period/role UUIDs under SECURITY DEFINER privileges.
revoke all on function public.schedule_minimum_assigned_coverage(uuid,uuid,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.schedule_minimum_assigned_coverage(uuid,uuid,timestamptz,timestamptz) to service_role;

-- The underlying staffing template is manager configuration, not employee data.
drop policy if exists schedule_coverage_read on public.schedule_coverage_requirements;
create policy schedule_coverage_read
on public.schedule_coverage_requirements
for select
to authenticated
using (
  location_id = public.current_location_id()
  and public.current_app_role() in ('admin','manager')
);
