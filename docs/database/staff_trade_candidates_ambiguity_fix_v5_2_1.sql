create or replace function public.staff_trade_candidates(p_shift_id uuid)
returns table(shift_id uuid,employee_id uuid,employee_name text,role_id uuid,role_name text,starts_at timestamptz,ends_at timestamptz)
language plpgsql
stable security definer
set search_path='pg_catalog','public','auth'
as $$
declare loc uuid:=public.current_location_id();eid uuid:=public.current_schedule_employee_id();src public.schedule_shifts%rowtype;
begin
 if auth.uid() is null or loc is null or eid is null then return;end if;
 select s.* into src from public.schedule_shifts s where s.id=p_shift_id and s.location_id=loc and s.employee_id=eid and s.status in('scheduled','covered');
 if not found or src.role_id is null then return;end if;
 if src.schedule_period_id is not null and not public.is_schedule_department_published(src.schedule_period_id,src.role_id) then return;end if;
 return query
 select t.id,t.employee_id,e.full_name,t.role_id,r.name,t.starts_at,t.ends_at
 from public.schedule_shifts t
 join public.employees e on e.id=t.employee_id and e.location_id=loc and e.active and e.deleted_at is null
 join public.employee_roles r on r.id=t.role_id and r.location_id=loc
 where t.location_id=loc and t.id<>src.id and t.employee_id is not null and t.employee_id<>eid and t.role_id is not null and t.status in('scheduled','covered') and t.ends_at>now()
   and(t.schedule_period_id is null or public.is_schedule_department_published(t.schedule_period_id,t.role_id))
   and exists(select 1 from public.employee_role_assignments a where a.employee_id=eid and a.role_id=t.role_id)
   and exists(select 1 from public.employee_role_assignments a where a.employee_id=t.employee_id and a.role_id=src.role_id)
   and not public.time_off_conflicts_shift(eid,loc,t.starts_at,t.ends_at,'approved')
   and not public.time_off_conflicts_shift(t.employee_id,loc,src.starts_at,src.ends_at,'approved')
   and not exists(select 1 from public.schedule_shifts x where x.location_id=loc and x.employee_id=eid and x.id not in(src.id,t.id) and x.status in('scheduled','covered') and x.starts_at<t.ends_at and x.ends_at>t.starts_at)
   and not exists(select 1 from public.schedule_shifts x where x.location_id=loc and x.employee_id=t.employee_id and x.id not in(src.id,t.id) and x.status in('scheduled','covered') and x.starts_at<src.ends_at and x.ends_at>src.starts_at)
 order by t.starts_at,e.full_name,t.id;
end$$;
