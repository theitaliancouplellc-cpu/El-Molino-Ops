-- Authoritative pilot scorecard completion v1
-- Durable participant/day/task/defect/rollout evidence for dogfood, closed-pilot, and staged GA gates.

create table if not exists public.pilot_participants(
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  cohort_role text not null,
  device_label text,
  enrolled_at timestamptz not null default now(),
  enrolled_by uuid not null,
  active boolean not null default true,
  constraint pilot_participants_role_check check(cohort_role in('manager','staff')),
  constraint pilot_participants_device_check check(device_label is null or char_length(device_label) between 1 and 120),
  unique(location_id,employee_id)
);
create index if not exists pilot_participants_location_active_idx on public.pilot_participants(location_id,active,enrolled_at);
alter table public.pilot_participants enable row level security;
revoke all on public.pilot_participants from public,anon,authenticated;

create table if not exists public.pilot_task_catalog(
  task_key text primary key,
  cohort_role text not null,
  ordinal integer not null,
  label text not null,
  critical boolean not null default true,
  constraint pilot_task_catalog_key_check check(task_key ~ '^[a-z0-9_]{3,80}$'),
  constraint pilot_task_catalog_role_check check(cohort_role in('manager','staff')),
  constraint pilot_task_catalog_ordinal_check check(ordinal between 1 and 100),
  constraint pilot_task_catalog_label_check check(char_length(label) between 3 and 240),
  unique(cohort_role,ordinal)
);
alter table public.pilot_task_catalog enable row level security;
revoke all on public.pilot_task_catalog from public,anon,authenticated;

insert into public.pilot_task_catalog(task_key,cohort_role,ordinal,label,critical) values
('staff_sign_in','staff',1,'Sign in.',true),
('staff_next_shift','staff',2,'Find the next scheduled shift from Home.',true),
('staff_week_schedule','staff',3,'Open the full published weekly schedule.',true),
('staff_week_navigation','staff',4,'Navigate to a different week and back.',true),
('staff_in_app_schedule_notification','staff',5,'Receive and open a schedule publication/change notification in app.',true),
('staff_enable_push','staff',6,'Enable push alerts from Notification Preferences.',true),
('staff_closed_app_push','staff',7,'Receive a real closed-app push, tap it, and verify the employee-safe destination.',true),
('staff_submit_availability','staff',8,'Submit availability.',true),
('staff_submit_time_off','staff',9,'Submit time off.',true),
('staff_offer_shift','staff',10,'Offer a shift or request coverage.',true),
('staff_shift_pool_eligibility','staff',11,'View Shift Pool eligibility information.',true),
('staff_claim_open_shift','staff',12,'Claim an eligible open shift when one is available.',true),
('staff_reciprocal_trade','staff',13,'Participate in a reciprocal trade when applicable.',true),
('staff_read_announcement','staff',14,'Read an announcement.',true),
('staff_ack_announcement','staff',15,'Acknowledge a required announcement when assigned.',true),
('staff_open_training','staff',16,'Open assigned training.',true),
('staff_time_clock','staff',17,'View personal time-clock state/history.',true),
('staff_tips','staff',18,'View personal finalized tip information where available.',true),
('staff_offline_schedule','staff',19,'Go offline after loading a schedule and verify saved data is marked read-only/stale.',true),
('staff_reconnect_refresh','staff',20,'Reconnect and verify authoritative data refreshes.',true),
('staff_reauth','staff',21,'Sign out and sign back in.',true),
('manager_onboarding_review','manager',1,'Review and approve employee onboarding identity and roles.',true),
('manager_publish_schedule','manager',2,'Build and publish a schedule.',true),
('manager_modify_published_shift','manager',3,'Modify a published shift and notify affected staff.',true),
('manager_review_requests','manager',4,'Review availability and time-off requests.',true),
('manager_review_coverage','manager',5,'Review coverage and open-shift claims.',true),
('manager_review_trade','manager',6,'Review a coworker-accepted reciprocal trade.',true),
('manager_reject_stale_approval','manager',7,'Verify an ineligible or stale approval cannot be forced through.',true),
('manager_announcement_ack','manager',8,'Publish an announcement and verify recipient acknowledgment state.',true),
('manager_time_tip_privacy','manager',9,'Review timecard and tip workflows without exposing manager-only data to staff.',true),
('manager_audit_trail','manager',10,'Verify the audit trail for consequential actions.',true)
on conflict(task_key) do update set cohort_role=excluded.cohort_role,ordinal=excluded.ordinal,label=excluded.label,critical=excluded.critical;

