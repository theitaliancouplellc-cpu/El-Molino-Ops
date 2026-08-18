-- Durable APNs/FCM delivery for encrypted native device registrations.
-- Provider credentials and native_push_webhook_secret live in Vault; no provider secrets belong in source.

create table if not exists public.native_push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  native_push_device_id uuid not null references public.native_push_devices(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','retry','sent','expired','permanent_failure','skipped')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  locked_at timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  status_code integer,
  error_class text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(notification_id,native_push_device_id)
);

create index if not exists native_push_delivery_attempts_ready_idx
  on public.native_push_delivery_attempts(status,next_attempt_at,created_at)
  where status in ('pending','retry');

alter table public.native_push_delivery_attempts enable row level security;
revoke all on public.native_push_delivery_attempts from public,anon,authenticated;
grant all on public.native_push_delivery_attempts to service_role;

create or replace function public.get_native_push_runtime_config() returns jsonb
language sql security definer set search_path='pg_catalog','public','vault' as $$
  select jsonb_build_object(
    'webhook_secret',max(decrypted_secret) filter(where name='native_push_webhook_secret'),
    'apns_team_id',max(decrypted_secret) filter(where name='native_push_apns_team_id'),
    'apns_key_id',max(decrypted_secret) filter(where name='native_push_apns_key_id'),
    'apns_private_key',max(decrypted_secret) filter(where name='native_push_apns_private_key'),
    'apns_bundle_id',max(decrypted_secret) filter(where name='native_push_apns_bundle_id'),
    'apns_environment',coalesce(max(decrypted_secret) filter(where name='native_push_apns_environment'),'production'),
    'fcm_project_id',max(decrypted_secret) filter(where name='native_push_fcm_project_id'),
    'fcm_client_email',max(decrypted_secret) filter(where name='native_push_fcm_client_email'),
    'fcm_private_key',max(decrypted_secret) filter(where name='native_push_fcm_private_key')
  )
  from vault.decrypted_secrets
  where name in (
    'native_push_webhook_secret',
    'native_push_apns_team_id','native_push_apns_key_id','native_push_apns_private_key','native_push_apns_bundle_id','native_push_apns_environment',
    'native_push_fcm_project_id','native_push_fcm_client_email','native_push_fcm_private_key'
  );
$$;

create or replace function public.claim_native_push_deliveries(p_notification_id uuid default null,p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public','vault' as $$
declare result jsonb; encryption_key text;
begin
  select decrypted_secret into encryption_key from vault.decrypted_secrets where name='native_push_token_encryption_key' limit 1;
  if length(coalesce(encryption_key,''))<32 then raise exception 'native push encryption is not configured'; end if;

  update public.native_push_delivery_attempts
  set status='retry',locked_at=null,next_attempt_at=now(),updated_at=now(),error_class='recovered_stale_lock'
  where status='sending' and locked_at<now()-interval '5 minutes' and attempt_count<5;

  update public.native_push_delivery_attempts a
  set status='skipped',completed_at=now(),locked_at=null,updated_at=now(),error_class='delivery_no_longer_allowed'
  from public.notifications n, public.native_push_devices d
  where a.notification_id=n.id and a.native_push_device_id=d.id
    and a.status in ('pending','retry')
    and (
      d.disabled_at is not null
      or d.token_ciphertext=''
      or not exists(select 1 from public.employees e where e.user_id=n.user_id and e.location_id=n.location_id and e.active and e.deleted_at is null)
      or coalesce((select p.push from public.notification_preferences p where p.user_id=n.user_id and p.location_id=n.location_id and p.category=n.category limit 1),true)=false
    );

  with candidates as (
    select a.id
    from public.native_push_delivery_attempts a
    join public.notifications n on n.id=a.notification_id
    join public.native_push_devices d on d.id=a.native_push_device_id
    where a.status in ('pending','retry')
      and a.next_attempt_at<=now()
      and a.attempt_count<5
      and d.disabled_at is null
      and d.token_ciphertext<>''
      and (p_notification_id is null or a.notification_id=p_notification_id)
    order by a.next_attempt_at,a.created_at
    for update of a skip locked
    limit greatest(1,least(coalesce(p_limit,50),100))
  ), claimed as (
    update public.native_push_delivery_attempts a
    set status='sending',attempt_count=a.attempt_count+1,last_attempt_at=now(),locked_at=now(),updated_at=now()
    from candidates c where a.id=c.id
    returning a.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'attempt_id',c.id,
    'notification_id',c.notification_id,
    'device_id',d.id,
    'platform',d.platform,
    'token',pgp_sym_decrypt(decode(d.token_ciphertext,'base64'),encryption_key),
    'category',n.category,
    'event_key',n.event_key,
    'priority',n.priority,
    'href',n.href,
    'attempt_count',c.attempt_count,
    'created_at',n.created_at
  ) order by c.created_at),'[]'::jsonb)
  into result
  from claimed c
  join public.notifications n on n.id=c.notification_id
  join public.native_push_devices d on d.id=c.native_push_device_id;
  return result;
