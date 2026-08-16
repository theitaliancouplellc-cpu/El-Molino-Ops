-- Applied to production Supabase as migration: employee_parity_staff_deep_links_v1
-- Keeps employee notifications inside dedicated staff surfaces.

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
    elsif new.href='/time-clock' then new.href:='/employee/time-clock';
    elsif new.href like '/time-clock?%' then new.href:='/employee/time-clock'||substring(new.href from 12);
    elsif new.href='/tips' then new.href:='/employee/tips';
    elsif new.href like '/tips?%' then new.href:='/employee/tips'||substring(new.href from 6);
    end if;
  end if;
  return new;
end $$;

update public.notifications n
set href=case
  when n.href='/schedule' then '/employee/schedule'
  when n.href like '/schedule?%' then '/employee/schedule'||substring(n.href from 10)
  when n.href='/time-clock' then '/employee/time-clock'
  when n.href like '/time-clock?%' then '/employee/time-clock'||substring(n.href from 12)
  when n.href='/tips' then '/employee/tips'
  when n.href like '/tips?%' then '/employee/tips'||substring(n.href from 6)
  else n.href end
where exists(select 1 from public.profiles p where p.id=n.user_id and p.app_role='employee')
  and (n.href='/schedule' or n.href like '/schedule?%' or n.href='/time-clock' or n.href like '/time-clock?%' or n.href='/tips' or n.href like '/tips?%');
