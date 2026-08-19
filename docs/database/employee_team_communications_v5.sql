-- Phase 2 Staff Communications v5
-- Additive expansion of the existing Team Hub. No destructive message-history conversion.

alter table public.team_channels drop constraint if exists team_channels_channel_kind_check;
alter table public.team_channels add constraint team_channels_channel_kind_check
  check(channel_kind in('direct','group','roster','system'));
alter table public.team_channels add column if not exists system_key text;
alter table public.team_channels add column if not exists client_request_id uuid;
alter table public.team_channels add column if not exists created_by_employee_id uuid references public.employees(id);
create unique index if not exists team_channels_system_key_uq on public.team_channels(location_id,system_key) where system_key is not null;
create unique index if not exists team_channels_client_request_uq on public.team_channels(location_id,created_by_user_id,client_request_id) where client_request_id is not null;

alter table public.team_channel_messages add column if not exists client_message_id uuid;
alter table public.team_channel_messages add column if not exists reply_to_message_id uuid references public.team_channel_messages(id) on delete set null;
create unique index if not exists team_channel_messages_client_id_uq on public.team_channel_messages(channel_id,author_employee_id,client_message_id) where client_message_id is not null;
create index if not exists team_channel_messages_reply_idx on public.team_channel_messages(reply_to_message_id) where reply_to_message_id is not null;

create table if not exists public.team_message_reactions(
  message_id uuid not null references public.team_channel_messages(id) on delete cascade,
  channel_id uuid not null references public.team_channels(id) on delete cascade,
  location_id uuid not null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  reaction text not null check(reaction in('like','heart','celebrate','ack')),
  created_at timestamptz not null default now(),
  primary key(message_id,employee_id,reaction)
);
create index if not exists team_message_reactions_channel_idx on public.team_message_reactions(channel_id,created_at desc);
create index if not exists team_message_reactions_employee_idx on public.team_message_reactions(employee_id,created_at desc);
alter table public.team_message_reactions enable row level security;
revoke all on public.team_message_reactions from anon,authenticated;

create table if not exists public.team_message_mentions(
  message_id uuid not null references public.team_channel_messages(id) on delete cascade,
  channel_id uuid not null references public.team_channels(id) on delete cascade,
  location_id uuid not null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(message_id,employee_id)
);
create index if not exists team_message_mentions_employee_idx on public.team_message_mentions(employee_id,created_at desc);
alter table public.team_message_mentions enable row level security;
revoke all on public.team_message_mentions from anon,authenticated;

create or replace function public.can_receive_team_channel_topic(p_topic text)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1
    from public.team_channel_members m
    join public.team_channels c on c.id=m.channel_id and c.location_id=m.location_id and c.archived_at is null
    join public.employees e on e.id=m.employee_id and e.location_id=m.location_id
    where e.user_id=auth.uid()
      and e.active and e.deleted_at is null and coalesce(e.employment_status,'active')='active'
      and p_topic='team:'||c.id::text
  )
$$;
revoke all on function public.can_receive_team_channel_topic(text) from public,anon;
grant execute on function public.can_receive_team_channel_topic(text) to authenticated;

drop policy if exists el_molino_team_channel_broadcast_receive on realtime.messages;
create policy el_molino_team_channel_broadcast_receive
on realtime.messages for select to authenticated
using (
  realtime.messages.extension='broadcast'
  and public.can_receive_team_channel_topic((select realtime.topic()))
);

create or replace function private.broadcast_team_channel_change()
returns trigger language plpgsql security definer set search_path='pg_catalog','public','realtime' as $$
declare cid uuid;
begin
  cid:=case when tg_op='DELETE' then old.channel_id else new.channel_id end;
  if cid is not null then
    perform realtime.broadcast_changes(
      'team:'||cid::text,
      tg_op,
      tg_op,
      tg_table_name,
      tg_table_schema,
      new,
      old,
      'record'
    );
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end$$;
revoke all on function private.broadcast_team_channel_change() from public,anon,authenticated;

drop trigger if exists team_channel_messages_realtime on public.team_channel_messages;
create trigger team_channel_messages_realtime after insert or update or delete on public.team_channel_messages
for each row execute function private.broadcast_team_channel_change();
drop trigger if exists team_message_reactions_realtime on public.team_message_reactions;
create trigger team_message_reactions_realtime after insert or update or delete on public.team_message_reactions
for each row execute function private.broadcast_team_channel_change();
drop trigger if exists team_channel_members_read_realtime on public.team_channel_members;
create trigger team_channel_members_read_realtime after update of last_read_at on public.team_channel_members
for each row when(old.last_read_at is distinct from new.last_read_at)
execute function private.broadcast_team_channel_change();

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

  insert into public.team_channel_members(channel_id,location_id,employee_id,last_read_at)
  select cid,loc,e.id,case when e.id=me then now() else null end
  from public.employees e
  where e.location_id=loc and e.active and e.deleted_at is null and coalesce(e.employment_status,'active')='active'
  on conflict(channel_id,employee_id) do update set location_id=excluded.location_id;
  return cid;