end $$;

create or replace function public.complete_native_push_delivery(
  p_attempt_id uuid,p_outcome text,p_status_code integer default null,p_error_class text default null
) returns jsonb
language plpgsql security definer set search_path='pg_catalog','public' as $$
declare a public.native_push_delivery_attempts%rowtype; next_status text; retry_seconds integer;
begin
  select * into a from public.native_push_delivery_attempts where id=p_attempt_id for update;
  if not found then raise exception 'native push delivery attempt not found'; end if;
  if a.status<>'sending' then return jsonb_build_object('status',a.status,'attempt_count',a.attempt_count); end if;

  if p_outcome='sent' then
    update public.native_push_delivery_attempts set status='sent',sent_at=now(),completed_at=now(),locked_at=null,status_code=p_status_code,error_class=null,updated_at=now() where id=a.id;
    update public.native_push_devices set last_seen_at=now() where id=a.native_push_device_id;
    next_status:='sent';
  elsif p_outcome='expired' then
    update public.native_push_delivery_attempts set status='expired',completed_at=now(),locked_at=null,status_code=p_status_code,error_class=left(coalesce(nullif(p_error_class,''),'device_token_expired'),120),updated_at=now() where id=a.id;
    update public.native_push_devices set disabled_at=coalesce(disabled_at,now()),token_ciphertext='',last_seen_at=now() where id=a.native_push_device_id;
    next_status:='expired';
  elsif p_outcome='retry' and a.attempt_count<5 then
    retry_seconds:=least(3600,60*(2^greatest(a.attempt_count-1,0))::integer);
    update public.native_push_delivery_attempts set status='retry',next_attempt_at=now()+make_interval(secs=>retry_seconds),locked_at=null,status_code=p_status_code,error_class=left(coalesce(nullif(p_error_class,''),'transient_failure'),120),updated_at=now() where id=a.id;
    next_status:='retry';
  else
    update public.native_push_delivery_attempts set status='permanent_failure',completed_at=now(),locked_at=null,status_code=p_status_code,error_class=left(coalesce(nullif(p_error_class,''),'permanent_failure'),120),updated_at=now() where id=a.id;
    next_status:='permanent_failure';
  end if;
  return jsonb_build_object('status',next_status,'attempt_count',a.attempt_count);
end $$;

create or replace function public.queue_native_push_for_notification() returns trigger
language plpgsql security definer set search_path='pg_catalog','public','vault','net' as $$
declare queued integer:=0; webhook_secret text;
begin
  insert into public.native_push_delivery_attempts(notification_id,native_push_device_id,user_id,location_id)
  select new.id,d.id,new.user_id,new.location_id
  from public.native_push_devices d
  where d.user_id=new.user_id
    and d.disabled_at is null and d.token_ciphertext<>''
    and exists(select 1 from public.employees e where e.user_id=new.user_id and e.location_id=new.location_id and e.active and e.deleted_at is null)
    and coalesce((select p.push from public.notification_preferences p where p.user_id=new.user_id and p.location_id=new.location_id and p.category=new.category limit 1),true)=true
  on conflict(notification_id,native_push_device_id) do nothing;
  get diagnostics queued=row_count;

  if queued>0 then
    begin
      select decrypted_secret into webhook_secret from vault.decrypted_secrets where name='native_push_webhook_secret' limit 1;
      if nullif(webhook_secret,'') is not null then
        perform net.http_post(
          url:='https://asuvgjxdmxizbnjrccsz.supabase.co/functions/v1/native-push-dispatch',
          body:=jsonb_build_object('notification_id',new.id),
          headers:=jsonb_build_object('Content-Type','application/json','x-el-molino-native-push-secret',webhook_secret),
          timeout_milliseconds:=3000
        );
      end if;
    exception when others then
      null;
    end;
  end if;
  return new;
end $$;

drop trigger if exists queue_native_push_for_notification on public.notifications;
create trigger queue_native_push_for_notification
after insert on public.notifications for each row execute function public.queue_native_push_for_notification();

revoke all on function public.get_native_push_runtime_config() from public,anon,authenticated;
revoke all on function public.claim_native_push_deliveries(uuid,integer) from public,anon,authenticated;
revoke all on function public.complete_native_push_delivery(uuid,text,integer,text) from public,anon,authenticated;
revoke all on function public.queue_native_push_for_notification() from public,anon,authenticated;
grant execute on function public.get_native_push_runtime_config() to service_role;
grant execute on function public.claim_native_push_deliveries(uuid,integer) to service_role;
grant execute on function public.complete_native_push_delivery(uuid,text,integer,text) to service_role;
