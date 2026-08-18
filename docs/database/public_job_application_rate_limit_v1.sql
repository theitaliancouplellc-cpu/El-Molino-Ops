-- PRODUCTION APPLIED: public_job_application_rate_limit_v1
-- Protect the intentionally anonymous hiring submission RPC against bulk abuse.

create table if not exists private.public_job_application_rate_limits (
  id bigint generated always as identity primary key,
  client_ip inet,
  requested_at timestamptz not null default now()
);

create index if not exists public_job_application_rate_limits_ip_time_idx
  on private.public_job_application_rate_limits(client_ip,requested_at desc);
create index if not exists public_job_application_rate_limits_time_idx
  on private.public_job_application_rate_limits(requested_at desc);

revoke all on table private.public_job_application_rate_limits
  from public, anon, authenticated;

create or replace function public.submit_job_application(
  p_job_posting_id uuid,
  p_full_name text,
  p_email text,
  p_phone text default null,
  p_availability jsonb default '{}'::jsonb,
  p_work_experience text default null,
  p_why_interested text default null,
  p_authorized_to_work boolean default null,
  p_consent boolean default false,
  p_company_website text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog','public'
as $$
declare
  j public.hiring_job_postings%rowtype;
  aid uuid;
  headers jsonb := coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  raw_ip text;
  client_ip inet;
  ip_recent integer;
  global_recent integer;
begin
  if length(trim(coalesce(p_company_website,'')))>0 then
    return jsonb_build_object('ok',true);
  end if;

  raw_ip := split_part(coalesce(headers->>'cf-connecting-ip',headers->>'x-forwarded-for',''),',',1);
  begin
    client_ip := nullif(trim(raw_ip),'')::inet;
  exception when others then
    client_ip := null;
  end;

  select count(*)::integer into global_recent
  from private.public_job_application_rate_limits
  where requested_at >= now()-interval '10 minutes';

  if global_recent >= 100 then
    raise exception 'application service temporarily busy; try again later'
      using errcode='P0001';
  end if;

  if client_ip is not null then
    select count(*)::integer into ip_recent
    from private.public_job_application_rate_limits
    where client_ip=submit_job_application.client_ip
      and requested_at >= now()-interval '15 minutes';

    if ip_recent >= 8 then
      raise exception 'too many application attempts; try again later'
        using errcode='P0001';
    end if;
  end if;

  insert into private.public_job_application_rate_limits(client_ip)
  values(client_ip);

  delete from private.public_job_application_rate_limits
  where requested_at < now()-interval '2 days';

  if not p_consent then raise exception 'application consent is required';end if;
  if jsonb_typeof(coalesce(p_availability,'{}'::jsonb))<>'object' then raise exception 'availability must be an object';end if;

  select * into j
  from public.hiring_job_postings
  where id=p_job_posting_id
    and status='published'
    and (closes_at is null or closes_at>now());
  if not found then raise exception 'job posting is not accepting applications';end if;

  if length(trim(coalesce(p_full_name,''))) not between 1 and 160 then raise exception 'full name is required';end if;
  if length(trim(coalesce(p_email,''))) not between 3 and 320 or position('@' in p_email)<=1 then raise exception 'valid email is required';end if;

  insert into public.hiring_applicants(
    job_posting_id,location_id,full_name,email,phone,availability,
    work_experience,why_interested,authorized_to_work,status,source,consented_at
  )
  values(
    j.id,j.location_id,left(trim(p_full_name),160),lower(left(trim(p_email),320)),
    nullif(left(trim(coalesce(p_phone,'')),80),''),p_availability,
    nullif(left(trim(coalesce(p_work_experience,'')),20000),''),
    nullif(left(trim(coalesce(p_why_interested,'')),10000),''),
    p_authorized_to_work,'applied','public_job_board',now()
  ) returning id into aid;

  insert into public.hiring_stage_history(applicant_id,location_id,to_status,note)
  values(aid,j.location_id,'applied','Public job board application');

  return jsonb_build_object('ok',true,'application_id',aid);
exception when unique_violation then
  raise exception 'an application for this job already exists for that email';
end;
$$;

revoke all on function public.submit_job_application(uuid,text,text,text,jsonb,text,text,boolean,boolean,text)
  from public, authenticated;
grant execute on function public.submit_job_application(uuid,text,text,text,jsonb,text,text,boolean,boolean,text)
  to anon;
