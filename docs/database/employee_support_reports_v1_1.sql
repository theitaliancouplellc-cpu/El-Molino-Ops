-- El Molino Ops: Staff support report idempotency concurrency hardening.
-- Serializes the same authenticated user + client request id so concurrent retries
-- converge on the already-created report instead of surfacing a unique-key race.

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

  -- Transaction-scoped and privacy-safe: the hash is used only as a lock key.
  -- Collisions can serialize unrelated requests but cannot authorize or merge them.
  perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||p_client_request_id::text,0));

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

revoke all on function public.submit_employee_support_report(uuid,text,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_employee_support_report(uuid,text,text,text,text,text,text,text,text,text) to authenticated;