create table if not exists public.pilot_daily_use(
  participant_id uuid not null references public.pilot_participants(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  first_seen_at timestamptz not null default now(),
  primary key(participant_id,business_date)
);
create index if not exists pilot_daily_use_location_date_idx on public.pilot_daily_use(location_id,business_date desc);
alter table public.pilot_daily_use enable row level security;
revoke all on public.pilot_daily_use from public,anon,authenticated;

create table if not exists public.pilot_task_results(
  participant_id uuid not null references public.pilot_participants(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  task_key text not null references public.pilot_task_catalog(task_key),
  outcome text not null,
  observed_at timestamptz not null default now(),
  recorded_by uuid not null,
  primary key(participant_id,task_key),
  constraint pilot_task_results_outcome_check check(outcome in('pass','fail','confusing','not_applicable'))
);
create index if not exists pilot_task_results_location_outcome_idx on public.pilot_task_results(location_id,outcome,observed_at desc);
alter table public.pilot_task_results enable row level security;
revoke all on public.pilot_task_results from public,anon,authenticated;

create table if not exists public.pilot_defects(
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  severity text not null,
  category text not null,
  summary text not null,
  status text not null default 'open',
  opened_at timestamptz not null default now(),
  opened_by uuid not null,
  resolved_at timestamptz,
  resolved_by uuid,
  constraint pilot_defects_severity_check check(severity in('P0','P1','P2','P3')),
  constraint pilot_defects_category_check check(category in('privacy','data_integrity','workflow','notification','usability','other')),
  constraint pilot_defects_status_check check(status in('open','resolved')),
  constraint pilot_defects_summary_check check(char_length(summary) between 3 and 240),
  constraint pilot_defects_resolution_check check((status='open' and resolved_at is null and resolved_by is null) or (status='resolved' and resolved_at is not null and resolved_by is not null))
);
create index if not exists pilot_defects_location_status_idx on public.pilot_defects(location_id,status,severity,opened_at desc);
alter table public.pilot_defects enable row level security;
revoke all on public.pilot_defects from public,anon,authenticated;

create table if not exists public.pilot_rollout_stages(
  location_id uuid not null references public.locations(id) on delete cascade,
  stage_percent integer not null,
  status text not null default 'planned',
  started_at timestamptz,
  completed_at timestamptz,
  schedule_cycle_verified boolean not null default false,
  stop_triggered boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid not null,
  primary key(location_id,stage_percent),
  constraint pilot_rollout_stage_check check(stage_percent in(25,50,100)),
  constraint pilot_rollout_status_check check(status in('planned','active','completed')),
  constraint pilot_rollout_timing_check check((status='planned' and started_at is null and completed_at is null) or (status='active' and started_at is not null and completed_at is null) or (status='completed' and started_at is not null and completed_at is not null)),
  constraint pilot_rollout_completion_check check(status<>'completed' or (schedule_cycle_verified and not stop_triggered))
);
alter table public.pilot_rollout_stages enable row level security;
revoke all on public.pilot_rollout_stages from public,anon,authenticated;

create or replace function public.pilot_enroll_employee(p_employee_id uuid,p_device_label text default null)
returns uuid
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare loc uuid:=public.current_location_id(); actor uuid:=auth.uid(); role_name text; cohort text; out_id uuid;
begin
  if actor is null or loc is null or public.current_app_role() not in('admin','manager') then raise exception 'manager access required'; end if;
  select p.app_role::text into role_name from public.employees e left join public.profiles p on p.id=e.user_id where e.id=p_employee_id and e.location_id=loc and e.active and e.deleted_at is null;
  if not found then raise exception 'eligible employee not found'; end if;
  cohort:=case when role_name in('admin','manager') then 'manager' else 'staff' end;
  insert into public.pilot_participants(location_id,employee_id,cohort_role,device_label,enrolled_by,active)
  values(loc,p_employee_id,cohort,nullif(left(trim(coalesce(p_device_label,'')),120),''),actor,true)
  on conflict(location_id,employee_id) do update set cohort_role=excluded.cohort_role,device_label=excluded.device_label,active=true
  returning id into out_id;
  return out_id;
end $$;
revoke all on function public.pilot_enroll_employee(uuid,text) from public,anon;
grant execute on function public.pilot_enroll_employee(uuid,text) to authenticated;

create or replace function public.pilot_set_participant_active(p_participant_id uuid,p_active boolean)
returns void
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare loc uuid:=public.current_location_id();
begin
  if auth.uid() is null or loc is null or public.current_app_role() not in('admin','manager') then raise exception 'manager access required'; end if;
  update public.pilot_participants set active=p_active where id=p_participant_id and location_id=loc;
  if not found then raise exception 'participant not found'; end if;
end $$;
revoke all on function public.pilot_set_participant_active(uuid,boolean) from public,anon;
grant execute on function public.pilot_set_participant_active(uuid,boolean) to authenticated;

create or replace function public.record_pilot_daily_use()
returns void
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare actor uuid:=auth.uid(); loc uuid:=public.current_location_id(); pid uuid; biz_date date;
begin
  if actor is null or loc is null then return; end if;
  select pp.id into pid from public.pilot_participants pp join public.employees e on e.id=pp.employee_id where pp.location_id=loc and pp.active and e.user_id=actor limit 1;
  if pid is null then return; end if;
  biz_date:=(now() at time zone 'America/New_York')::date;
  insert into public.pilot_daily_use(participant_id,location_id,business_date) values(pid,loc,biz_date) on conflict do nothing;
end $$;
revoke all on function public.record_pilot_daily_use() from public,anon;
grant execute on function public.record_pilot_daily_use() to authenticated;

create or replace function public.pilot_record_task_result(p_participant_id uuid,p_task_key text,p_outcome text)
returns void
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare loc uuid:=public.current_location_id(); actor uuid:=auth.uid(); cohort text; task_cohort text;
begin
  if actor is null or loc is null or public.current_app_role() not in('admin','manager') then raise exception 'manager access required'; end if;
  if p_outcome not in('pass','fail','confusing','not_applicable') then raise exception 'invalid pilot task outcome'; end if;
  select cohort_role into cohort from public.pilot_participants where id=p_participant_id and location_id=loc and active;
  if cohort is null then raise exception 'active participant not found'; end if;
  select cohort_role into task_cohort from public.pilot_task_catalog where task_key=p_task_key and critical;
  if task_cohort is null or task_cohort<>cohort then raise exception 'task does not apply to participant cohort'; end if;
  insert into public.pilot_task_results(participant_id,location_id,task_key,outcome,recorded_by)
  values(p_participant_id,loc,p_task_key,p_outcome,actor)
  on conflict(participant_id,task_key) do update set outcome=excluded.outcome,observed_at=now(),recorded_by=excluded.recorded_by,location_id=excluded.location_id;
end $$;
revoke all on function public.pilot_record_task_result(uuid,text,text) from public,anon;
grant execute on function public.pilot_record_task_result(uuid,text,text) to authenticated;

create or replace function public.pilot_report_defect(p_severity text,p_category text,p_summary text)
returns uuid
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare loc uuid:=public.current_location_id(); actor uuid:=auth.uid(); out_id uuid;
begin
  if actor is null or loc is null or public.current_app_role() not in('admin','manager') then raise exception 'manager access required'; end if;
  if p_severity not in('P0','P1','P2','P3') or p_category not in('privacy','data_integrity','workflow','notification','usability','other') then raise exception 'invalid pilot defect classification'; end if;
  if char_length(trim(coalesce(p_summary,''))) not between 3 and 240 then raise exception 'invalid pilot defect summary'; end if;
  insert into public.pilot_defects(location_id,severity,category,summary,opened_by) values(loc,p_severity,p_category,left(trim(p_summary),240),actor) returning id into out_id;
  return out_id;
end $$;
revoke all on function public.pilot_report_defect(text,text,text) from public,anon;
grant execute on function public.pilot_report_defect(text,text,text) to authenticated;

create or replace function public.pilot_resolve_defect(p_defect_id uuid)
returns void
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare loc uuid:=public.current_location_id(); actor uuid:=auth.uid();
begin
  if actor is null or loc is null or public.current_app_role() not in('admin','manager') then raise exception 'manager access required'; end if;
  update public.pilot_defects set status='resolved',resolved_at=now(),resolved_by=actor where id=p_defect_id and location_id=loc and status='open';
  if not found then raise exception 'open defect not found'; end if;
end $$;
revoke all on function public.pilot_resolve_defect(uuid) from public,anon;
grant execute on function public.pilot_resolve_defect(uuid) to authenticated;

create or replace function public.pilot_set_rollout_stage(p_stage_percent integer,p_status text,p_schedule_cycle_verified boolean default false,p_stop_triggered boolean default false)
returns void
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare loc uuid:=public.current_location_id(); actor uuid:=auth.uid(); prior_complete boolean;
begin
  if actor is null or loc is null or public.current_app_role()<>'admin' then raise exception 'admin access required'; end if;
  if p_stage_percent not in(25,50,100) or p_status not in('planned','active','completed') then raise exception 'invalid rollout stage'; end if;
  if p_status='completed' and (not p_schedule_cycle_verified or p_stop_triggered) then raise exception 'completed rollout stage requires a verified schedule cycle and no stop trigger'; end if;
  if p_stage_percent=50 then select coalesce((select status='completed' from public.pilot_rollout_stages where location_id=loc and stage_percent=25),false) into prior_complete; if p_status<>'planned' and not prior_complete then raise exception '25 percent stage must complete first'; end if; end if;
  if p_stage_percent=100 then select coalesce((select status='completed' from public.pilot_rollout_stages where location_id=loc and stage_percent=50),false) into prior_complete; if p_status<>'planned' and not prior_complete then raise exception '50 percent stage must complete first'; end if; end if;
  insert into public.pilot_rollout_stages(location_id,stage_percent,status,started_at,completed_at,schedule_cycle_verified,stop_triggered,updated_by)
  values(loc,p_stage_percent,p_status,case when p_status in('active','completed') then now() else null end,case when p_status='completed' then now() else null end,p_schedule_cycle_verified,p_stop_triggered,actor)
  on conflict(location_id,stage_percent) do update set status=excluded.status,started_at=case when excluded.status='planned' then null else coalesce(public.pilot_rollout_stages.started_at,now()) end,completed_at=case when excluded.status='completed' then now() else null end,schedule_cycle_verified=excluded.schedule_cycle_verified,stop_triggered=excluded.stop_triggered,updated_at=now(),updated_by=actor;
end $$;
revoke all on function public.pilot_set_rollout_stage(integer,text,boolean,boolean) from public,anon;
grant execute on function public.pilot_set_rollout_stage(integer,text,boolean,boolean) to authenticated;

create or replace function public.pilot_scorecard_snapshot(p_since timestamptz default now()-interval '7 days')
returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','public','auth'
as $$
declare
  loc uuid:=public.current_location_id();
  mutation jsonb;
  participant_count integer;
  manager_count integer;
  staff_count integer;
  managers_3day integer;
  staff_3day integer;
  participants_7day integer;
  expected_tasks integer;
  passed_tasks integer;
  na_tasks integer;
  task_rate numeric;
  critical_catalog_count integer;
  exercised_count integer;
  open_p01 integer;
  privacy_incidents integer;
  data_integrity_incidents integer;
  rollout_complete integer;
  result jsonb;
begin
  if auth.uid() is null or loc is null or public.current_app_role() not in('admin','manager') then raise exception 'manager access required'; end if;
  mutation:=public.pilot_operational_scorecard_snapshot(p_since);

  select count(*),count(*) filter(where cohort_role='manager'),count(*) filter(where cohort_role='staff')
  into participant_count,manager_count,staff_count from public.pilot_participants where location_id=loc and active;

  select count(*) filter(where cohort_role='manager' and days>=3),count(*) filter(where cohort_role='staff' and days>=3),count(*) filter(where days>=7)
  into managers_3day,staff_3day,participants_7day
  from (select pp.id,pp.cohort_role,count(du.business_date) days from public.pilot_participants pp left join public.pilot_daily_use du on du.participant_id=pp.id where pp.location_id=loc and pp.active group by pp.id,pp.cohort_role) x;

  select count(*) into expected_tasks from public.pilot_participants pp join public.pilot_task_catalog c on c.cohort_role=pp.cohort_role and c.critical where pp.location_id=loc and pp.active;
  select count(*) filter(where r.outcome='pass'),count(*) filter(where r.outcome='not_applicable') into passed_tasks,na_tasks from public.pilot_task_results r join public.pilot_participants pp on pp.id=r.participant_id where r.location_id=loc and pp.active;
  task_rate:=case when expected_tasks-na_tasks<=0 then null else round(100.0*passed_tasks/(expected_tasks-na_tasks),2) end;

  select count(*) into critical_catalog_count from public.pilot_task_catalog where critical;
  select count(distinct r.task_key) into exercised_count from public.pilot_task_results r join public.pilot_participants pp on pp.id=r.participant_id where r.location_id=loc and pp.active and r.outcome<>'not_applicable';
  select count(*) filter(where status='open' and severity in('P0','P1')),count(*) filter(where category='privacy'),count(*) filter(where category='data_integrity') into open_p01,privacy_incidents,data_integrity_incidents from public.pilot_defects where location_id=loc;
  select count(*) filter(where status='completed' and schedule_cycle_verified and not stop_triggered) into rollout_complete from public.pilot_rollout_stages where location_id=loc;

  select jsonb_build_object(
    'since',p_since,
    'mutations',mutation,
    'participant_count',participant_count,
    'manager_count',manager_count,
    'staff_count',staff_count,
    'managers_with_3_days',managers_3day,
    'staff_with_3_days',staff_3day,
    'participants_with_7_days',participants_7day,
    'expected_task_results',expected_tasks,
    'passed_task_results',passed_tasks,
    'not_applicable_task_results',na_tasks,
    'task_completion_rate',task_rate,
    'critical_tasks_total',critical_catalog_count,
    'critical_tasks_exercised',exercised_count,
    'open_p0_p1_defects',open_p01,
    'privacy_incidents',privacy_incidents,
    'data_integrity_incidents',data_integrity_incidents,
    'rollout_stages_completed',rollout_complete,
    'dogfood_exit',jsonb_build_object('participant_mix',managers_3day>=3 and staff_3day>=5,'task_coverage',exercised_count=critical_catalog_count,'no_open_p0_p1',open_p01=0),
    'closed_pilot_exit',jsonb_build_object('participant_days',participant_count between 10 and 20 and participants_7day=participant_count,'task_completion',coalesce(task_rate,0)>=95,'mutation_success',coalesce((mutation->>'success_rate')::numeric,0)>=99,'no_privacy_incidents',privacy_incidents=0,'no_data_integrity_incidents',data_integrity_incidents=0,'no_open_p0_p1',open_p01=0),
    'ga_exit',jsonb_build_object('all_rollout_stages',rollout_complete=3),
    'tasks',(select coalesce(jsonb_agg(jsonb_build_object('task_key',task_key,'cohort_role',cohort_role,'ordinal',ordinal,'label',label,'critical',critical) order by cohort_role,ordinal),'[]'::jsonb) from public.pilot_task_catalog),
    'participants',(select coalesce(jsonb_agg(jsonb_build_object('id',pp.id,'employee_id',pp.employee_id,'employee_name',e.full_name,'cohort_role',pp.cohort_role,'device_label',pp.device_label,'enrolled_at',pp.enrolled_at,'days_used',(select count(*) from public.pilot_daily_use du where du.participant_id=pp.id),'results',coalesce((select jsonb_object_agg(r.task_key,r.outcome) from public.pilot_task_results r where r.participant_id=pp.id),'{}'::jsonb)) order by pp.cohort_role,e.full_name),'[]'::jsonb) from public.pilot_participants pp join public.employees e on e.id=pp.employee_id where pp.location_id=loc and pp.active),
    'defects',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'severity',severity,'category',category,'summary',summary,'status',status,'opened_at',opened_at,'resolved_at',resolved_at) order by case severity when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end,opened_at desc),'[]'::jsonb) from public.pilot_defects where location_id=loc),
    'rollout',(select coalesce(jsonb_agg(jsonb_build_object('stage_percent',s.stage_percent,'status',s.status,'schedule_cycle_verified',s.schedule_cycle_verified,'stop_triggered',s.stop_triggered,'started_at',s.started_at,'completed_at',s.completed_at) order by s.stage_percent),'[]'::jsonb) from (values(25),(50),(100)) v(stage_percent) left join public.pilot_rollout_stages s on s.location_id=loc and s.stage_percent=v.stage_percent)
  ) into result;
  return result;
end $$;
revoke all on function public.pilot_scorecard_snapshot(timestamptz) from public,anon;
grant execute on function public.pilot_scorecard_snapshot(timestamptz) to authenticated;
