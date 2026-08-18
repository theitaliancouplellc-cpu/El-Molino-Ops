-- El Molino Ops: public form abuse limits must be concurrency-safe.
--
-- The older public hiring/account-deletion functions used COUNT-then-INSERT rows
-- in private audit tables. Concurrent requests could all observe the same count
-- before recording themselves and overshoot the intended limit. Reuse the
-- existing atomic UPSERT counter primitive instead. Client IPs are SHA-256 hashed
-- before becoming rate-limit subjects so the shared counter table does not gain a
-- new raw-IP data surface.

create or replace function public.request_account_deletion_external(
  p_email text,
  p_note text default null,
  p_company_website text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  normalized_email text;
  target_user_id uuid;
  target_location_id uuid;
  headers jsonb := coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  raw_ip text;
  client_ip inet;
  ip_subject text;
begin
  if length(trim(coalesce(p_company_website,''))) > 0 then
    return jsonb_build_object('ok',true);
  end if;

  normalized_email := lower(trim(coalesce(p_email,'')));
  if length(normalized_email) not between 3 and 320
     or position('@' in normalized_email) <= 1
     or position('.' in split_part(normalized_email,'@',2)) <= 0 then
    raise exception 'valid email is required' using errcode='22023';
  end if;
  if p_note is not null and length(p_note) > 2000 then
    raise exception 'note is too long' using errcode='22023';
  end if;

  raw_ip := split_part(coalesce(headers->>'cf-connecting-ip',headers->>'x-forwarded-for',''),',',1);
  begin
    client_ip := nullif(trim(raw_ip),'')::inet;
  exception when others then
    client_ip := null;
  end;

  if not public.consume_rate_limit('public_account_deletion_global','global',100,600) then
    raise exception 'request service temporarily busy; try again later' using errcode='P0001';
  end if;

  if client_ip is not null then
    ip_subject := encode(extensions.digest(client_ip::text,'sha256'),'hex');
    if not public.consume_rate_limit('public_account_deletion_ip',ip_subject,5,3600) then
      raise exception 'too many deletion requests; try again later' using errcode='P0001';
    end if;
  end if;

  select u.id into target_user_id
  from auth.users u
  where lower(u.email)=normalized_email
  order by u.created_at desc
  limit 1;

  if target_user_id is not null then
    select p.location_id into target_location_id
    from public.profiles p
    where p.id=target_user_id;

    begin
      insert into public.account_deletion_requests(user_id,location_id,source,note)
      values(target_user_id,target_location_id,'external_web',nullif(trim(p_note),''));
    exception when unique_violation then
      null;
    end;
  end if;

  return jsonb_build_object('ok',true);
end
$function$;

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
set search_path to 'pg_catalog', 'public'
as $function$
declare
  j public.hiring_job_postings%rowtype;
  aid uuid;
  headers jsonb := coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  raw_ip text;
  client_ip inet;
  ip_subject text;
begin
  -- Preserve the honeypot behavior: bots filling the hidden field receive a
  -- generic success without consuming a real-applicant rate-limit slot.
  if length(trim(coalesce(p_company_website,'')))>0 then
    return jsonb_build_object('ok',true);
  end if;

  raw_ip := split_part(coalesce(headers->>'cf-connecting-ip',headers->>'x-forwarded-for',''),',',1);
  begin
    client_ip := nullif(trim(raw_ip),'')::inet;
  exception when others then
    client_ip := null;
  end;

  if not public.consume_rate_limit('public_job_application_global','global',100,600) then
    raise exception 'application service temporarily busy; try again later' using errcode='P0001';
  end if;

  if client_ip is not null then
    ip_subject := encode(extensions.digest(client_ip::text,'sha256'),'hex');
    if not public.consume_rate_limit('public_job_application_ip',ip_subject,8,900) then
      raise exception 'too many application attempts; try again later' using errcode='P0001';
    end if;
  end if;

  if not p_consent then raise exception 'application consent is required'; end if;
  if jsonb_typeof(coalesce(p_availability,'{}'::jsonb))<>'object' then raise exception 'availability must be an object'; end if;

  select * into j
  from public.hiring_job_postings
  where id=p_job_posting_id
    and status='published'
    and (closes_at is null or closes_at>now());
  if not found then raise exception 'job posting is not accepting applications'; end if;

  if length(trim(coalesce(p_full_name,''))) not between 1 and 160 then raise exception 'full name is required'; end if;
  if length(trim(coalesce(p_email,''))) not between 3 and 320 or position('@' in p_email)<=1 then raise exception 'valid email is required'; end if;

  insert into public.hiring_applicants(
    job_posting_id,location_id,full_name,email,phone,availability,
    work_experience,why_interested,authorized_to_work,status,source,consented_at
  ) values(
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
end
$function$;

-- Preserve the intentionally tiny anonymous RPC surface. The two public forms
-- remain callable by anon, while the shared counter primitive remains internal.
revoke all on function public.request_account_deletion_external(text,text,text) from public;
grant execute on function public.request_account_deletion_external(text,text,text) to anon, authenticated;
revoke all on function public.submit_job_application(uuid,text,text,text,jsonb,text,text,boolean,boolean,text) from public;
grant execute on function public.submit_job_application(uuid,text,text,text,jsonb,text,text,boolean,boolean,text) to anon, authenticated;
revoke all on function public.consume_rate_limit(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text,text,integer,integer) to service_role;
