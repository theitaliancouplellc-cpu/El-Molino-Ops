-- El Molino Ops: serialize Toast ingestion per location.
--
-- The HTTP sync endpoint may be invoked concurrently by multiple managers,
-- double-clicks, retries, or overlapping clients. The ingestion itself is mostly
-- idempotent, but overlapping provider fetches and status writes create avoidable
-- races and can reset approval state while another sync is still running.
--
-- Use an atomic, expiring database lease keyed by location. A 30-minute expiry
-- recovers automatically from a crashed/serverless invocation without requiring
-- human cleanup. Completion requires possession of the exact lease UUID.

alter table public.toast_sync_state
  add column if not exists active_sync_id uuid,
  add column if not exists active_sync_started_at timestamptz;

create or replace function public.toast_begin_sync(p_business_date date)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  loc uuid := public.current_location_id();
  lease_id uuid := gen_random_uuid();
  acquired uuid;
begin
  if auth.uid() is null or public.current_app_role() not in ('admin','manager') then
    raise exception 'manager access required';
  end if;
  if loc is null then raise exception 'location required'; end if;
  if p_business_date is null then raise exception 'business date required'; end if;

  insert into public.toast_sync_state(
    location_id,last_started_at,last_business_date,last_status,last_error,last_counts,
    updated_by,updated_at,active_sync_id,active_sync_started_at
  ) values (
    loc,now(),p_business_date,'running',null,'{}'::jsonb,
    auth.uid(),now(),lease_id,now()
  )
  on conflict(location_id) do update set
    last_started_at=excluded.last_started_at,
    last_business_date=excluded.last_business_date,
    last_status='running',
    last_error=null,
    last_counts='{}'::jsonb,
    updated_by=auth.uid(),
    updated_at=now(),
    active_sync_id=lease_id,
    active_sync_started_at=now()
  where public.toast_sync_state.active_sync_id is null
     or public.toast_sync_state.active_sync_started_at is null
     or public.toast_sync_state.active_sync_started_at < now() - interval '30 minutes'
  returning active_sync_id into acquired;

  return acquired;
end
$function$;

create or replace function public.toast_finish_sync(
  p_sync_id uuid,
  p_business_date date,
  p_restaurant_guid text,
  p_status text,
  p_error text default null,
  p_counts jsonb default '{}'::jsonb
)
returns public.toast_sync_state
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  loc uuid := public.current_location_id();
  result public.toast_sync_state%rowtype;
begin
  if auth.uid() is null or public.current_app_role() not in ('admin','manager') then
    raise exception 'manager access required';
  end if;
  if loc is null then raise exception 'location required'; end if;
  if p_sync_id is null then raise exception 'sync lease required'; end if;
  if p_status not in ('success','error') then raise exception 'invalid sync completion status'; end if;

  update public.toast_sync_state
  set restaurant_guid=coalesce(nullif(trim(p_restaurant_guid),''),restaurant_guid),
      last_completed_at=now(),
      last_business_date=p_business_date,
      last_status=p_status,
      last_error=case when p_status='error' then left(p_error,2000) else null end,
      last_counts=coalesce(p_counts,'{}'::jsonb),
      updated_by=auth.uid(),
      updated_at=now(),
      active_sync_id=null,
      active_sync_started_at=null
  where location_id=loc
    and active_sync_id=p_sync_id
  returning * into result;

  if not found then
    raise exception 'toast sync lease is stale or invalid';
  end if;
  return result;
end
$function$;

revoke all on function public.toast_begin_sync(date) from public, anon;
grant execute on function public.toast_begin_sync(date) to authenticated;

revoke all on function public.toast_finish_sync(uuid,date,text,text,text,jsonb) from public, anon;
grant execute on function public.toast_finish_sync(uuid,date,text,text,text,jsonb) to authenticated;
