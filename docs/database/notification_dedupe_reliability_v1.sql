-- El Molino Ops: one notification event should produce one user-visible alert.
--
-- Two independent 15-minute cron jobs were producing upcoming-shift reminders:
-- the legacy deliver_upcoming_shift_reminders() path and the newer dedupe-keyed
-- enqueue_due_employee_shift_reminders() path. The legacy function now delegates
-- to the canonical idempotent implementation and its duplicate cron job is removed.
-- Certification expiry refresh is also serialized so concurrent scheduler/manual
-- invocations cannot race its rolling seven-day NOT EXISTS check.

create or replace function public.deliver_upcoming_shift_reminders()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
begin
  return public.enqueue_due_employee_shift_reminders(now());
end
$function$;

revoke all on function public.deliver_upcoming_shift_reminders() from public,anon,authenticated;
grant execute on function public.deliver_upcoming_shift_reminders() to service_role;

do $cron$
begin
  if exists(select 1 from cron.job where jobname='el_molino_shift_reminders') then
    perform cron.unschedule('el_molino_shift_reminders');
  end if;
end
$cron$;

create or replace function public.refresh_certification_expiry_notifications()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare inserted_count integer:=0;
begin
  -- Preserve the rolling seven-day behavior while making the read-then-insert
  -- sequence concurrency-safe. Transaction-scoped lock releases automatically.
  perform pg_advisory_xact_lock(
    hashtextextended('el-molino:certification-expiry-notifications',0)
  );

  with due as (
    select r.id,r.location_id,r.title,r.assigned_employee_id,
           public.safe_iso_date(r.data->>'expires_on') expires_on
    from public.ops_records r
    where r.kind='certification' and r.status='active' and r.deleted_at is null
  ), eligible as (
    select * from due
    where expires_on is not null
      and expires_on<=((now() at time zone 'America/New_York')::date+30)
  ), managers as (
    select d.*,p.id user_id
    from eligible d
    join public.profiles p
      on p.location_id=d.location_id
     and p.app_role in ('admin'::public.app_role,'manager'::public.app_role)
  ), ins as (
    insert into public.notifications(
      location_id,user_id,type,category,event_key,title,body,href,data
    )
    select m.location_id,m.user_id,'training','training','training.certification_expiry',
      'Certification expiration',m.title||' expires '||m.expires_on::text,
      '/training',jsonb_build_object('certification_id',m.id,'expires_on',m.expires_on)
    from managers m
    where not exists(
      select 1 from public.notifications n
      where n.user_id=m.user_id
        and n.type='training'
        and n.data->>'certification_id'=m.id::text
        and n.data->>'expires_on'=m.expires_on::text
        and n.created_at>=now()-interval '7 days'
    )
    returning 1
  )
  select count(*) into inserted_count from ins;
  return inserted_count;
end
$function$;

revoke all on function public.refresh_certification_expiry_notifications() from public,anon,authenticated;
grant execute on function public.refresh_certification_expiry_notifications() to service_role;
