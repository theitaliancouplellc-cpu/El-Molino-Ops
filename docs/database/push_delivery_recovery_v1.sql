-- El Molino Ops: push delivery retries must not depend on a future notification.
--
-- Web push had a retry cron, but its predicate ignored stale `sending` rows; if a
-- dispatcher died after claiming the final ready row, nothing necessarily invoked
-- the claim RPC again to recover it. Native push had no retry cron at all, so a
-- transient provider result or failed trigger webhook could remain queued forever.
-- Both queues now have one-minute recovery dispatchers that wake for due work OR
-- stale sending locks. A stale lock at the maximum attempt count is terminalized
-- instead of remaining `sending` forever.

create or replace function public.claim_web_push_deliveries(
  p_notification_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare result jsonb;
begin
  update public.push_delivery_attempts
  set status='permanent_failure',completed_at=now(),locked_at=null,updated_at=now(),
      error_class='stale_lock_attempt_limit'
  where status='sending'
    and locked_at<now()-interval '5 minutes'
    and attempt_count>=5;

  update public.push_delivery_attempts
  set status='retry',locked_at=null,next_attempt_at=now(),updated_at=now(),
      error_class='recovered_stale_lock'
  where status='sending'
    and locked_at<now()-interval '5 minutes'
    and attempt_count<5;

  update public.push_delivery_attempts a
  set status='skipped',completed_at=now(),locked_at=null,updated_at=now(),
      error_class='delivery_no_longer_allowed'
  from public.notifications n,public.push_subscriptions s
  where a.notification_id=n.id and a.push_subscription_id=s.id
    and a.status in ('pending','retry')
    and (
      s.disabled_at is not null
      or not exists(
        select 1 from public.employees e
        where e.user_id=n.user_id and e.location_id=n.location_id
          and e.active and e.deleted_at is null
      )
      or coalesce((
        select p.push from public.notification_preferences p
        where p.user_id=n.user_id and p.location_id=n.location_id
          and p.category=n.category limit 1
      ),true)=false
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
    set status='sending',attempt_count=a.attempt_count+1,last_attempt_at=now(),
        locked_at=now(),updated_at=now()
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
end
$function$;

create or replace function public.claim_native_push_deliveries(
  p_notification_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','vault'
as $function$
declare result jsonb; encryption_key text;
begin
  select decrypted_secret into encryption_key
  from vault.decrypted_secrets
  where name='native_push_token_encryption_key'
  limit 1;
  if length(coalesce(encryption_key,''))<32 then
    raise exception 'native push encryption is not configured';
  end if;

  update public.native_push_delivery_attempts
  set status='permanent_failure',completed_at=now(),locked_at=null,updated_at=now(),
      error_class='stale_lock_attempt_limit'
  where status='sending'
    and locked_at<now()-interval '5 minutes'
    and attempt_count>=5;

  update public.native_push_delivery_attempts
  set status='retry',locked_at=null,next_attempt_at=now(),updated_at=now(),
      error_class='recovered_stale_lock'
  where status='sending'
    and locked_at<now()-interval '5 minutes'
    and attempt_count<5;

  update public.native_push_delivery_attempts a
  set status='skipped',completed_at=now(),locked_at=null,updated_at=now(),
      error_class='delivery_no_longer_allowed'
  from public.notifications n,public.native_push_devices d
  where a.notification_id=n.id and a.native_push_device_id=d.id
    and a.status in ('pending','retry')
    and (
      d.disabled_at is not null
      or d.token_ciphertext=''
      or not exists(
        select 1 from public.employees e
        where e.user_id=n.user_id and e.location_id=n.location_id
          and e.active and e.deleted_at is null
      )
      or coalesce((
        select p.push from public.notification_preferences p
        where p.user_id=n.user_id and p.location_id=n.location_id
          and p.category=n.category limit 1
      ),true)=false
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
    set status='sending',attempt_count=a.attempt_count+1,last_attempt_at=now(),
        locked_at=now(),updated_at=now()
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
end
$function$;

revoke all on function public.claim_web_push_deliveries(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.claim_web_push_deliveries(uuid,integer)
  to service_role;
revoke all on function public.claim_native_push_deliveries(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.claim_native_push_deliveries(uuid,integer)
  to service_role;

-- Replace the web retry job with a wake predicate that also notices crashed
-- dispatchers whose final claimed row is stuck in `sending`.
do $web_cron$
begin
  if exists(select 1 from cron.job where jobname='web-push-retry-v1') then
    perform cron.unschedule('web-push-retry-v1');
  end if;
  if exists(select 1 from cron.job where jobname='web-push-recovery-v2') then
    perform cron.unschedule('web-push-recovery-v2');
  end if;
  perform cron.schedule(
    'web-push-recovery-v2',
    '* * * * *',
    $job$
      select net.http_post(
        url:='https://asuvgjxdmxizbnjrccsz.supabase.co/functions/v1/web-push-dispatch',
        body:='{"retry":true}'::jsonb,
        headers:=jsonb_build_object(
          'Content-Type','application/json',
          'x-el-molino-push-secret',(
            select decrypted_secret from vault.decrypted_secrets
            where name='web_push_webhook_secret' limit 1
          )
        ),
        timeout_milliseconds:=5000
      )
      where exists(
        select 1 from public.push_delivery_attempts
        where (status in ('pending','retry') and next_attempt_at<=now())
           or (status='sending' and locked_at<now()-interval '5 minutes')
      );
    $job$
  );
end
$web_cron$;

-- Native push now has the same independent retry/recovery wakeup. This is
-- deliberately not notification-scoped so old transient attempts are retried.
do $native_cron$
begin
  if exists(select 1 from cron.job where jobname='native-push-recovery-v1') then
    perform cron.unschedule('native-push-recovery-v1');
  end if;
  perform cron.schedule(
    'native-push-recovery-v1',
    '* * * * *',
    $job$
      select net.http_post(
        url:='https://asuvgjxdmxizbnjrccsz.supabase.co/functions/v1/native-push-dispatch',
        body:='{"retry":true}'::jsonb,
        headers:=jsonb_build_object(
          'Content-Type','application/json',
          'x-el-molino-native-push-secret',(
            select decrypted_secret from vault.decrypted_secrets
            where name='native_push_webhook_secret' limit 1
          )
        ),
        timeout_milliseconds:=5000
      )
      where exists(
        select 1 from public.native_push_delivery_attempts
        where (status in ('pending','retry') and next_attempt_at<=now())
           or (status='sending' and locked_at<now()-interval '5 minutes')
      );
    $job$
  );
end
$native_cron$;
