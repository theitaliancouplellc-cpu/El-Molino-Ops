-- Phase 2 archived-channel and read-receipt hardening.
-- Archived conversations are not readable or mutable through Staff message RPCs.
-- Read evidence counts only currently active recipients at the channel location.

create or replace function public.team_channel_messages_for_me(p_channel_id uuid,p_limit integer default 100)
returns jsonb language sql stable security definer set search_path='pg_catalog','public' as $$
with me as(select public.current_schedule_employee_id() eid,public.current_location_id() loc),
allowed as(
 select 1
 from me
 join public.team_channel_members m on m.employee_id=me.eid and m.location_id=me.loc and m.channel_id=p_channel_id
 join public.team_channels c on c.id=m.channel_id and c.location_id=me.loc and c.archived_at is null
),
limited as(
 select x.id,x.channel_id,x.author_employee_id,e.full_name author_name,x.body,x.created_at,x.reply_to_message_id,(x.author_employee_id=me.eid) mine,me.eid,me.loc
 from me,allowed,public.team_channel_messages x
 join public.employees e on e.id=x.author_employee_id
 where x.channel_id=p_channel_id and x.location_id=me.loc and x.deleted_at is null
 order by x.created_at desc
 limit greatest(1,least(coalesce(p_limit,100),200))
)
select coalesce(jsonb_agg(jsonb_build_object(
 'id',l.id,'channel_id',l.channel_id,'author_employee_id',l.author_employee_id,'author_name',l.author_name,'body',l.body,'created_at',l.created_at,'mine',l.mine,
 'reply_to_message_id',l.reply_to_message_id,'reply_to_author_name',pe.full_name,'reply_to_body',case when pm.deleted_at is null then left(pm.body,240) else null end,
 'reaction_counts',coalesce((select jsonb_object_agg(z.reaction,z.n) from(select r.reaction,count(*)::int n from public.team_message_reactions r where r.message_id=l.id group by r.reaction) z),'{}'::jsonb),
 'my_reactions',coalesce((select jsonb_agg(r.reaction order by r.reaction) from public.team_message_reactions r where r.message_id=l.id and r.employee_id=l.eid),'[]'::jsonb),
 'read_by_count',(
   select count(*)::int
   from public.team_channel_members cm
   join public.employees ce on ce.id=cm.employee_id and ce.location_id=cm.location_id
   where cm.channel_id=l.channel_id and cm.location_id=l.loc and cm.employee_id<>l.author_employee_id
     and ce.active and ce.deleted_at is null and coalesce(ce.employment_status,'active')='active'
     and cm.last_read_at>=l.created_at
 ),
 'recipient_count',(
   select count(*)::int
   from public.team_channel_members cm
   join public.employees ce on ce.id=cm.employee_id and ce.location_id=cm.location_id
   where cm.channel_id=l.channel_id and cm.location_id=l.loc and cm.employee_id<>l.author_employee_id
     and ce.active and ce.deleted_at is null and coalesce(ce.employment_status,'active')='active'
 )
) order by l.created_at),'[]'::jsonb)
from limited l
left join public.team_channel_messages pm on pm.id=l.reply_to_message_id and pm.channel_id=l.channel_id
left join public.employees pe on pe.id=pm.author_employee_id
$$;
revoke all on function public.team_channel_messages_for_me(uuid,integer) from public,anon;
grant execute on function public.team_channel_messages_for_me(uuid,integer) to authenticated;

create or replace function public.react_to_team_message(p_message_id uuid,p_reaction text)
returns boolean language plpgsql security definer set search_path='pg_catalog','public' as $$
declare loc uuid:=public.current_location_id();me uuid:=public.current_schedule_employee_id();cid uuid;
begin
 if auth.uid() is null or loc is null or me is null then raise exception 'active employee login required';end if;
 if p_reaction not in('like','heart','celebrate','ack') then raise exception 'invalid reaction';end if;
 select x.channel_id into cid
 from public.team_channel_messages x
 join public.team_channel_members m on m.channel_id=x.channel_id and m.employee_id=me and m.location_id=loc
 join public.team_channels c on c.id=x.channel_id and c.location_id=loc and c.archived_at is null
 where x.id=p_message_id and x.location_id=loc and x.deleted_at is null;
 if cid is null then raise exception 'message not available';end if;
 insert into public.team_message_reactions(message_id,channel_id,location_id,employee_id,reaction)
 values(p_message_id,cid,loc,me,p_reaction) on conflict do nothing;
 return true;
end$$;
revoke all on function public.react_to_team_message(uuid,text) from public,anon;
grant execute on function public.react_to_team_message(uuid,text) to authenticated;

create or replace function public.remove_team_message_reaction(p_message_id uuid,p_reaction text)
returns boolean language plpgsql security definer set search_path='pg_catalog','public' as $$
declare loc uuid:=public.current_location_id();me uuid:=public.current_schedule_employee_id();
begin
 if auth.uid() is null or loc is null or me is null then raise exception 'active employee login required';end if;
 delete from public.team_message_reactions r
 using public.team_channel_messages x,public.team_channel_members m,public.team_channels c
 where r.message_id=p_message_id and r.employee_id=me and r.reaction=p_reaction and r.location_id=loc
   and x.id=r.message_id and x.channel_id=r.channel_id and x.location_id=loc and x.deleted_at is null
   and m.channel_id=x.channel_id and m.employee_id=me and m.location_id=loc
   and c.id=x.channel_id and c.location_id=loc and c.archived_at is null;
 return true;
end$$;
revoke all on function public.remove_team_message_reaction(uuid,text) from public,anon;
grant execute on function public.remove_team_message_reaction(uuid,text) to authenticated;
