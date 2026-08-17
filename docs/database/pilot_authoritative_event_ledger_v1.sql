-- Pilot authoritative committed-mutation ledger v1
-- This layer proves consequential database mutations that actually committed.
-- Attempt/success/failure rates are intentionally NOT calculated here: a failed
-- transaction rolls back its triggers, so attempted-operation outcomes require
-- a separate authoritative wrapper/server ledger.
-- No free-form notes, wages, tip amounts, PINs, request bodies, or payloads are stored.

create table if not exists public.pilot_committed_mutations(
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  location_id uuid not null,
  actor_user_id uuid,
  operation text not null,
  entity_type text not null,
  entity_id text,
  constraint pilot_committed_mutations_operation_check check(operation ~ '^[a-z0-9_]{3,80}$'),
  constraint pilot_committed_mutations_entity_type_check check(entity_type ~ '^[a-z0-9_]{2,80}$')
);

create index if not exists pilot_committed_mutations_location_time_idx
  on public.pilot_committed_mutations(location_id,occurred_at desc);
create index if not exists pilot_committed_mutations_operation_time_idx
  on public.pilot_committed_mutations(operation,occurred_at desc);

alter table public.pilot_committed_mutations enable row level security;
revoke all on public.pilot_committed_mutations from public,anon,authenticated;

-- Trigger-only writer. There is deliberately no authenticated RPC that lets a
-- browser manufacture pilot success records.
create or replace function public.capture_pilot_committed_mutation()
returns trigger
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare
  row_data jsonb;
  loc uuid;
  eid text;
  op text;
begin
  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  loc:=coalesce(nullif(row_data->>'location_id','')::uuid,public.current_location_id());
  if loc is null then raise exception 'pilot mutation location unavailable'; end if;
  eid:=row_data->>'id';
  op:=tg_table_name||'_'||lower(tg_op);
  insert into public.pilot_committed_mutations(location_id,actor_user_id,operation,entity_type,entity_id)
  values(loc,auth.uid(),op,tg_table_name,left(eid,120));
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.capture_pilot_committed_mutation() from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'availability_change_requests','time_off_requests','shift_change_requests','shift_claims',
    'schedule_shifts','schedule_department_publications','time_clock_punches','time_clock_breaks',
    'time_clock_pay_periods','tip_pool_runs','tip_distributions'
  ] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists pilot_capture_mutation on public.%I',t);
      execute format('create trigger pilot_capture_mutation after insert or update or delete on public.%I for each row execute function public.capture_pilot_committed_mutation()',t);
    end if;
  end loop;
end $$;

create or replace function public.pilot_committed_mutation_snapshot(p_since timestamptz default now()-interval '7 days')
returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','public','auth'
as $$
declare loc uuid:=public.current_location_id(); result jsonb;
begin
  if auth.uid() is null or loc is null or public.current_app_role() not in('admin','manager') then
    raise exception 'manager access required';
  end if;
  select jsonb_build_object(
    'since',p_since,
    'committed_mutations',count(*),
    'by_operation',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.operation)
      from (
        select operation,count(*) as committed
        from public.pilot_committed_mutations
        where location_id=loc and occurred_at>=p_since
        group by operation
      ) x
    ),'[]'::jsonb)
  ) into result
  from public.pilot_committed_mutations
  where location_id=loc and occurred_at>=p_since;
  return result;
end $$;
revoke all on function public.pilot_committed_mutation_snapshot(timestamptz) from public,anon;
grant execute on function public.pilot_committed_mutation_snapshot(timestamptz) to authenticated;