end$$;
revoke all on function public.ensure_staff_roster_channel() from public,anon;
grant execute on function public.ensure_staff_roster_channel() to authenticated;

create or replace function public.start_team_group_channel(p_title text,p_member_employee_ids uuid[],p_client_request_id uuid)
returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $$
declare loc uuid:=public.current_location_id(); me uuid:=public.current_schedule_employee_id(); cid uuid; valid_members int; requested_members int;
begin
  if auth.uid() is null or loc is null or me is null then raise exception 'active employee login required'; end if;
  if char_length(trim(coalesce(p_title,''))) not between 1 and 160 then raise exception 'group name must be 1-160 characters'; end if;
  if p_client_request_id is null then raise exception 'client request id is required'; end if;

  select c.id into cid from public.team_channels c
  where c.location_id=loc and c.created_by_user_id=auth.uid() and c.client_request_id=p_client_request_id
  limit 1;
  if cid is not null then return cid; end if;

  select count(distinct u.employee_id)::int into requested_members
  from unnest(coalesce(p_member_employee_ids,'{}'::uuid[])) as u(employee_id)
  where u.employee_id<>me;
  if requested_members<1 or requested_members>49 then raise exception 'group requires 1-49 other active teammates'; end if;
  select count(distinct e.id)::int into valid_members
  from unnest(coalesce(p_member_employee_ids,'{}'::uuid[])) as u(employee_id)
  join public.employees e on e.id=u.employee_id
  where e.id<>me and e.location_id=loc and e.active and e.deleted_at is null and coalesce(e.employment_status,'active')='active';
  if valid_members<>requested_members then raise exception 'all group members must be active teammates at this location'; end if;

  insert into public.team_channels(location_id,channel_kind,title,client_request_id,created_by_user_id,created_by_employee_id)
  values(loc,'group',trim(p_title),p_client_request_id,auth.uid(),me)
  on conflict do nothing returning id into cid;
  if cid is null then
    select c.id into cid from public.team_channels c
    where c.location_id=loc and c.created_by_user_id=auth.uid() and c.client_request_id=p_client_request_id limit 1;
  end if;
  if cid is null then raise exception 'could not create group'; end if;

  insert into public.team_channel_members(channel_id,location_id,employee_id,last_read_at)
  values(cid,loc,me,now()) on conflict(channel_id,employee_id) do nothing;
  insert into public.team_channel_members(channel_id,location_id,employee_id)
  select cid,loc,e.id
  from unnest(p_member_employee_ids) as u(employee_id)
  join public.employees e on e.id=u.employee_id
  where e.id<>me and e.location_id=loc and e.active and e.deleted_at is null and coalesce(e.employment_status,'active')='active'
  on conflict(channel_id,employee_id) do nothing;
  return cid;
end$$;
revoke all on function public.start_team_group_channel(text,uuid[],uuid) from public,anon;
grant execute on function public.start_team_group_channel(text,uuid[],uuid) to authenticated;

create or replace function public.my_team_channels()
returns jsonb language sql stable security definer set search_path='pg_catalog','public' as $$
with me as(select public.current_schedule_employee_id() eid,public.current_location_id() loc),
base as(
 select c.id,c.channel_kind,c.title,m.last_read_at,
   case when c.channel_kind='direct' then coalesce((select e.full_name from public.team_channel_members om join public.employees e on e.id=om.employee_id where om.channel_id=c.id and om.employee_id<>me.eid limit 1),c.title,'Conversation') else coalesce(c.title,'Team conversation') end display_name,
   (select max(x.created_at) from public.team_channel_messages x where x.channel_id=c.id and x.deleted_at is null) last_message_at,
   (select count(*)::int from public.team_channel_messages x where x.channel_id=c.id and x.deleted_at is null and x.author_employee_id<>me.eid and x.created_at>coalesce(m.last_read_at,'epoch'::timestamptz)) unread_count,
   (select left(x.body,160) from public.team_channel_messages x where x.channel_id=c.id and x.deleted_at is null order by x.created_at desc limit 1) last_message,
   (select count(*)::int from public.team_channel_members cm where cm.channel_id=c.id) member_count,
   (select coalesce(jsonb_agg(cm.employee_id order by cm.employee_id),'[]'::jsonb) from public.team_channel_members cm where cm.channel_id=c.id) member_ids
 from me
 join public.team_channel_members m on m.employee_id=me.eid and m.location_id=me.loc
 join public.team_channels c on c.id=m.channel_id and c.location_id=me.loc and c.archived_at is null
)
select coalesce(jsonb_agg(to_jsonb(base) order by coalesce(last_message_at,'epoch'::timestamptz) desc,display_name),'[]'::jsonb) from base
$$;
revoke all on function public.my_team_channels() from public,anon;
grant execute on function public.my_team_channels() to authenticated;

