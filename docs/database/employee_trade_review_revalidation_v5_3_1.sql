create or replace function public.review_shift_change_request(p_request_id uuid,p_decision text)
returns boolean
language plpgsql
security definer
set search_path='pg_catalog','public'
as $$
declare r public.shift_change_requests%rowtype;a public.schedule_shifts%rowtype;b public.schedule_shifts%rowtype;loc uuid:=public.current_location_id();wa jsonb;wb jsonb;
begin
 if auth.uid() is null or public.current_app_role() not in('admin','manager') then raise exception 'manager access required';end if;
 if p_decision not in('approved','denied') then raise exception 'invalid decision';end if;
 select * into r from public.shift_change_requests where id=p_request_id and location_id=loc and status='pending' for update;
 if not found then return false;end if;
 if r.request_type='swap' and r.target_response not in('accepted','not_required') then raise exception 'coworker must accept the trade before manager review';end if;
 if p_decision='approved' then
  select * into a from public.schedule_shifts where id=r.shift_id and location_id=loc for update;
  if not found or a.ends_at<=now() then raise exception 'source shift is unavailable';end if;
  perform set_config('el_molino.published_schedule_rpc','1',true);
  if r.request_type in('callout','coverage') then
   update public.schedule_shifts set status='open',employee_id=null where id=a.id;
   if r.target_employee_id is not null then update public.schedule_shifts set employee_id=r.target_employee_id,status='covered',source='swap' where id=a.id;end if;
  elsif r.request_type='swap' then
   if r.target_shift_id is null then raise exception 'swap requires a target shift';end if;
   select * into b from public.schedule_shifts where id=r.target_shift_id and location_id=loc for update;
   if not found or b.ends_at<=now() or a.employee_id is null or b.employee_id is null then raise exception 'swap shifts are unavailable';end if;
   if r.requested_by_employee_id is distinct from a.employee_id then raise exception 'requester no longer owns source shift';end if;
   if r.target_employee_id is distinct from b.employee_id then raise exception 'target employee no longer owns target shift';end if;
   wa:=public.employee_trade_candidate_warnings(a.employee_id,a.id,b.id);
   wb:=public.employee_trade_candidate_warnings(b.employee_id,b.id,a.id);
   if exists(select 1 from jsonb_array_elements(wa) x where x->>'severity'='error') or exists(select 1 from jsonb_array_elements(wb) x where x->>'severity'='error') then raise exception 'trade can no longer be approved because eligibility changed';end if;
   update public.schedule_shifts set employee_id=null,status='open' where id in(a.id,b.id);
   update public.schedule_shifts set employee_id=b.employee_id,status='covered',source='swap' where id=a.id;
   update public.schedule_shifts set employee_id=a.employee_id,status='covered',source='swap' where id=b.id;
  end if;
 end if;
 update public.shift_change_requests set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=r.id;
 if r.requested_by_employee_id is not null then perform public.notify_schedule_employee(loc,r.requested_by_employee_id,'schedule','Shift request '||p_decision,initcap(r.request_type)||' request was '||p_decision||'.','/schedule/pool',jsonb_build_object('request_id',r.id,'decision',p_decision,'type',r.request_type));end if;
 if r.request_type='swap' and r.target_employee_id is not null and r.target_employee_id is distinct from r.requested_by_employee_id then perform public.notify_schedule_employee(loc,r.target_employee_id,'schedule','Shift swap '||p_decision,'A shift swap involving you was '||p_decision||'.','/schedule/pool',jsonb_build_object('request_id',r.id,'decision',p_decision));end if;
 return true;
end $$;
