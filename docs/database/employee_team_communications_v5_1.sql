-- Read-watermark hardening for Phase 2 Realtime.
-- Advance only when a newer message exists so a read-receipt broadcast cannot trigger a self-sustaining reload loop.
create or replace function public.mark_team_channel_read(p_channel_id uuid)
returns boolean language plpgsql security definer set search_path='pg_catalog','public' as $$
declare
  loc uuid:=public.current_location_id();
  me uuid:=public.current_schedule_employee_id();
  latest_message_at timestamptz;
begin
  if auth.uid() is null or loc is null or me is null then raise exception 'active employee login required'; end if;
  if not exists(select 1 from public.team_channel_members m join public.team_channels c on c.id=m.channel_id where m.channel_id=p_channel_id and m.employee_id=me and m.location_id=loc and c.location_id=loc and c.archived_at is null) then
    raise exception 'conversation not available';
  end if;
  select max(x.created_at) into latest_message_at from public.team_channel_messages x where x.channel_id=p_channel_id and x.location_id=loc and x.deleted_at is null;
  if latest_message_at is not null then
    update public.team_channel_members
    set last_read_at=latest_message_at
    where channel_id=p_channel_id and employee_id=me and location_id=loc
      and coalesce(last_read_at,'epoch'::timestamptz)<latest_message_at;
  end if;
  return true;
end$$;
revoke all on function public.mark_team_channel_read(uuid) from public,anon;
grant execute on function public.mark_team_channel_read(uuid) to authenticated;