create or replace function public.team_channel_messages_for_me(p_channel_id uuid,p_limit integer default 100)
returns jsonb language sql stable security definer set search_path='pg_catalog','public' as $$
with me as(select public.current_schedule_employee_id() eid,public.current_location_id() loc),
allowed as(select 1 from me join public.team_channel_members m on m.employee_id=me.eid and m.location_id=me.loc and m.channel_id=p_channel_id),
limited as(
 select x.id,x.channel_id,x.author_employee_id,e.full_name author_name,x.body,x.created_at,x.reply_to_message_id,(x.author_employee_id=me.eid) mine,me.eid
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
 'read_by_count',(select count(*)::int from public.team_channel_members cm where cm.channel_id=l.channel_id and cm.employee_id<>l.author_employee_id and cm.last_read_at>=l.created_at),
 'recipient_count',greatest(0,(select count(*)::int-1 from public.team_channel_members cm where cm.channel_id=l.channel_id))
) order by l.created_at),'[]'::jsonb)
from limited l
left join public.team_channel_messages pm on pm.id=l.reply_to_message_id and pm.channel_id=l.channel_id
left join public.employees pe on pe.id=pm.author_employee_id
$$;
revoke all on function public.team_channel_messages_for_me(uuid,integer) from public,anon;
grant execute on function public.team_channel_messages_for_me(uuid,integer) to authenticated;

create or replace function public.mark_team_channel_read(p_channel_id uuid)
returns boolean language plpgsql security definer set search_path='pg_catalog','public' as $$
declare loc uuid:=public.current_location_id();me uuid:=public.current_schedule_employee_id();
begin
 if auth.uid() is null or loc is null or me is null then raise exception 'active employee login required';end if;
 update public.team_channel_members set last_read_at=greatest(coalesce(last_read_at,'epoch'::timestamptz),now()) where channel_id=p_channel_id and employee_id=me and location_id=loc;
 if not found then raise exception 'conversation not available';end if;
 return true;
end$$;
revoke all on function public.mark_team_channel_read(uuid) from public,anon;
grant execute on function public.mark_team_channel_read(uuid) to authenticated;

