-- Applied to production Supabase as migration: employee_parity_notifications_v1
-- This file mirrors the production migration so the employee parity foundation is reviewable and recoverable.

alter table public.notifications add column if not exists category text;
alter table public.notifications add column if not exists event_key text;
alter table public.notifications add column if not exists dedupe_key text;
alter table public.notifications add column if not exists priority text;

update public.notifications
set category=coalesce(nullif(category,''),case
  when type='schedule' then 'schedule'
  when type='staffing' then 'requests'
  when type='employee_setup' then 'account'
  when type='training' then 'training'
  when type in ('team','announcement') then 'team'
  when type='time_clock' then 'time_clock'
  when type='tips' then 'tips'
  else 'general' end),
    event_key=coalesce(nullif(event_key,''),nullif(data->>'event_key',''),type,'info'),
    priority=coalesce(nullif(priority,''),'normal');

alter table public.notifications alter column category set default 'general';
alter table public.notifications alter column category set not null;
alter table public.notifications alter column event_key set default 'info';
alter table public.notifications alter column event_key set not null;
alter table public.notifications alter column priority set default 'normal';
alter table public.notifications alter column priority set not null;

alter table public.notifications drop constraint if exists notifications_priority_check;
alter table public.notifications add constraint notifications_priority_check check(priority in ('low','normal','high','critical'));
create index if not exists notifications_user_created_idx on public.notifications(user_id,created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id,created_at desc) where read_at is null;
create index if not exists notifications_user_category_idx on public.notifications(user_id,category,created_at desc);
create unique index if not exists notifications_user_dedupe_uidx on public.notifications(user_id,dedupe_key) where dedupe_key is not null;

create or replace function public.normalize_notification_event()
returns trigger
language plpgsql
set search_path='pg_catalog','public'
as $$
declare target_role public.app_role;
begin
  new.type:=left(coalesce(nullif(trim(new.type),''),'info'),80);
  new.category:=left(coalesce(nullif(trim(new.category),''),case
    when new.type='schedule' then 'schedule'
    when new.type='staffing' then 'requests'
    when new.type='employee_setup' then 'account'
    when new.type='training' then 'training'
    when new.type in ('team','announcement') then 'team'
    when new.type='time_clock' then 'time_clock'
    when new.type='tips' then 'tips'
    else 'general' end),80);
  new.event_key:=left(coalesce(nullif(trim(new.event_key),''),nullif(new.data->>'event_key',''),new.type,'info'),120);
  new.priority:=coalesce(nullif(trim(new.priority),''),'normal');
  if new.priority not in ('low','normal','high','critical') then new.priority:='normal'; end if;
  select p.app_role into target_role from public.profiles p where p.id=new.user_id;
  if target_role='employee' and new.href is not null then
    if new.href='/schedule' then new.href:='/employee/schedule';
    elsif new.href like '/schedule?%' then new.href:='/employee/schedule'||substring(new.href from 10);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_normalize_notification_event on public.notifications;
create trigger trg_normalize_notification_event before insert on public.notifications for each row execute function public.normalize_notification_event();

create or replace function public.guard_notification_update_fields()
returns trigger
language plpgsql
set search_path='pg_catalog','public'
as $$
begin
  if new.id is distinct from old.id
     or new.location_id is distinct from old.location_id
     or new.user_id is distinct from old.user_id
     or new.type is distinct from old.type
     or new.category is distinct from old.category
     or new.event_key is distinct from old.event_key
     or new.dedupe_key is distinct from old.dedupe_key
     or new.priority is distinct from old.priority
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.href is distinct from old.href
     or new.data is distinct from old.data
     or new.created_at is distinct from old.created_at then
    raise exception 'notification content is immutable';
  end if;
  return new;
end $$;

create table if not exists public.notification_preferences(
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id),
  user_id uuid not null references public.profiles(id),
  category text not null,
  in_app boolean not null default true,
  push boolean not null default true,
  email boolean not null default false,
  sms boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,category),
  constraint notification_preferences_category_check check(category in ('schedule','requests','shift_pool','team','training','time_clock','tips','account','general')),
  constraint notification_preferences_in_app_required check(in_app=true)
);
alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_own_read on public.notification_preferences;
create policy notification_preferences_own_read on public.notification_preferences for select to authenticated using(user_id=auth.uid() and location_id=public.current_location_id());

revoke all on public.notification_preferences from anon;
revoke insert,update,delete on public.notification_preferences from authenticated;
grant select on public.notification_preferences to authenticated;

