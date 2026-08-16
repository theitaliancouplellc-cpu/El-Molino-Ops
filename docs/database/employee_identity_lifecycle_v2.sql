-- Applied to production Supabase as migration: employee_identity_lifecycle_v2
-- Adds employment lifecycle state, auditable role verification, and employee-requested position changes.

alter table public.employees add column if not exists employment_status text;
alter table public.employees add column if not exists status_changed_at timestamptz;
alter table public.employees add column if not exists status_changed_by uuid references public.profiles(id);
alter table public.employees add column if not exists status_reason text;
update public.employees set employment_status=case when active and deleted_at is null then 'active' else 'inactive' end,status_changed_at=coalesce(status_changed_at,updated_at,created_at,now()) where employment_status is null;
alter table public.employees alter column employment_status set default 'active';
alter table public.employees alter column employment_status set not null;
alter table public.employees alter column status_changed_at set default now();
alter table public.employees alter column status_changed_at set not null;
alter table public.employees drop constraint if exists employees_employment_status_check;
alter table public.employees add constraint employees_employment_status_check check(employment_status in ('active','suspended','inactive'));

create table if not exists public.employee_employment_status_history(
 id uuid primary key default gen_random_uuid(),location_id uuid not null references public.locations(id),employee_id uuid not null references public.employees(id),from_status text,to_status text not null,reason text,actor_user_id uuid references public.profiles(id),future_shift_count integer not null default 0,override_used boolean not null default false,created_at timestamptz not null default now(),
 constraint employee_status_history_from_check check(from_status is null or from_status in ('active','suspended','inactive')),
 constraint employee_status_history_to_check check(to_status in ('active','suspended','inactive'))
);
create index if not exists employee_status_history_employee_idx on public.employee_employment_status_history(employee_id,created_at desc);
alter table public.employee_employment_status_history enable row level security;
drop policy if exists employee_status_history_manager_read on public.employee_employment_status_history;
create policy employee_status_history_manager_read on public.employee_employment_status_history for select to authenticated using(location_id=public.current_location_id() and public.current_app_role() in ('admin','manager'));
revoke insert,update,delete on public.employee_employment_status_history from authenticated;
grant select on public.employee_employment_status_history to authenticated;

create table if not exists public.employee_role_change_requests(
 id uuid primary key default gen_random_uuid(),location_id uuid not null references public.locations(id),employee_id uuid not null references public.employees(id),user_id uuid not null references public.profiles(id),status text not null default 'pending',employee_note text,manager_note text,submitted_at timestamptz not null default now(),reviewed_at timestamptz,reviewed_by uuid references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 constraint employee_role_change_status_check check(status in ('pending','approved','changes_requested','rejected','cancelled'))
);
create unique index if not exists employee_role_change_one_open_uidx on public.employee_role_change_requests(employee_id) where status='pending';
create index if not exists employee_role_change_location_status_idx on public.employee_role_change_requests(location_id,status,submitted_at);
alter table public.employee_role_change_requests enable row level security;
drop policy if exists employee_role_change_read on public.employee_role_change_requests;
create policy employee_role_change_read on public.employee_role_change_requests for select to authenticated using(location_id=public.current_location_id() and (public.current_app_role() in ('admin','manager') or user_id=auth.uid()));
revoke insert,update,delete on public.employee_role_change_requests from authenticated;
grant select on public.employee_role_change_requests to authenticated;

create table if not exists public.employee_role_change_request_roles(request_id uuid not null references public.employee_role_change_requests(id) on delete cascade,role_id uuid not null references public.employee_roles(id),primary key(request_id,role_id));
alter table public.employee_role_change_request_roles enable row level security;
drop policy if exists employee_role_change_request_roles_read on public.employee_role_change_request_roles;
create policy employee_role_change_request_roles_read on public.employee_role_change_request_roles for select to authenticated using(exists(select 1 from public.employee_role_change_requests q where q.id=request_id and q.location_id=public.current_location_id() and (public.current_app_role() in ('admin','manager') or q.user_id=auth.uid())));
revoke insert,update,delete on public.employee_role_change_request_roles from authenticated;
grant select on public.employee_role_change_request_roles to authenticated;