create or replace function public.send_team_channel_message_v2(p_channel_id uuid,p_body text,p_client_message_id uuid,p_reply_to_message_id uuid default null,p_mentioned_employee_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','public' as $$
declare loc uuid:=public.current_location_id();me uuid:=public.current_schedule_employee_id();mid uuid;sender text;kind text;mention_requested int:=0;mention_valid int:=0;
begin
 if auth.uid() is null or loc is null or me is null then raise exception 'active employee login required';end if;
 if p_client_message_id is null then raise exception 'client message id is required';end if;
 if char_length(trim(coalesce(p_body,''))) not between 1 and 2000 then raise exception 'message must be 1-2000 characters';end if;
 select c.channel_kind into kind from public.team_channel_members m join public.team_channels c on c.id=m.channel_id
 where m.channel_id=p_channel_id and m.employee_id=me and m.location_id=loc and c.location_id=loc and c.archived_at is null;
 if kind is null then raise exception 'conversation not available';end if;
 if kind='system' and public.current_app_role() not in('admin','manager') then raise exception 'system channel is read-only';end if;
 if p_reply_to_message_id is not null and not exists(select 1 from public.team_channel_messages x where x.id=p_reply_to_message_id and x.channel_id=p_channel_id and x.location_id=loc and x.deleted_at is null) then raise exception 'reply target is not available';end if;

 select x.id into mid from public.team_channel_messages x where x.channel_id=p_channel_id and x.author_employee_id=me and x.client_message_id=p_client_message_id limit 1;
 if mid is not null then return jsonb_build_object('message_id',mid,'deduplicated',true);end if;

 select count(distinct u.employee_id)::int into mention_requested
 from unnest(coalesce(p_mentioned_employee_ids,'{}'::uuid[])) as u(employee_id)
 where u.employee_id<>me;
 select count(distinct m.employee_id)::int into mention_valid
 from unnest(coalesce(p_mentioned_employee_ids,'{}'::uuid[])) as u(employee_id)
 join public.team_channel_members m on m.employee_id=u.employee_id and m.channel_id=p_channel_id and m.location_id=loc
 where u.employee_id<>me;
 if mention_requested<>mention_valid then raise exception 'mentions must be members of this conversation';end if;

 insert into public.team_channel_messages(channel_id,location_id,author_employee_id,body,client_message_id,reply_to_message_id)
 values(p_channel_id,loc,me,trim(p_body),p_client_message_id,p_reply_to_message_id) returning id into mid;
 select e.full_name into sender from public.employees e where e.id=me;
 update public.team_channel_members set last_read_at=now() where channel_id=p_channel_id and employee_id=me and location_id=loc;
 insert into public.team_message_mentions(message_id,channel_id,location_id,employee_id)
 select mid,p_channel_id,loc,m.employee_id
 from unnest(coalesce(p_mentioned_employee_ids,'{}'::uuid[])) as u(employee_id)
 join public.team_channel_members m on m.employee_id=u.employee_id and m.channel_id=p_channel_id and m.location_id=loc
 where m.employee_id<>me on conflict do nothing;

 insert into public.notifications(location_id,user_id,type,title,body,href,data,category,event_key,dedupe_key,priority)
 select loc,e.user_id,'team',
   case when tm.employee_id is not null then 'Mention from '||coalesce(sender,'Teammate') else 'New message from '||coalesce(sender,'Teammate') end,
   left(trim(p_body),160),'/employee/team?channel='||p_channel_id::text,
   jsonb_build_object('channel_id',p_channel_id,'message_id',mid,'mentioned',tm.employee_id is not null),
   'team',case when tm.employee_id is not null then 'team.mention' else 'team.message' end,
   'team.message:'||mid::text||':'||e.user_id::text,case when tm.employee_id is not null then 'high' else 'normal' end
 from public.team_channel_members m
 join public.employees e on e.id=m.employee_id
 left join public.team_message_mentions tm on tm.message_id=mid and tm.employee_id=m.employee_id
 where m.channel_id=p_channel_id and m.location_id=loc and m.employee_id<>me and e.user_id is not null and e.active and e.deleted_at is null
 on conflict do nothing;
 return jsonb_build_object('message_id',mid,'deduplicated',false);
exception when unique_violation then
 select x.id into mid from public.team_channel_messages x where x.channel_id=p_channel_id and x.author_employee_id=me and x.client_message_id=p_client_message_id limit 1;
 if mid is null then raise;end if;
 return jsonb_build_object('message_id',mid,'deduplicated',true);
end$$;
revoke all on function public.send_team_channel_message_v2(uuid,text,uuid,uuid,uuid[]) from public,anon;
grant execute on function public.send_team_channel_message_v2(uuid,text,uuid,uuid,uuid[]) to authenticated;

create or replace function public.send_team_channel_message(p_channel_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path='pg_catalog','public' as $$
declare out jsonb;
begin
 out:=public.send_team_channel_message_v2(p_channel_id,p_body,gen_random_uuid(),null,null);
 return (out->>'message_id')::uuid;
end$$;
revoke all on function public.send_team_channel_message(uuid,text) from public,anon;
grant execute on function public.send_team_channel_message(uuid,text) to authenticated;

create or replace function public.react_to_team_message(p_message_id uuid,p_reaction text)
returns boolean language plpgsql security definer set search_path='pg_catalog','public' as $$
declare loc uuid:=public.current_location_id();me uuid:=public.current_schedule_employee_id();cid uuid;
begin
 if auth.uid() is null or loc is null or me is null then raise exception 'active employee login required';end if;
 if p_reaction not in('like','heart','celebrate','ack') then raise exception 'invalid reaction';end if;
 select x.channel_id into cid from public.team_channel_messages x join public.team_channel_members m on m.channel_id=x.channel_id and m.employee_id=me and m.location_id=loc where x.id=p_message_id and x.location_id=loc and x.deleted_at is null;
 if cid is null then raise exception 'message not available';end if;
 insert into public.team_message_reactions(message_id,channel_id,location_id,employee_id,reaction) values(p_message_id,cid,loc,me,p_reaction) on conflict do nothing;
 return true;
end$$;
revoke all on function public.react_to_team_message(uuid,text) from public,anon;
grant execute on function public.react_to_team_message(uuid,text) to authenticated;

create or replace function public.remove_team_message_reaction(p_message_id uuid,p_reaction text)
returns boolean language plpgsql security definer set search_path='pg_catalog','public' as $$
declare loc uuid:=public.current_location_id();me uuid:=public.current_schedule_employee_id();
begin
 if auth.uid() is null or loc is null or me is null then raise exception 'active employee login required';end if;
 delete from public.team_message_reactions r using public.team_channel_messages x,public.team_channel_members m
 where r.message_id=p_message_id and r.employee_id=me and r.reaction=p_reaction and r.location_id=loc
   and x.id=r.message_id and x.channel_id=r.channel_id and x.location_id=loc
   and m.channel_id=x.channel_id and m.employee_id=me and m.location_id=loc;
 return true;
end$$;
revoke all on function public.remove_team_message_reaction(uuid,text) from public,anon;
grant execute on function public.remove_team_message_reaction(uuid,text) to authenticated;
