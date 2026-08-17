-- Production Web Push delivery foundation for El Molino staff.
-- Safe to apply before the client release: no push is sent unless a user has an active subscription.

create extension if not exists pg_net;

alter table public.push_subscriptions add column if not exists disabled_at timestamptz;
alter table public.push_subscriptions add column if not exists last_success_at timestamptz;
alter table public.push_subscriptions add column if not exists last_failure_at timestamptz;
alter table public.push_subscriptions add column if not exists consecutive_failures integer not null default 0;

alter table public.push_subscriptions drop constraint if exists push_subscriptions_failure_count_check;
alter table public.push_subscriptions add constraint push_subscriptions_failure_count_check check(consecutive_failures between 0 and 1000);
create index if not exists push_subscriptions_user_active_idx on public.push_subscriptions(user_id,last_seen_at desc) where disabled_at is null;

alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_own on public.push_subscriptions;
revoke all on public.push_subscriptions from anon, authenticated;
grant all on public.push_subscriptions to service_role;

create or replace function public.get_web_push_public_config()
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth','vault'
as $$
declare
  status jsonb;
  public_key text;
  subject text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  status:=public.employee_self_setup_status();
  if coalesce((status->>'access_allowed')::boolean,false) is not true then raise exception 'active employee access required'; end if;
  select decrypted_secret into public_key from vault.decrypted_secrets where name='web_push_vapid_public_key' limit 1;
  select decrypted_secret into subject from vault.decrypted_secrets where name='web_push_vapid_subject' limit 1;
  if nullif(public_key,'') is null or nullif(subject,'') is null then raise exception 'web push is not configured'; end if;
  return jsonb_build_object('public_key',public_key,'subject',subject);
end $$;

