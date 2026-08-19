-- Phase 2 release-boundary and roster-membership hardening.
-- System channels are schema-supported but intentionally absent from the Staff channel RPC until a later release.

create or replace function public.ensure_staff_roster_channel()
returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $$
declare loc uuid:=public.current_location_id(); me uuid:=public.current_schedule_employee_id(); cid uuid;
begin
  if auth.uid() is null or loc is null or me is null then raise exception 'active employee login required'; end if;
  insert into public.team_channels(location_id,channel_kind,title,system_key,created_by_user_id,created_by_employee_id)
  values(loc,'roster','All Staff','staff-roster',auth.uid(),me)
  on conflict(location_id,system_key) where system_key is not null
  do update set archived_at=null,title=excluded.title
  returning id into cid;

  delete from public.team_channel_members m
  where m.channel_id=cid and m.location_id=loc
    and not exists(
      select 1 from public.employees e
      where e.id=m.employee_id and e.location_id=loc and e.active and e.deleted_at is null
        and coalesce(e.employment_status,'active')='active'
    );

  insert into public.team_channel_members(channel_id,location_id,employee_id,last_read_at)
  select cid,loc,e.id,case when e.id=me then now() else null end
  from public.employees e
  where e.location_id=loc and e.active and e.deleted_at is null and coalesce(e.employment_status,'active')='active'
  on conflict(channel_id,employee_id) do update set location_id=excluded.location_id;
  return cid;
end$$;
revoke all on function public.ensure_staff_roster_channel() from public,anon;
grant execute on function public.ensure_staff_roster_channel() to authenticated;

create or replace function public.my_team_channels()
returns jsonb language sql stable security definer set search_path='pg_catalog','public' as $$
with me as(select public.current_schedule_employee_id() eid,public.current_location_id() loc),
base as(
 select c.id,c.channel_kind,c.title,m.last_read_at,
   case when c.channel_kind='direct' then coalesce((
     select e.full_name from public.team_channel_members om
     join public.employees e on e.id=om.employee_id
     where om.channel_id=c.id and om.employee_id<>me.eid limit 1
   ),c.title,'Conversation') else coalesce(c.title,'Team conversation') end display_name,
   (select max(x.created_at) from public.team_channel_messages x where x.channel_id=c.id and x.deleted_at is null) last_message_at,
   (select count(*)::int from public.team_channel_messages x where x.channel_id=c.id and x.deleted_at is null and x.author_employee_id<>me.eid and x.created_at>coalesce(m.last_read_at,'epoch'::timestamptz)) unread_count,
   (select left(x.body,160) from public.team_channel_messages x where x.channel_id=c.id and x.deleted_at is null order by x.created_at desc limit 1) last_message,
   (select count(*)::int from public.team_channel_members cm join public.employees ce on ce.id=cm.employee_id where cm.channel_id=c.id and ce.location_id=me.loc and ce.active and ce.deleted_at is null and coalesce(ce.employment_status,'active')='active') member_count,
   (select coalesce(jsonb_agg(cm.employee_id order by cm.employee_id),'[]'::jsonb) from public.team_channel_members cm join public.employees ce on ce.id=cm.employee_id where cm.channel_id=c.id and ce.location_id=me.loc and ce.active and ce.deleted_at is null and coalesce(ce.employment_status,'active')='active') member_ids
 from me
 join public.team_channel_members m on m.employee_id=me.eid and m.location_id=me.loc
 join public.team_channels c on c.id=m.channel_id and c.location_id=me.loc and c.archived_at is null and c.channel_kind<>'system'
)
select coalesce(jsonb_agg(to_jsonb(base) order by coalesce(last_message_at,'epoch'::timestamptz) desc,display_name),'[]'::jsonb) from base
$$;
revoke all on function public.my_team_channels() from public,anon;
grant execute on function public.my_team_channels() to authenticated;