create table if not exists public.employee_role_assignment_history(
 id uuid primary key default gen_random_uuid(),location_id uuid not null references public.locations(id),employee_id uuid not null references public.employees(id),role_id uuid not null references public.employee_roles(id),action text not null,old_skill_level smallint,new_skill_level smallint,source text not null default 'direct',request_id uuid references public.employee_role_change_requests(id),actor_user_id uuid references public.profiles(id),created_at timestamptz not null default now(),constraint employee_role_history_action_check check(action in ('assigned','removed','skill_changed'))
);
create index if not exists employee_role_history_employee_idx on public.employee_role_assignment_history(employee_id,created_at desc);
alter table public.employee_role_assignment_history enable row level security;
drop policy if exists employee_role_history_manager_read on public.employee_role_assignment_history;
create policy employee_role_history_manager_read on public.employee_role_assignment_history for select to authenticated using(location_id=public.current_location_id() and public.current_app_role() in ('admin','manager'));
revoke insert,update,delete on public.employee_role_assignment_history from authenticated;
grant select on public.employee_role_assignment_history to authenticated;

create or replace function public.audit_employee_role_assignment_change() returns trigger language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare emp uuid:=coalesce(new.employee_id,old.employee_id);rid uuid:=coalesce(new.role_id,old.role_id);loc uuid;src text:=coalesce(nullif(current_setting('el_molino.role_change_source',true),''),'direct');req uuid;
begin
 select location_id into loc from public.employees where id=emp;
 begin req:=nullif(current_setting('el_molino.role_change_request_id',true),'')::uuid;exception when others then req:=null;end;
 if tg_op='INSERT' then insert into public.employee_role_assignment_history(location_id,employee_id,role_id,action,new_skill_level,source,request_id,actor_user_id) values(loc,new.employee_id,new.role_id,'assigned',new.skill_level,left(src,80),req,auth.uid());
 elsif tg_op='DELETE' then insert into public.employee_role_assignment_history(location_id,employee_id,role_id,action,old_skill_level,source,request_id,actor_user_id) values(loc,old.employee_id,old.role_id,'removed',old.skill_level,left(src,80),req,auth.uid());
 elsif new.skill_level is distinct from old.skill_level then insert into public.employee_role_assignment_history(location_id,employee_id,role_id,action,old_skill_level,new_skill_level,source,request_id,actor_user_id) values(loc,new.employee_id,new.role_id,'skill_changed',old.skill_level,new.skill_level,left(src,80),req,auth.uid());end if;
 return coalesce(new,old);
end $$;
drop trigger if exists trg_audit_employee_role_assignment_change on public.employee_role_assignments;
create trigger trg_audit_employee_role_assignment_change after insert or update or delete on public.employee_role_assignments for each row execute function public.audit_employee_role_assignment_change();
revoke all on function public.audit_employee_role_assignment_change() from public,anon,authenticated;grant execute on function public.audit_employee_role_assignment_change() to service_role;