create or replace function public.register_my_push_subscription(p_subscription jsonb, p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare
  status jsonb;
  endpoint text:=trim(coalesce(p_subscription->>'endpoint',''));
  p256dh text:=trim(coalesce(p_subscription->'keys'->>'p256dh',''));
  auth_key text:=trim(coalesce(p_subscription->'keys'->>'auth',''));
  clean_subscription jsonb;
  subscription_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  status:=public.employee_self_setup_status();
  if coalesce((status->>'access_allowed')::boolean,false) is not true then raise exception 'active employee access required'; end if;
  if p_subscription is null or jsonb_typeof(p_subscription)<>'object' or pg_column_size(p_subscription)>8192 then raise exception 'invalid push subscription'; end if;
  if endpoint !~ '^https://[^[:space:]]+$' or length(endpoint)>2048 then raise exception 'invalid push endpoint'; end if;
  if length(p256dh)<40 or length(p256dh)>512 or length(auth_key)<8 or length(auth_key)>256 then raise exception 'invalid push subscription keys'; end if;
  clean_subscription:=jsonb_build_object(
    'endpoint',endpoint,
    'expirationTime',p_subscription->'expirationTime',
    'keys',jsonb_build_object('p256dh',p256dh,'auth',auth_key)
  );
  insert into public.push_subscriptions(user_id,endpoint,subscription,user_agent,last_seen_at,disabled_at,consecutive_failures)
  values(auth.uid(),endpoint,clean_subscription,left(nullif(trim(coalesce(p_user_agent,'')),''),500),now(),null,0)
  on conflict(endpoint) do update set
    user_id=excluded.user_id,
    subscription=excluded.subscription,
    user_agent=excluded.user_agent,
    last_seen_at=now(),
    disabled_at=null,
    consecutive_failures=0
  returning id into subscription_id;
  return jsonb_build_object('registered',true,'subscription_id',subscription_id,'endpoint',endpoint);
end $$;

create or replace function public.remove_my_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  delete from public.push_subscriptions where user_id=auth.uid() and endpoint=trim(coalesce(p_endpoint,''));
  return found;
end $$;

revoke all on function public.get_web_push_public_config() from public,anon;
revoke all on function public.register_my_push_subscription(jsonb,text) from public,anon;
revoke all on function public.remove_my_push_subscription(text) from public,anon;
grant execute on function public.get_web_push_public_config() to authenticated;
grant execute on function public.register_my_push_subscription(jsonb,text) to authenticated;
grant execute on function public.remove_my_push_subscription(text) to authenticated;

create table if not exists public.push_delivery_attempts(
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  push_subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  user_id uuid not null,
  location_id uuid not null references public.locations(id) on delete cascade,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  locked_at timestamptz,
  completed_at timestamptz,
  sent_at timestamptz,
  status_code integer,
  error_class text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(notification_id,push_subscription_id),
  constraint push_delivery_attempts_status_check check(status in ('pending','sending','retry','sent','expired','skipped','permanent_failure')),
  constraint push_delivery_attempts_count_check check(attempt_count between 0 and 20)
);
alter table public.push_delivery_attempts enable row level security;
revoke all on public.push_delivery_attempts from anon,authenticated;
grant all on public.push_delivery_attempts to service_role;
create index if not exists push_delivery_due_idx on public.push_delivery_attempts(next_attempt_at,created_at) where status in ('pending','retry');
create index if not exists push_delivery_notification_idx on public.push_delivery_attempts(notification_id,status);

create or replace function public.get_web_push_runtime_config()
returns jsonb
language sql
security definer
set search_path='pg_catalog','public','vault'
as $$
  select jsonb_build_object(
    'public_key',max(decrypted_secret) filter(where name='web_push_vapid_public_key'),
    'private_key',max(decrypted_secret) filter(where name='web_push_vapid_private_key'),
    'subject',max(decrypted_secret) filter(where name='web_push_vapid_subject'),
    'webhook_secret',max(decrypted_secret) filter(where name='web_push_webhook_secret')
  )
  from vault.decrypted_secrets
  where name in ('web_push_vapid_public_key','web_push_vapid_private_key','web_push_vapid_subject','web_push_webhook_secret');
$$;
revoke all on function public.get_web_push_runtime_config() from public,anon,authenticated;
grant execute on function public.get_web_push_runtime_config() to service_role;

create or replace function public.claim_web_push_deliveries(p_notification_id uuid default null, p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare result jsonb;
begin
  update public.push_delivery_attempts
  set status='retry',locked_at=null,next_attempt_at=now(),updated_at=now(),error_class='recovered_stale_lock'
  where status='sending' and locked_at<now()-interval '5 minutes' and attempt_count<5;

  update public.push_delivery_attempts a
  set status='skipped',completed_at=now(),locked_at=null,updated_at=now(),error_class='delivery_no_longer_allowed'
  from public.notifications n, public.push_subscriptions s
  where a.notification_id=n.id and a.push_subscription_id=s.id
    and a.status in ('pending','retry')
    and (
      s.disabled_at is not null
      or not exists(select 1 from public.employees e where e.user_id=n.user_id and e.location_id=n.location_id and e.active and e.deleted_at is null)
      or coalesce((select p.push from public.notification_preferences p where p.user_id=n.user_id and p.location_id=n.location_id and p.category=n.category limit 1),true)=false
    );

  with candidates as (
    select a.id
    from public.push_delivery_attempts a
    join public.notifications n on n.id=a.notification_id
    join public.push_subscriptions s on s.id=a.push_subscription_id
    where a.status in ('pending','retry')
      and a.next_attempt_at<=now()
      and a.attempt_count<5
      and s.disabled_at is null
      and (p_notification_id is null or a.notification_id=p_notification_id)
    order by a.next_attempt_at,a.created_at
    for update of a skip locked
    limit greatest(1,least(coalesce(p_limit,50),100))
  ), claimed as (
    update public.push_delivery_attempts a
    set status='sending',attempt_count=a.attempt_count+1,last_attempt_at=now(),locked_at=now(),updated_at=now()
    from candidates c where a.id=c.id
    returning a.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'attempt_id',c.id,
    'notification_id',c.notification_id,
    'subscription_id',c.push_subscription_id,
    'subscription',s.subscription,
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
  join public.push_subscriptions s on s.id=c.push_subscription_id;
  return result;
end $$;
revoke all on function public.claim_web_push_deliveries(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_web_push_deliveries(uuid,integer) to service_role;

create or replace function public.complete_web_push_delivery(p_attempt_id uuid, p_outcome text, p_status_code integer default null, p_error_class text default null)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare
  a public.push_delivery_attempts%rowtype;
  next_status text;
  retry_seconds integer;
begin
  select * into a from public.push_delivery_attempts where id=p_attempt_id for update;
  if not found then raise exception 'push delivery attempt not found'; end if;
  if a.status<>'sending' then return jsonb_build_object('status',a.status,'attempt_count',a.attempt_count); end if;

  if p_outcome='sent' then
    update public.push_delivery_attempts set status='sent',sent_at=now(),completed_at=now(),locked_at=null,status_code=p_status_code,error_class=null,updated_at=now() where id=a.id;
    update public.push_subscriptions set last_success_at=now(),last_seen_at=now(),consecutive_failures=0 where id=a.push_subscription_id;
    next_status:='sent';
  elsif p_outcome='expired' or p_status_code in (404,410) then
    update public.push_delivery_attempts set status='expired',completed_at=now(),locked_at=null,status_code=p_status_code,error_class=left(coalesce(nullif(p_error_class,''),'subscription_expired'),120),updated_at=now() where id=a.id;
    update public.push_subscriptions set disabled_at=coalesce(disabled_at,now()),last_failure_at=now(),consecutive_failures=least(consecutive_failures+1,1000) where id=a.push_subscription_id;
    next_status:='expired';
  elsif p_outcome='retry' and a.attempt_count<5 then
    retry_seconds:=least(3600,60*(2^greatest(a.attempt_count-1,0))::integer);
    update public.push_delivery_attempts set status='retry',next_attempt_at=now()+make_interval(secs=>retry_seconds),locked_at=null,status_code=p_status_code,error_class=left(coalesce(nullif(p_error_class,''),'transient_failure'),120),updated_at=now() where id=a.id;
    update public.push_subscriptions set last_failure_at=now(),consecutive_failures=least(consecutive_failures+1,1000) where id=a.push_subscription_id;
    next_status:='retry';
  else
    update public.push_delivery_attempts set status='permanent_failure',completed_at=now(),locked_at=null,status_code=p_status_code,error_class=left(coalesce(nullif(p_error_class,''),'permanent_failure'),120),updated_at=now() where id=a.id;
    update public.push_subscriptions set last_failure_at=now(),consecutive_failures=least(consecutive_failures+1,1000) where id=a.push_subscription_id;
    next_status:='permanent_failure';
  end if;
  return jsonb_build_object('status',next_status,'attempt_count',a.attempt_count);
end $$;
revoke all on function public.complete_web_push_delivery(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.complete_web_push_delivery(uuid,text,integer,text) to service_role;

create or replace function public.queue_web_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path='pg_catalog','public','vault','net'
as $$
declare
  queued integer:=0;
  webhook_secret text;
begin
  insert into public.push_delivery_attempts(notification_id,push_subscription_id,user_id,location_id)
  select new.id,s.id,new.user_id,new.location_id
  from public.push_subscriptions s
  where s.user_id=new.user_id
    and s.disabled_at is null
    and exists(select 1 from public.employees e where e.user_id=new.user_id and e.location_id=new.location_id and e.active and e.deleted_at is null)
    and coalesce((select p.push from public.notification_preferences p where p.user_id=new.user_id and p.location_id=new.location_id and p.category=new.category limit 1),true)=true
  on conflict(notification_id,push_subscription_id) do nothing;
  get diagnostics queued=row_count;

  if queued>0 then
    begin
      select decrypted_secret into webhook_secret from vault.decrypted_secrets where name='web_push_webhook_secret' limit 1;
      if nullif(webhook_secret,'') is not null then
        perform net.http_post(
          url:='https://asuvgjxdmxizbnjrccsz.supabase.co/functions/v1/web-push-dispatch',
          body:=jsonb_build_object('notification_id',new.id),
          headers:=jsonb_build_object('Content-Type','application/json','x-el-molino-push-secret',webhook_secret),
          timeout_milliseconds:=3000
        );
      end if;
    exception when others then
      null;
    end;
  end if;
  return new;
end $$;
revoke all on function public.queue_web_push_for_notification() from public,anon,authenticated;

drop trigger if exists trg_queue_web_push_for_notification on public.notifications;
create trigger trg_queue_web_push_for_notification after insert on public.notifications for each row execute function public.queue_web_push_for_notification();

-- Retry delivery is intentionally independent of notification creation so a temporary
-- Edge Function or push-provider outage cannot lose an accepted notification.
do $$
declare existing_job bigint;
begin
  for existing_job in select jobid from cron.job where jobname='web-push-retry-v1' loop
    perform cron.unschedule(existing_job);
  end loop;
  perform cron.schedule(
    'web-push-retry-v1',
    '* * * * *',
    $cron$
      select net.http_post(
        url:='https://asuvgjxdmxizbnjrccsz.supabase.co/functions/v1/web-push-dispatch',
        body:='{"retry":true}'::jsonb,
        headers:=jsonb_build_object(
          'Content-Type','application/json',
          'x-el-molino-push-secret',(select decrypted_secret from vault.decrypted_secrets where name='web_push_webhook_secret' limit 1)
        ),
        timeout_milliseconds:=5000
      )
      where exists(select 1 from public.push_delivery_attempts where status in ('pending','retry') and next_attempt_at<=now());
    $cron$
  );
end $$;