create or replace function public.get_my_notification_preferences()
returns jsonb
language sql
security definer
set search_path='pg_catalog','public','auth'
as $$
  with categories(category,default_push) as (
    values ('schedule'::text,true),('requests',true),('shift_pool',true),('team',true),('training',true),('time_clock',true),('tips',true),('account',true),('general',true)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'category',c.category,
    'in_app',true,
    'push',coalesce(p.push,c.default_push),
    'email',coalesce(p.email,false),
    'sms',coalesce(p.sms,false),
    'settings',coalesce(p.settings,'{}'::jsonb)
  ) order by c.category),'[]'::jsonb)
  from categories c
  left join public.notification_preferences p on p.user_id=auth.uid() and p.location_id=public.current_location_id() and p.category=c.category
  where auth.uid() is not null and public.current_location_id() is not null;
$$;

create or replace function public.set_my_notification_preference(
  p_category text,
  p_push boolean,
  p_email boolean,
  p_sms boolean,
  p_settings jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare loc uuid:=public.current_location_id(); cat text:=lower(trim(coalesce(p_category,'')));
begin
  if auth.uid() is null or loc is null then raise exception 'authentication required'; end if;
  if cat not in ('schedule','requests','shift_pool','team','training','time_clock','tips','account','general') then raise exception 'invalid notification category'; end if;
  if pg_column_size(coalesce(p_settings,'{}'::jsonb))>8192 then raise exception 'notification settings are too large'; end if;
  insert into public.notification_preferences(location_id,user_id,category,in_app,push,email,sms,settings)
  values(loc,auth.uid(),cat,true,coalesce(p_push,true),coalesce(p_email,false),coalesce(p_sms,false),coalesce(p_settings,'{}'::jsonb))
  on conflict(user_id,category) do update set
    location_id=excluded.location_id,
    in_app=true,
    push=excluded.push,
    email=excluded.email,
    sms=excluded.sms,
    settings=excluded.settings,
    updated_at=now();
  return (select x from jsonb_array_elements(public.get_my_notification_preferences()) x where x->>'category'=cat limit 1);
end $$;

create or replace function public.mark_my_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  update public.notifications set read_at=coalesce(read_at,now()) where id=p_notification_id and user_id=auth.uid();
  return found;
end $$;

create or replace function public.mark_all_my_notifications_read(p_category text default null)
returns integer
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  update public.notifications set read_at=now()
  where user_id=auth.uid() and read_at is null and (p_category is null or category=p_category);
  get diagnostics n=row_count;
  return n;
end $$;

revoke all on function public.get_my_notification_preferences() from public,anon;
revoke all on function public.set_my_notification_preference(text,boolean,boolean,boolean,jsonb) from public,anon;
revoke all on function public.mark_my_notification_read(uuid) from public,anon;
revoke all on function public.mark_all_my_notifications_read(text) from public,anon;
grant execute on function public.get_my_notification_preferences() to authenticated;
grant execute on function public.set_my_notification_preference(text,boolean,boolean,boolean,jsonb) to authenticated;
grant execute on function public.mark_my_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_my_notifications_read(text) to authenticated;

create or replace function public.notify_employee_event(
  p_location uuid,
  p_employee uuid,
  p_category text,
  p_event_key text,
  p_title text,
  p_body text,
  p_href text,
  p_data jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_priority text default 'normal'
)
returns void
language sql
security definer
set search_path='pg_catalog','public'
as $$
  insert into public.notifications(location_id,user_id,type,category,event_key,title,body,href,data,dedupe_key,priority)
  select p_location,e.user_id,left(coalesce(nullif(p_category,''),'general'),80),left(coalesce(nullif(p_category,''),'general'),80),left(coalesce(nullif(p_event_key,''),'general.info'),120),left(p_title,240),left(coalesce(p_body,''),2000),p_href,coalesce(p_data,'{}'::jsonb),left(nullif(p_dedupe_key,''),240),case when p_priority in ('low','normal','high','critical') then p_priority else 'normal' end
  from public.employees e
  where e.id=p_employee and e.location_id=p_location and e.user_id is not null and e.active and e.deleted_at is null
  on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
$$;
revoke all on function public.notify_employee_event(uuid,uuid,text,text,text,text,text,jsonb,text,text) from public,anon,authenticated;

create or replace function public.publish_schedule_period_with_notifications(p_period_id uuid, p_expected_revision integer, p_override_reason text default null, p_notification_mode text default 'everyone')
returns jsonb
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare p public.schedule_periods%rowtype;issues jsonb;loc uuid:=public.current_location_id();has_errors boolean;new_revision integer;prior_publish timestamptz;event_id uuid;recipient_count int:=0;
begin
  if auth.uid() is null or public.current_app_role() not in ('admin','manager') then raise exception 'manager access required'; end if;
  if p_notification_mode not in ('everyone','changed_only','none') then raise exception 'invalid notification mode'; end if;
  select * into p from public.schedule_periods where id=p_period_id and location_id=loc for update;
  if not found then raise exception 'schedule period not found'; end if;
  if p.status='archived' then raise exception 'archived schedule cannot be published'; end if;
  if p.revision<>p_expected_revision then raise exception 'schedule changed; reload before publishing'; end if;
  select max(published_at) into prior_publish from public.schedule_publication_events where schedule_period_id=p.id;
  if p_notification_mode='changed_only' and prior_publish is null then raise exception 'changed-only notifications require a prior publication'; end if;
  issues:=public.schedule_period_validation(p.id);select exists(select 1 from jsonb_array_elements(issues) x where x->>'severity'='error') into has_errors;
  if has_errors and length(trim(coalesce(p_override_reason,'')))<5 then raise exception 'schedule has coverage errors; provide an override reason or fix coverage'; end if;
  perform set_config('el_molino.schedule_status_rpc','1',true);new_revision:=p.revision+1;
  update public.schedule_periods set status='published',published_at=now(),published_by=auth.uid(),publish_override_reason=nullif(left(trim(coalesce(p_override_reason,'')),2000),''),revision=new_revision,updated_by=auth.uid() where id=p.id;
  insert into public.schedule_publication_events(location_id,schedule_period_id,revision,notification_mode,published_by) values(loc,p.id,new_revision,p_notification_mode,auth.uid()) returning id into event_id;

  if p_notification_mode='everyone' then
    insert into public.notifications(location_id,user_id,type,category,event_key,title,body,href,data,dedupe_key,priority)
    select distinct loc,e.user_id,'schedule','schedule','schedule.published','Schedule published',p.starts_on::text||' through '||p.ends_on::text,
      '/employee/schedule?week='||p.starts_on::text||'&revision='||new_revision::text,
      jsonb_build_object('event_key','schedule.published','period_id',p.id,'week_start',p.starts_on,'revision',new_revision,'notification_mode',p_notification_mode),
      'schedule-publication:'||event_id::text,'normal'
    from public.schedule_shifts s join public.employees e on e.id=s.employee_id
    where s.schedule_period_id=p.id and s.status in ('scheduled','covered') and e.user_id is not null and e.active and e.deleted_at is null
    on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics recipient_count=row_count;
  elsif p_notification_mode='changed_only' then
    insert into public.notifications(location_id,user_id,type,category,event_key,title,body,href,data,dedupe_key,priority)
    select loc,e.user_id,'schedule','schedule','schedule.shift_changed','Your schedule changed',p.starts_on::text||' through '||p.ends_on::text,
      '/employee/schedule?week='||p.starts_on::text||'&revision='||new_revision::text||'&changed=1',
      jsonb_build_object(
        'event_key','schedule.shift_changed','period_id',p.id,'week_start',p.starts_on,'revision',new_revision,'notification_mode',p_notification_mode,
        'changed_shift_ids',(select coalesce(jsonb_agg(distinct c.shift_id),'[]'::jsonb) from public.schedule_shift_change_log c where c.schedule_period_id=p.id and c.changed_at>prior_publish and (c.old_employee_id=e.id or c.new_employee_id=e.id))
      ),
      'schedule-publication:'||event_id::text,'high'
    from public.employees e
    where e.user_id is not null and e.location_id=loc and e.active and e.deleted_at is null and e.id in (
      select c.old_employee_id from public.schedule_shift_change_log c where c.schedule_period_id=p.id and c.changed_at>prior_publish and c.old_employee_id is not null
      union
      select c.new_employee_id from public.schedule_shift_change_log c where c.schedule_period_id=p.id and c.changed_at>prior_publish and c.new_employee_id is not null
    )
    on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics recipient_count=row_count;
  end if;
  return jsonb_build_object('published',true,'revision',new_revision,'issues',issues,'notification_mode',p_notification_mode,'notified_employees',recipient_count,'publication_event_id',event_id);
end $$;