create or replace function public.employee_self_setup_status() returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare loc uuid:=public.current_location_id();uid uuid:=auth.uid();c public.employee_self_setup_claims%rowtype;e public.employees%rowtype;role_ids jsonb:='[]'::jsonb;
begin
 if uid is null or loc is null then raise exception 'authentication required';end if;
 select * into e from public.employees where location_id=loc and user_id=uid and deleted_at is null limit 1;
 if found then select coalesce(jsonb_agg(era.role_id order by r.name),'[]'::jsonb) into role_ids from public.employee_role_assignments era join public.employee_roles r on r.id=era.role_id where era.employee_id=e.id;
  return jsonb_build_object('status','approved','employee_id',e.id,'full_name',e.full_name,'phone',e.phone,'requested_role_ids',role_ids,'manager_note',null,'employment_status',e.employment_status,'access_allowed',(e.employment_status='active' and e.active and e.deleted_at is null),'status_reason',e.status_reason,'status_changed_at',e.status_changed_at);
 end if;
 select * into c from public.employee_self_setup_claims where location_id=loc and user_id=uid limit 1;if not found then return jsonb_build_object('status','not_started','requested_role_ids','[]'::jsonb,'employment_status',null,'access_allowed',false);end if;
 select coalesce(jsonb_agg(rc.role_id order by r.name),'[]'::jsonb) into role_ids from public.employee_self_setup_role_claims rc join public.employee_roles r on r.id=rc.role_id where rc.claim_id=c.id;
 return jsonb_build_object('status',c.status,'claim_id',c.id,'employee_id',c.employee_id,'first_name',c.first_name,'last_name',c.last_name,'full_name',trim(c.first_name||' '||c.last_name),'phone',c.phone,'requested_role_ids',role_ids,'manager_note',c.manager_note,'submitted_at',c.submitted_at,'reviewed_at',c.reviewed_at,'employment_status',null,'access_allowed',false);
end $$;

create or replace function public.set_employee_employment_status(p_employee_id uuid,p_status text,p_reason text default null,p_override_future_shifts boolean default false) returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare loc uuid:=public.current_location_id();uid uuid:=auth.uid();e public.employees%rowtype;next_status text:=lower(trim(coalesce(p_status,'')));reason text:=nullif(left(trim(coalesce(p_reason,'')),2000),'');future_count integer:=0;old_status text;
begin
 if uid is null or loc is null or public.current_app_role() not in ('admin','manager') then raise exception 'manager access required';end if;if next_status not in ('active','suspended','inactive') then raise exception 'invalid employment status';end if;
 select * into e from public.employees where id=p_employee_id and location_id=loc and deleted_at is null for update;if not found then raise exception 'employee not found';end if;old_status:=e.employment_status;if old_status=next_status then return jsonb_build_object('ok',true,'status',next_status,'future_shift_count',0,'unchanged',true);end if;
 if next_status in ('suspended','inactive') and length(coalesce(reason,''))<3 then raise exception 'enter a reason for suspending or deactivating this employee';end if;if old_status='inactive' and next_status='suspended' then raise exception 'inactive employees must be reactivated before suspension';end if;
 select count(*) into future_count from public.schedule_shifts s where s.location_id=loc and s.employee_id=e.id and s.status in ('scheduled','covered') and s.ends_at>now();if next_status in ('suspended','inactive') and future_count>0 and not coalesce(p_override_future_shifts,false) then raise exception 'employee has future scheduled shifts; review coverage or confirm override';end if;
 update public.employees set employment_status=next_status,active=(next_status='active'),status_reason=reason,status_changed_at=now(),status_changed_by=uid,updated_at=now() where id=e.id;
 insert into public.employee_employment_status_history(location_id,employee_id,from_status,to_status,reason,actor_user_id,future_shift_count,override_used) values(loc,e.id,old_status,next_status,reason,uid,future_count,coalesce(p_override_future_shifts,false));
 if e.user_id is not null then insert into public.notifications(location_id,user_id,type,category,event_key,title,body,href,data,priority) values(loc,e.user_id,'account','account','employee.status_changed',case next_status when 'active' then 'Staff access restored' when 'suspended' then 'Staff access suspended' else 'Staff account inactive' end,coalesce(reason,case when next_status='active' then 'Your El Molino staff access is active.' else 'Please speak with a manager if you have questions.' end),case when next_status='active' then '/employee' else '/employee/access' end,jsonb_build_object('employee_id',e.id,'from_status',old_status,'to_status',next_status,'future_shift_count',future_count),case when next_status='active' then 'normal' else 'high' end);end if;
 return jsonb_build_object('ok',true,'status',next_status,'previous_status',old_status,'future_shift_count',future_count,'override_used',coalesce(p_override_future_shifts,false));
