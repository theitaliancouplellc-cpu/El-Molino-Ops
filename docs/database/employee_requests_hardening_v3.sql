-- Applied to production Supabase as migration: employee_requests_hardening_v3
-- Adds a server-authoritative employee Requests Center, partial-day time off, policy enforcement and employee cancellation RPCs.

alter table public.time_off_requests add column if not exists category text;
alter table public.time_off_requests add column if not exists partial_day boolean not null default false;
alter table public.time_off_requests add column if not exists start_time time;
alter table public.time_off_requests add column if not exists end_time time;
alter table public.time_off_requests add column if not exists employee_cancelled_at timestamptz;
alter table public.time_off_requests add column if not exists manager_note text;

alter table public.schedule_settings add column if not exists time_off_min_notice_days integer not null default 0;
alter table public.schedule_settings drop constraint if exists schedule_settings_time_off_min_notice_days_check;
alter table public.schedule_settings add constraint schedule_settings_time_off_min_notice_days_check check(time_off_min_notice_days between 0 and 365);

alter table public.time_off_requests drop constraint if exists time_off_requests_partial_times_check;
alter table public.time_off_requests add constraint time_off_requests_partial_times_check check(
  (partial_day=false and start_time is null and end_time is null)
  or (partial_day=true and start_time is not null and end_time is not null and end_time>start_time)
);

create or replace function public.submit_my_time_off_request(
  p_starts_on date,
  p_ends_on date,
  p_reason text default null,
  p_category text default null,
  p_partial_day boolean default false,
  p_start_time time default null,
  p_end_time time default null
)
returns uuid
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare
  loc uuid:=public.current_location_id();
  uid uuid:=auth.uid();
  eid uuid:=public.current_schedule_employee_id();
  req_id uuid;
  min_notice integer:=0;
  blocked integer:=0;
begin
  if uid is null or loc is null or eid is null or public.current_app_role()<>'employee' then raise exception 'active employee account required'; end if;
  if p_starts_on is null or p_ends_on is null or p_starts_on>p_ends_on then raise exception 'choose a valid time-off date range'; end if;
  if p_starts_on<current_date then raise exception 'time off cannot begin in the past'; end if;
  if coalesce(p_partial_day,false) and p_starts_on<>p_ends_on then raise exception 'partial-day time off must be a single date'; end if;
  if coalesce(p_partial_day,false) and (p_start_time is null or p_end_time is null or p_end_time<=p_start_time) then raise exception 'partial-day time off needs a valid start and end time'; end if;
  if not coalesce(p_partial_day,false) and (p_start_time is not null or p_end_time is not null) then raise exception 'full-day time off cannot include partial-day times'; end if;
  select coalesce(s.time_off_min_notice_days,0) into min_notice from public.schedule_settings s where s.location_id=loc;
  if p_starts_on<current_date+min_notice then raise exception 'time-off request does not meet the minimum notice policy'; end if;
  select count(*) into blocked from public.time_off_blocked_days b where b.location_id=loc and b.blocked_on between p_starts_on and p_ends_on;
  if blocked>0 then raise exception 'one or more requested dates are blocked for time off'; end if;
  if exists(
    select 1 from public.time_off_requests r
    where r.location_id=loc and r.employee_id=eid and r.status in ('pending','approved')
      and daterange(r.starts_on,r.ends_on,'[]') && daterange(p_starts_on,p_ends_on,'[]')
  ) then raise exception 'this request overlaps existing pending or approved time off'; end if;
  insert into public.time_off_requests(location_id,employee_id,starts_on,ends_on,reason,status,category,partial_day,start_time,end_time)
  values(loc,eid,p_starts_on,p_ends_on,nullif(left(trim(coalesce(p_reason,'')),2000),''),'pending',nullif(left(trim(coalesce(p_category,'')),80),''),coalesce(p_partial_day,false),case when p_partial_day then p_start_time else null end,case when p_partial_day then p_end_time else null end)
  returning id into req_id;
  return req_id;
