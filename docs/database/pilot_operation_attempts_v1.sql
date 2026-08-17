-- Pilot authoritative operation-attempt ledger v1
-- Links trusted gateway attempts to committed database mutations using a request-scoped operation ID.

alter table public.pilot_committed_mutations add column if not exists operation_id uuid;
create index if not exists pilot_committed_mutations_operation_id_idx on public.pilot_committed_mutations(operation_id) where operation_id is not null;

create table if not exists public.pilot_operation_attempts(
  operation_id uuid primary key,
  occurred_at timestamptz not null default now(),
  location_id uuid not null,
  actor_user_id uuid not null,
  operation text not null,
  outcome text not null,
  error_code text,
  upstream_status integer,
  expected_mutation boolean not null default true,
  duration_ms integer,
  constraint pilot_operation_attempts_operation_check check(operation ~ '^[a-z0-9_]{3,80}$'),
  constraint pilot_operation_attempts_outcome_check check(outcome in('success','policy_rejection','failure')),
  constraint pilot_operation_attempts_status_check check(upstream_status is null or upstream_status between 100 and 599),
  constraint pilot_operation_attempts_duration_check check(duration_ms is null or duration_ms between 0 and 600000)
);
create index if not exists pilot_operation_attempts_location_time_idx on public.pilot_operation_attempts(location_id,occurred_at desc);
create index if not exists pilot_operation_attempts_operation_outcome_idx on public.pilot_operation_attempts(operation,outcome,occurred_at desc);
alter table public.pilot_operation_attempts enable row level security;
revoke all on public.pilot_operation_attempts from public,anon,authenticated;

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
  op_id uuid;
  raw_op_id text;
begin
  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  loc:=coalesce(nullif(row_data->>'location_id','')::uuid,public.current_location_id());
  if loc is null then raise exception 'pilot mutation location unavailable'; end if;
  eid:=row_data->>'id';
  op:=tg_table_name||'_'||lower(tg_op);
  raw_op_id:=coalesce(current_setting('request.headers',true)::jsonb->>'x-pilot-operation-id','');
  if raw_op_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then op_id:=raw_op_id::uuid; else op_id:=null; end if;
  insert into public.pilot_committed_mutations(location_id,actor_user_id,operation,entity_type,entity_id,operation_id)
  values(loc,auth.uid(),op,tg_table_name,left(eid,120),op_id);
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.capture_pilot_committed_mutation() from public,anon,authenticated;

-- Extend coverage for approved availability mutations that are materialized from requests.
do $$declare t text;begin
  foreach t in array array['employee_availability','employee_availability_overrides'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists pilot_capture_mutation on public.%I',t);
      execute format('create trigger pilot_capture_mutation after insert or update or delete on public.%I for each row execute function public.capture_pilot_committed_mutation()',t);
    end if;
  end loop;
end $$;

create or replace function public.pilot_operational_scorecard_snapshot(p_since timestamptz default now()-interval '7 days')
returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','public','auth'
as $$
declare loc uuid:=public.current_location_id(); result jsonb;
begin
  if auth.uid() is null or loc is null or public.current_app_role() not in('admin','manager') then raise exception 'manager access required'; end if;
  select jsonb_build_object(
    'since',p_since,
    'attempts',count(*),
    'eligible_attempts',count(*) filter(where outcome in('success','failure')),
    'successes',count(*) filter(where outcome='success'),
    'failures',count(*) filter(where outcome='failure'),
    'policy_rejections',count(*) filter(where outcome='policy_rejection'),
    'success_rate',case when count(*) filter(where outcome in('success','failure'))=0 then null else round(100.0*count(*) filter(where outcome='success')/count(*) filter(where outcome in('success','failure')),2) end,
    'successful_expected_mutations_without_commit_evidence',count(*) filter(where outcome='success' and expected_mutation and not exists(select 1 from public.pilot_committed_mutations m where m.operation_id=pilot_operation_attempts.operation_id)),
    'committed_mutations_without_gateway_id',(select count(*) from public.pilot_committed_mutations m where m.location_id=loc and m.occurred_at>=p_since and m.operation_id is null),
    'by_operation',coalesce((select jsonb_agg(to_jsonb(x) order by x.operation) from (
      select operation,count(*) attempts,count(*) filter(where outcome='success') successes,count(*) filter(where outcome='failure') failures,count(*) filter(where outcome='policy_rejection') policy_rejections
      from public.pilot_operation_attempts where location_id=loc and occurred_at>=p_since group by operation
    ) x),'[]'::jsonb)
  ) into result
  from public.pilot_operation_attempts
  where location_id=loc and occurred_at>=p_since;
  return result;
end $$;
revoke all on function public.pilot_operational_scorecard_snapshot(timestamptz) from public,anon;
grant execute on function public.pilot_operational_scorecard_snapshot(timestamptz) to authenticated;