end $$;
revoke all on function public.set_employee_employment_status(uuid,text,text,boolean) from public,anon;grant execute on function public.set_employee_employment_status(uuid,text,text,boolean) to authenticated;

create or replace function public.my_employee_role_profile() returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare loc uuid:=public.current_location_id();uid uuid:=auth.uid();eid uuid;current_roles jsonb:='[]'::jsonb;req jsonb;
begin if uid is null or loc is null then raise exception 'authentication required';end if;select id into eid from public.employees where location_id=loc and user_id=uid and deleted_at is null limit 1;if eid is null then raise exception 'approved employee profile required';end if;
 select coalesce(jsonb_agg(jsonb_build_object('role_id',a.role_id,'name',r.name,'department',r.department,'skill_level',a.skill_level) order by r.name),'[]'::jsonb) into current_roles from public.employee_role_assignments a join public.employee_roles r on r.id=a.role_id where a.employee_id=eid;
 select jsonb_build_object('id',q.id,'status',q.status,'employee_note',q.employee_note,'manager_note',q.manager_note,'submitted_at',q.submitted_at,'reviewed_at',q.reviewed_at,'requested_role_ids',coalesce((select jsonb_agg(rr.role_id order by r.name) from public.employee_role_change_request_roles rr join public.employee_roles r on r.id=rr.role_id where rr.request_id=q.id),'[]'::jsonb)) into req from public.employee_role_change_requests q where q.employee_id=eid order by q.submitted_at desc limit 1;
 return jsonb_build_object('employee_id',eid,'current_roles',current_roles,'latest_request',req);end $$;
revoke all on function public.my_employee_role_profile() from public,anon;grant execute on function public.my_employee_role_profile() to authenticated;

create or replace function public.submit_employee_role_change_request(p_role_ids uuid[],p_employee_note text default null) returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare loc uuid:=public.current_location_id();uid uuid:=auth.uid();eid uuid;roles uuid[]:=coalesce(p_role_ids,'{}'::uuid[]);valid_count integer;req_id uuid;current_ids uuid[];
begin if uid is null or loc is null or public.current_app_role()<>'employee' then raise exception 'employee account required';end if;select id into eid from public.employees where location_id=loc and user_id=uid and employment_status='active' and active and deleted_at is null limit 1;if eid is null then raise exception 'active approved employee profile required';end if;if cardinality(roles)<1 then raise exception 'select at least one job role';end if;
 select count(*) into valid_count from public.employee_roles r where r.location_id=loc and r.id=any(roles) and r.department<>'management';if valid_count<>cardinality(array(select distinct x from unnest(roles) x)) then raise exception 'one or more selected roles are invalid';end if;select coalesce(array_agg(a.role_id order by a.role_id),'{}'::uuid[]) into current_ids from public.employee_role_assignments a where a.employee_id=eid;if (select array_agg(x order by x) from (select distinct unnest(roles) x) z) is not distinct from current_ids then raise exception 'selected roles already match your verified roles';end if;if exists(select 1 from public.employee_role_change_requests q where q.employee_id=eid and q.status='pending') then raise exception 'a role change request is already waiting for manager review';end if;
 insert into public.employee_role_change_requests(location_id,employee_id,user_id,status,employee_note) values(loc,eid,uid,'pending',nullif(left(trim(coalesce(p_employee_note,'')),2000),'')) returning id into req_id;insert into public.employee_role_change_request_roles(request_id,role_id) select req_id,x from unnest(roles) x group by x;return public.my_employee_role_profile();end $$;
revoke all on function public.submit_employee_role_change_request(uuid[],text) from public,anon;grant execute on function public.submit_employee_role_change_request(uuid[],text) to authenticated;

create or replace function public.cancel_my_employee_role_change_request(p_request_id uuid) returns boolean language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
begin if auth.uid() is null then raise exception 'authentication required';end if;update public.employee_role_change_requests set status='cancelled',updated_at=now() where id=p_request_id and user_id=auth.uid() and status='pending';return found;end $$;
revoke all on function public.cancel_my_employee_role_change_request(uuid) from public,anon;grant execute on function public.cancel_my_employee_role_change_request(uuid) to authenticated;