end $$;
revoke all on function public.submit_my_time_off_request(date,date,text,text,boolean,time,time) from public,anon;
grant execute on function public.submit_my_time_off_request(date,date,text,text,boolean,time,time) to authenticated;

create or replace function public.cancel_my_time_off_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare eid uuid:=public.current_schedule_employee_id();
begin
  if auth.uid() is null or eid is null then raise exception 'active employee account required'; end if;
  update public.time_off_requests set status='cancelled',employee_cancelled_at=now(),updated_at=now()
  where id=p_request_id and employee_id=eid and status='pending';
  return found;
end $$;
revoke all on function public.cancel_my_time_off_request(uuid) from public,anon;
grant execute on function public.cancel_my_time_off_request(uuid) to authenticated;

create or replace function public.cancel_my_availability_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare eid uuid:=public.current_schedule_employee_id();
begin
  if auth.uid() is null or eid is null then raise exception 'active employee account required'; end if;
  update public.availability_change_requests set status='cancelled',updated_at=now()
  where id=p_request_id and employee_id=eid and status='pending';
  return found;
end $$;
revoke all on function public.cancel_my_availability_request(uuid) from public,anon;
grant execute on function public.cancel_my_availability_request(uuid) to authenticated;

create or replace function public.my_employee_request_center()
returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','public','auth'
as $$
declare
  loc uuid:=public.current_location_id();
  eid uuid:=public.current_schedule_employee_id();
  result jsonb;
begin
  if auth.uid() is null or loc is null or eid is null then raise exception 'active employee account required'; end if;
  select jsonb_build_object(
    'weekly_availability',coalesce((select jsonb_agg(to_jsonb(a)-'location_id'-'employee_id' order by a.day_of_week,a.id) from public.employee_availability a where a.employee_id=eid),'[]'::jsonb),
    'temporary_availability',coalesce((select jsonb_agg(to_jsonb(o)-'location_id'-'employee_id' order by o.effective_from desc,o.day_of_week,o.id) from public.employee_availability_overrides o where o.employee_id=eid and o.effective_to>=current_date),'[]'::jsonb),
    'availability_requests',coalesce((select jsonb_agg(to_jsonb(q)-'location_id'-'employee_id' order by q.created_at desc) from public.availability_change_requests q where q.employee_id=eid limit 100),'[]'::jsonb),
    'time_off_requests',coalesce((select jsonb_agg(to_jsonb(t)-'location_id'-'employee_id' order by t.created_at desc) from public.time_off_requests t where t.employee_id=eid limit 100),'[]'::jsonb),
    'shift_changes',coalesce((select jsonb_agg(to_jsonb(s)-'location_id'-'requested_by_employee_id' order by s.created_at desc) from public.shift_change_requests s where s.requested_by_employee_id=eid or s.target_employee_id=eid limit 100),'[]'::jsonb),
    'shift_claims',coalesce((select jsonb_agg(to_jsonb(c)-'location_id'-'employee_id' order by c.created_at desc) from public.shift_claims c where c.employee_id=eid limit 100),'[]'::jsonb),
    'blocked_days',coalesce((select jsonb_agg(to_jsonb(b)-'location_id' order by b.blocked_on) from public.time_off_blocked_days b where b.location_id=loc and b.blocked_on>=current_date and b.blocked_on<=current_date+interval '180 days'),'[]'::jsonb),
    'time_off_min_notice_days',coalesce((select s.time_off_min_notice_days from public.schedule_settings s where s.location_id=loc),0)
  ) into result;
  return result;
end $$;
revoke all on function public.my_employee_request_center() from public,anon;
grant execute on function public.my_employee_request_center() to authenticated;

revoke insert,update,delete,truncate,references,trigger on public.time_off_requests from authenticated,anon;
revoke insert,update,delete,truncate,references,trigger on public.availability_change_requests from authenticated,anon;
