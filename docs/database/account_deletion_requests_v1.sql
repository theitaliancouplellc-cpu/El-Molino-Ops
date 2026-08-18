begin;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  source text not null check (source in ('in_app','external_web')),
  note text,
  status text not null default 'pending' check (status in ('pending','processing','completed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  constraint account_deletion_note_length check (note is null or length(note) <= 2000),
  constraint account_deletion_completion_shape check (
    (status <> 'completed' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

create unique index if not exists account_deletion_one_pending_per_user
  on public.account_deletion_requests(user_id)
  where status in ('pending','processing');

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public, anon, authenticated;

create table if not exists private.public_account_deletion_rate_limits (
  id bigint generated always as identity primary key,
  client_ip inet,
  requested_at timestamptz not null default now()
);

revoke all on private.public_account_deletion_rate_limits from public, anon, authenticated;
create index if not exists public_account_deletion_rate_limits_ip_time_idx
  on private.public_account_deletion_rate_limits(client_ip, requested_at desc);
create index if not exists public_account_deletion_rate_limits_time_idx
  on private.public_account_deletion_rate_limits(requested_at desc);

create or replace function public.request_account_deletion_external(
  p_email text,
  p_note text default null,
  p_company_website text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  normalized_email text;
  target_user_id uuid;
  target_location_id uuid;
  headers jsonb := coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  raw_ip text;
  client_ip inet;
  ip_recent integer;
  global_recent integer;
begin
  -- Honeypot submissions receive an indistinguishable success response but are
  -- not persisted. Never expose whether an email address is a registered user.
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

  select count(*)::integer into global_recent
  from private.public_account_deletion_rate_limits
  where requested_at >= now()-interval '10 minutes';
  if global_recent >= 100 then
    raise exception 'request service temporarily busy; try again later' using errcode='P0001';
  end if;

  if client_ip is not null then
    select count(*)::integer into ip_recent
    from private.public_account_deletion_rate_limits
    where client_ip=request_account_deletion_external.client_ip
      and requested_at >= now()-interval '1 hour';
    if ip_recent >= 5 then
      raise exception 'too many deletion requests; try again later' using errcode='P0001';
    end if;
  end if;

  insert into private.public_account_deletion_rate_limits(client_ip) values(client_ip);
  delete from private.public_account_deletion_rate_limits where requested_at < now()-interval '7 days';

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
end;
$function$;

revoke all on function public.request_account_deletion_external(text,text,text) from public, anon, authenticated;
grant execute on function public.request_account_deletion_external(text,text,text) to anon, authenticated;

create or replace function public.request_my_account_deletion(p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  uid uuid := auth.uid();
  target_location_id uuid;
  request_id uuid;
begin
  if uid is null then raise exception 'authentication required' using errcode='28000'; end if;
  if p_note is not null and length(p_note) > 2000 then
    raise exception 'note is too long' using errcode='22023';
  end if;

  select p.location_id into target_location_id from public.profiles p where p.id=uid;

  select r.id into request_id
  from public.account_deletion_requests r
  where r.user_id=uid and r.status in ('pending','processing')
  order by r.requested_at desc
  limit 1;

  if request_id is null then
    insert into public.account_deletion_requests(user_id,location_id,source,note)
    values(uid,target_location_id,'in_app',nullif(trim(p_note),''))
    returning id into request_id;
  end if;

  return jsonb_build_object('ok',true,'request_id',request_id);
exception when unique_violation then
  select r.id into request_id
  from public.account_deletion_requests r
  where r.user_id=uid and r.status in ('pending','processing')
  order by r.requested_at desc
  limit 1;
  return jsonb_build_object('ok',true,'request_id',request_id);
end;
$function$;

revoke all on function public.request_my_account_deletion(text) from public, anon, authenticated;
grant execute on function public.request_my_account_deletion(text) to authenticated;

-- The existing Account screen records a tightly shaped audit event when a
-- signed-in user requests deletion. Mirror only that self-referential event
-- into the same protected queue so existing clients do not need a fragile UI
-- migration to participate in the new deletion process.
create or replace function private.capture_account_deletion_request_from_activity_log()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
begin
  if new.action='account_deletion_requested'
     and new.entity_type='profile'
     and new.actor_user_id is not null
     and new.entity_id=new.actor_user_id then
    begin
      insert into public.account_deletion_requests(user_id,location_id,source)
      values(new.actor_user_id,new.location_id,'in_app');
    exception when unique_violation then
      null;
    end;
  end if;
  return new;
end;
$function$;

revoke all on function private.capture_account_deletion_request_from_activity_log() from public, anon, authenticated;
drop trigger if exists activity_log_capture_account_deletion_request on public.activity_log;
create trigger activity_log_capture_account_deletion_request
after insert on public.activity_log
for each row
when (new.action='account_deletion_requested')
execute function private.capture_account_deletion_request_from_activity_log();

commit;
