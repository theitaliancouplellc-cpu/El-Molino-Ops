create or replace function public.normalize_notification_event()
returns trigger language plpgsql set search_path='pg_catalog','public' as $$
declare target_role public.app_role;
begin
 new.type:=left(coalesce(nullif(trim(new.type),''),'info'),80);
 new.category:=left(coalesce(nullif(trim(new.category),''),case when new.type='schedule' then 'schedule' when new.type='staffing' then 'requests' when new.type='employee_setup' then 'account' when new.type='training' then 'training' when new.type in('team','announcement') then 'team' when new.type='time_clock' then 'time_clock' when new.type='tips' then 'tips' else 'general' end),80);
 new.event_key:=left(coalesce(nullif(trim(new.event_key),''),nullif(new.data->>'event_key',''),new.type,'info'),120);new.priority:=coalesce(nullif(trim(new.priority),''),'normal');if new.priority not in('low','normal','high','critical') then new.priority:='normal';end if;
 select p.app_role into target_role from public.profiles p where p.id=new.user_id;
 if target_role='employee' and new.href is not null then
  if new.href='/schedule' then new.href:='/employee/schedule';
  elsif new.href like '/schedule?%' then new.href:='/employee/schedule'||substring(new.href from 10);
  elsif new.href='/schedule/requests' then new.href:='/employee/requests';
  elsif new.href like '/schedule/requests?%' then new.href:='/employee/requests'||substring(new.href from 19);
  elsif new.href='/team' then new.href:='/employee/team';
  elsif new.href like '/team?%' then new.href:='/employee/team'||substring(new.href from 6);
  elsif new.href='/training/courses' then new.href:='/employee/training';
  elsif new.href like '/training/courses?%' then new.href:='/employee/training'||substring(new.href from 18);
  elsif new.href='/time-clock' then new.href:='/employee/time-clock';
  elsif new.href like '/time-clock?%' then new.href:='/employee/time-clock'||substring(new.href from 12);
  elsif new.href='/tips' then new.href:='/employee/tips';
  elsif new.href like '/tips?%' then new.href:='/employee/tips'||substring(new.href from 6);
  end if;
 end if;return new;
end$$;

drop function if exists public.send_team_announcement(text,text,text,uuid[],text[],uuid[],timestamptz,boolean);
create function public.send_team_announcement(p_title text,p_body text,p_priority text default 'normal',p_role_ids uuid[] default null,p_departments text[] default null,p_employee_ids uuid[] default null,p_expires_at timestamptz default null,p_requires_acknowledgment boolean default false)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare loc uuid:=public.current_location_id();aid uuid;n integer;must_ack boolean;
begin
 if auth.uid() is null or public.current_app_role() not in('admin','manager') then raise exception 'manager access required';end if;if length(trim(coalesce(p_title,''))) not between 1 and 160 or length(trim(coalesce(p_body,''))) not between 1 and 10000 then raise exception 'announcement title and message are required';end if;if p_priority not in('normal','important','urgent') then raise exception 'invalid announcement priority';end if;if p_expires_at is not null and p_expires_at<=now() then raise exception 'announcement expiration must be in the future';end if;
 must_ack:=coalesce(p_requires_acknowledgment,false) or p_priority='urgent';insert into public.team_announcements(location_id,title,body,priority,expires_at,sent_by,requires_acknowledgment) values(loc,left(trim(p_title),160),left(trim(p_body),10000),p_priority,p_expires_at,auth.uid(),must_ack) returning id into aid;
 insert into public.team_announcement_recipients(announcement_id,location_id,employee_id) select distinct aid,loc,e.id from public.employees e where e.location_id=loc and e.active and e.deleted_at is null and coalesce(e.employment_status,'active')='active' and((coalesce(cardinality(p_role_ids),0)=0 and coalesce(cardinality(p_departments),0)=0 and coalesce(cardinality(p_employee_ids),0)=0) or e.id=any(coalesce(p_employee_ids,'{}'::uuid[])) or exists(select 1 from public.employee_role_assignments era where era.employee_id=e.id and era.role_id=any(coalesce(p_role_ids,'{}'::uuid[]))) or exists(select 1 from public.employee_role_assignments era join public.employee_roles er on er.id=era.role_id where era.employee_id=e.id and er.location_id=loc and lower(er.department)=any(select lower(x) from unnest(coalesce(p_departments,'{}'::text[])) x)));get diagnostics n=row_count;if n=0 then raise exception 'announcement audience has no active employees';end if;
 insert into public.notifications(location_id,user_id,type,title,body,href,data,category,event_key,dedupe_key,priority) select loc,e.user_id,'announcement',left(trim(p_title),160),left(trim(p_body),500),'/employee/team?announcement='||aid::text,jsonb_build_object('announcement_id',aid,'requires_acknowledgment',must_ack),'team','team.announcement','team.announcement:'||aid::text||':'||e.user_id::text,case p_priority when 'urgent' then 'critical' when 'important' then 'high' else 'normal' end from public.team_announcement_recipients r join public.employees e on e.id=r.employee_id where r.announcement_id=aid and e.user_id is not null on conflict do nothing;
 return jsonb_build_object('announcement_id',aid,'recipients',n,'requires_acknowledgment',must_ack);
end$$;
grant execute on function public.send_team_announcement(text,text,text,uuid[],text[],uuid[],timestamptz,boolean) to authenticated;
revoke execute on function public.send_team_announcement(text,text,text,uuid[],text[],uuid[],timestamptz,boolean) from anon,public;
