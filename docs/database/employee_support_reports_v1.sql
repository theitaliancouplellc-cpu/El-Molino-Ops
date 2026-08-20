-- El Molino Ops: durable Staff support / problem reports.
-- Staff mutations are RPC-only. Managers/admins receive read-only location-scoped
-- table access so the existing recovery export can include these durable records.

create table if not exists public.employee_support_reports(
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id),
  employee_id uuid not null references public.employees(id),
  user_id uuid not null references public.profiles(id),
  client_request_id uuid not null,
  request_fingerprint text not null,
  category text not null,
  summary text not null,
  description text not null,
  route text,
  release_sha text,
  platform text not null default 'unknown',
  app_version text,
  connectivity text not null default 'unknown',
  error_id text,
  status text not null default 'open',
  manager_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  constraint employee_support_reports_category_check check(category in ('account','schedule','requests','messages','notifications','app_error','other')),
  constraint employee_support_reports_summary_check check(char_length(summary) between 5 and 160),
  constraint employee_support_reports_description_check check(char_length(description) between 10 and 4000),
  constraint employee_support_reports_route_check check(route is null or (char_length(route)<=240 and route ~ '^/[A-Za-z0-9/_-]*$')),
  constraint employee_support_reports_release_sha_check check(release_sha is null or release_sha ~ '^[0-9a-f]{40}$'),
  constraint employee_support_reports_platform_check check(platform in ('web','ios','android','unknown')),
  constraint employee_support_reports_app_version_check check(app_version is null or char_length(app_version)<=80),
  constraint employee_support_reports_connectivity_check check(connectivity in ('online','offline','unknown')),
  constraint employee_support_reports_error_id_check check(error_id is null or (char_length(error_id)<=120 and error_id ~ '^[A-Za-z0-9._:-]+$')),
  constraint employee_support_reports_status_check check(status in ('open','acknowledged','resolved','closed')),
  constraint employee_support_reports_manager_note_check check(manager_note is null or char_length(manager_note)<=2000),
  constraint employee_support_reports_request_fingerprint_check check(request_fingerprint ~ '^[0-9a-f]{32}$'),
  constraint employee_support_reports_user_request_unique unique(user_id,client_request_id)
);

create index if not exists employee_support_reports_location_status_idx on public.employee_support_reports(location_id,status,submitted_at desc);
create index if not exists employee_support_reports_employee_idx on public.employee_support_reports(employee_id,submitted_at desc);
create index if not exists employee_support_reports_reviewed_by_idx on public.employee_support_reports(reviewed_by) where reviewed_by is not null;

alter table public.employee_support_reports enable row level security;
revoke all on table public.employee_support_reports from public,anon,authenticated;
grant select on table public.employee_support_reports to authenticated;

drop policy if exists employee_support_reports_manager_read on public.employee_support_reports;
create policy employee_support_reports_manager_read on public.employee_support_reports
for select to authenticated
using(
  auth.uid() is not null
  and location_id=public.current_location_id()
  and public.current_app_role() in ('admin','manager')
);

create or replace function public.submit_employee_support_report(
  p_client_request_id uuid,
  p_category text,
  p_summary text,
  p_description text,
  p_route text default null,
  p_release_sha text default null,
  p_platform text default 'unknown',
  p_app_version text default null,
  p_connectivity text default 'unknown',
  p_error_id text default null
) returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare
  loc uuid:=public.current_location_id();
  uid uuid:=auth.uid();
  eid uuid;
  category_value text:=lower(trim(coalesce(p_category,'')));
  summary_value text:=trim(replace(coalesce(p_summary,''),chr(0),''));
  description_value text:=trim(replace(coalesce(p_description,''),chr(0),''));
  route_value text:=nullif(trim(coalesce(p_route,'')),'');
  release_value text:=nullif(lower(trim(coalesce(p_release_sha,''))),'');
  platform_value text:=lower(trim(coalesce(p_platform,'unknown')));
  version_value text:=nullif(trim(replace(coalesce(p_app_version,''),chr(0),'')),'');
  connectivity_value text:=lower(trim(coalesce(p_connectivity,'unknown')));
  error_value text:=nullif(trim(coalesce(p_error_id,'')),'');
  fingerprint text;
  existing public.employee_support_reports%rowtype;
  report_id uuid;
begin
  if uid is null or loc is null or public.current_app_role()<>'employee' then
    raise exception 'employee account required';
  end if;
  select id into eid from public.employees
   where location_id=loc and user_id=uid and active and deleted_at is null and employment_status='active'
   limit 1;
  if eid is null then raise exception 'active approved employee profile required';end if;
  if p_client_request_id is null then raise exception 'request id required';end if;
  if category_value not in ('account','schedule','requests','messages','notifications','app_error','other') then raise exception 'invalid support category';end if;
  if char_length(summary_value)<5 or char_length(summary_value)>160 then raise exception 'summary must be 5 to 160 characters';end if;
  if char_length(description_value)<10 or char_length(description_value)>4000 then raise exception 'description must be 10 to 4000 characters';end if;
  if route_value is not null and (char_length(route_value)>240 or route_value !~ '^/[A-Za-z0-9/_-]*$') then raise exception 'invalid diagnostic route';end if;
  if release_value is not null and release_value !~ '^[0-9a-f]{40}$' then raise exception 'invalid release identity';end if;
  if platform_value not in ('web','ios','android','unknown') then raise exception 'invalid platform';end if;
  if version_value is not null and char_length(version_value)>80 then raise exception 'invalid app version';end if;
  if connectivity_value not in ('online','offline','unknown') then raise exception 'invalid connectivity state';end if;
  if error_value is not null and (char_length(error_value)>120 or error_value !~ '^[A-Za-z0-9._:-]+$') then raise exception 'invalid error reference';end if;

  fingerprint:=md5(concat_ws(chr(31),category_value,summary_value,description_value,coalesce(route_value,''),coalesce(release_value,''),platform_value,coalesce(version_value,''),connectivity_value,coalesce(error_value,'')));
  select * into existing from public.employee_support_reports where user_id=uid and client_request_id=p_client_request_id;
  if found then
    if existing.request_fingerprint<>fingerprint then raise exception 'request id already used for different report';end if;
    return jsonb_build_object('ok',true,'id',existing.id,'status',existing.status,'submitted_at',existing.submitted_at,'deduplicated',true);
  end if;

  insert into public.employee_support_reports(location_id,employee_id,user_id,client_request_id,request_fingerprint,category,summary,description,route,release_sha,platform,app_version,connectivity,error_id)
  values(loc,eid,uid,p_client_request_id,fingerprint,category_value,summary_value,description_value,route_value,release_value,platform_value,version_value,connectivity_value,error_value)
  returning id into report_id;
  return jsonb_build_object('ok',true,'id',report_id,'status','open','submitted_at',now(),'deduplicated',false);
