-- Follow-up hardening for the pilot scorecard completion model.
-- Keeps the pilot denominator limited to real signed-in employees and preserves planned rollout stage identities.

create or replace function public.pilot_enroll_employee(p_employee_id uuid,p_device_label text default null)
returns uuid
language plpgsql
security definer
set search_path='pg_catalog','public','auth'
as $$
declare loc uuid:=public.current_location_id(); actor uuid:=auth.uid(); role_name text; cohort text; out_id uuid;
begin
  if actor is null or loc is null or public.current_app_role() not in('admin','manager') then raise exception 'manager access required'; end if;
  select p.app_role::text into role_name
  from public.employees e
  join public.profiles p on p.id=e.user_id
  where e.id=p_employee_id and e.location_id=loc and e.active and e.deleted_at is null and e.user_id is not null;
  if not found or role_name is null then raise exception 'eligible signed-in employee not found'; end if;
  cohort:=case when role_name in('admin','manager') then 'manager' else 'staff' end;
  insert into public.pilot_participants(location_id,employee_id,cohort_role,device_label,enrolled_by,active)
  values(loc,p_employee_id,cohort,nullif(left(trim(coalesce(p_device_label,'')),120),''),actor,true)
  on conflict(location_id,employee_id) do update set cohort_role=excluded.cohort_role,device_label=excluded.device_label,active=true
  returning id into out_id;
  return out_id;
end $$;
revoke all on function public.pilot_enroll_employee(uuid,text) from public,anon;
grant execute on function public.pilot_enroll_employee(uuid,text) to authenticated;

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
  select count(*) filter(where r.outcome='pass'),count(*) filter(where r.outcome='not_applicable') into passed_tasks,na_tasks from public.pilot_task_results r join public.pilot_participants pp on pp.id=r.participant_id join public.pilot_task_catalog c on c.task_key=r.task_key and c.critical where r.location_id=loc and pp.active;
  task_rate:=case when expected_tasks-na_tasks<=0 then null else round(100.0*passed_tasks/(expected_tasks-na_tasks),2) end;

  select count(*) into critical_catalog_count from public.pilot_task_catalog where critical;
  select count(distinct r.task_key) into exercised_count from public.pilot_task_results r join public.pilot_participants pp on pp.id=r.participant_id join public.pilot_task_catalog c on c.task_key=r.task_key and c.critical where r.location_id=loc and pp.active and r.outcome<>'not_applicable';
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
    'rollout',(select coalesce(jsonb_agg(jsonb_build_object('stage_percent',v.stage_percent,'status',s.status,'schedule_cycle_verified',coalesce(s.schedule_cycle_verified,false),'stop_triggered',coalesce(s.stop_triggered,false),'started_at',s.started_at,'completed_at',s.completed_at) order by v.stage_percent),'[]'::jsonb) from (values(25),(50),(100)) v(stage_percent) left join public.pilot_rollout_stages s on s.location_id=loc and s.stage_percent=v.stage_percent)
  ) into result;
  return result;
end $$;
revoke all on function public.pilot_scorecard_snapshot(timestamptz) from public,anon;
grant execute on function public.pilot_scorecard_snapshot(timestamptz) to authenticated;