create or replace function public.review_employee_role_change_request(p_request_id uuid,p_decision text,p_approved_role_ids uuid[] default null,p_manager_note text default null,p_override_future_shifts boolean default false) returns jsonb language plpgsql security definer set search_path='pg_catalog','public','auth' as $$
declare loc uuid:=public.current_location_id();uid uuid:=auth.uid();q public.employee_role_change_requests%rowtype;decision text:=lower(trim(coalesce(p_decision,'')));roles uuid[];valid_count integer;future_conflicts integer:=0;note text:=nullif(left(trim(coalesce(p_manager_note,'')),2000),'');
begin if uid is null or loc is null or public.current_app_role() not in ('admin','manager') then raise exception 'manager access required';end if;if decision not in ('approved','changes_requested','rejected') then raise exception 'invalid review decision';end if;select * into q from public.employee_role_change_requests where id=p_request_id and location_id=loc for update;if not found then raise exception 'role change request not found';end if;if q.status<>'pending' then raise exception 'role change request is no longer pending';end if;
 if decision='approved' then roles:=coalesce(p_approved_role_ids,array(select role_id from public.employee_role_change_request_roles where request_id=q.id));if cardinality(roles)<1 then raise exception 'select at least one approved role';end if;select count(*) into valid_count from public.employee_roles r where r.location_id=loc and r.id=any(roles) and r.department<>'management';if valid_count<>cardinality(array(select distinct x from unnest(roles) x)) then raise exception 'one or more approved roles are invalid';end if;select count(*) into future_conflicts from public.schedule_shifts s where s.location_id=loc and s.employee_id=q.employee_id and s.status in ('scheduled','covered') and s.ends_at>now() and not (s.role_id=any(roles));if future_conflicts>0 and not coalesce(p_override_future_shifts,false) then raise exception 'removing a role conflicts with future scheduled shifts; review the schedule or confirm override';end if;perform set_config('el_molino.role_change_source','employee_role_request',true);perform set_config('el_molino.role_change_request_id',q.id::text,true);delete from public.employee_role_assignments where employee_id=q.employee_id and not (role_id=any(roles));insert into public.employee_role_assignments(employee_id,role_id,skill_level) select q.employee_id,x,1 from unnest(roles) x group by x on conflict(employee_id,role_id) do nothing;end if;
 update public.employee_role_change_requests set status=decision,manager_note=note,reviewed_at=now(),reviewed_by=uid,updated_at=now() where id=q.id;insert into public.notifications(location_id,user_id,type,category,event_key,title,body,href,data,priority) values(loc,q.user_id,'account','account',case when decision='approved' then 'employee.roles_approved' when decision='changes_requested' then 'employee.roles_changes_requested' else 'employee.roles_rejected' end,case when decision='approved' then 'Verified positions updated' when decision='changes_requested' then 'Position request needs an update' else 'Position request not approved' end,coalesce(note,case when decision='approved' then 'Your verified job positions have been updated.' when decision='changes_requested' then 'Review the manager note and submit a new request.' else 'Your current verified positions have not changed.' end),'/account',jsonb_build_object('request_id',q.id,'decision',decision,'future_shift_conflicts',future_conflicts),case when decision='approved' then 'normal' else 'high' end);return jsonb_build_object('ok',true,'status',decision,'future_shift_conflicts',future_conflicts,'override_used',coalesce(p_override_future_shifts,false));end $$;
revoke all on function public.review_employee_role_change_request(uuid,text,uuid[],text,boolean) from public,anon;grant execute on function public.review_employee_role_change_request(uuid,text,uuid[],text,boolean) to authenticated;

-- review_employee_self_setup was also upgraded in production to:
-- * set employment_status='active' on approval,
-- * record reactivation history when linking an inactive record,
-- * label assignment-audit rows with source `employee_setup`,
-- * emit normalized employee.profile_* notification event keys.