end
$$;

create or replace function public.my_employee_support_reports(p_limit integer default 20)
returns table(id uuid,category text,summary text,status text,manager_note text,submitted_at timestamptz,reviewed_at timestamptz)
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare
  loc uuid:=public.current_location_id();
  uid uuid:=auth.uid();
  eid uuid;
  row_limit integer:=greatest(1,least(coalesce(p_limit,20),50));
begin
  if uid is null or loc is null or public.current_app_role()<>'employee' then raise exception 'employee account required';end if;
  select e.id into eid from public.employees e where e.location_id=loc and e.user_id=uid and e.active and e.deleted_at is null and e.employment_status='active' limit 1;
  if eid is null then raise exception 'active approved employee profile required';end if;
  return query select r.id,r.category,r.summary,r.status,r.manager_note,r.submitted_at,r.reviewed_at
    from public.employee_support_reports r
   where r.location_id=loc and r.employee_id=eid and r.user_id=uid
   order by r.submitted_at desc limit row_limit;
end
$$;

create or replace function public.employee_support_reports_for_manager(p_status text default null,p_limit integer default 100)
returns table(id uuid,employee_id uuid,employee_name text,category text,summary text,description text,route text,release_sha text,platform text,app_version text,connectivity text,error_id text,status text,manager_note text,submitted_at timestamptz,reviewed_at timestamptz,reviewed_by uuid)
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare
  loc uuid:=public.current_location_id();
  role_value public.app_role:=public.current_app_role();
  status_value text:=nullif(lower(trim(coalesce(p_status,''))),'');
  row_limit integer:=greatest(1,least(coalesce(p_limit,100),250));
begin
  if auth.uid() is null or loc is null or role_value not in ('admin','manager') then raise exception 'manager access required';end if;
  if status_value is not null and status_value not in ('open','acknowledged','resolved','closed') then raise exception 'invalid support status';end if;
  return query select r.id,r.employee_id,e.full_name,r.category,r.summary,r.description,r.route,r.release_sha,r.platform,r.app_version,r.connectivity,r.error_id,r.status,r.manager_note,r.submitted_at,r.reviewed_at,r.reviewed_by
    from public.employee_support_reports r join public.employees e on e.id=r.employee_id
   where r.location_id=loc and (status_value is null or r.status=status_value)
   order by case r.status when 'open' then 0 when 'acknowledged' then 1 when 'resolved' then 2 else 3 end,r.submitted_at desc
   limit row_limit;
end
$$;

create or replace function public.review_employee_support_report(p_report_id uuid,p_status text,p_manager_note text default null)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare
  loc uuid:=public.current_location_id();
  uid uuid:=auth.uid();
  role_value public.app_role:=public.current_app_role();
  status_value text:=lower(trim(coalesce(p_status,'')));
  note_value text:=nullif(trim(replace(coalesce(p_manager_note,''),chr(0),'')),'');
  changed public.employee_support_reports%rowtype;
begin
  if uid is null or loc is null or role_value not in ('admin','manager') then raise exception 'manager access required';end if;
  if p_report_id is null then raise exception 'report id required';end if;
  if status_value not in ('open','acknowledged','resolved','closed') then raise exception 'invalid support status';end if;
  if note_value is not null and char_length(note_value)>2000 then raise exception 'manager note must be 2000 characters or fewer';end if;
  update public.employee_support_reports
     set status=status_value,manager_note=note_value,reviewed_at=case when status_value='open' then null else now() end,reviewed_by=case when status_value='open' then null else uid end,updated_at=now()
   where id=p_report_id and location_id=loc
   returning * into changed;
  if not found then raise exception 'support report not found';end if;
  return jsonb_build_object('ok',true,'id',changed.id,'status',changed.status,'reviewed_at',changed.reviewed_at);
end
$$;

revoke all on function public.submit_employee_support_report(uuid,text,text,text,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.my_employee_support_reports(integer) from public,anon,authenticated;
revoke all on function public.employee_support_reports_for_manager(text,integer) from public,anon,authenticated;
revoke all on function public.review_employee_support_report(uuid,text,text) from public,anon,authenticated;
grant execute on function public.submit_employee_support_report(uuid,text,text,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.my_employee_support_reports(integer) to authenticated;
grant execute on function public.employee_support_reports_for_manager(text,integer) to authenticated;
grant execute on function public.review_employee_support_report(uuid,text,text) to authenticated;
