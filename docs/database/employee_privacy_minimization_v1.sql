-- Applied to production Supabase as migration: employee_privacy_minimization_v1
-- Replaces broad same-location employee/qualification/schedule reads with minimum-necessary staff RPCs.

create or replace function public.staff_directory()
returns table(employee_id uuid, full_name text)
language sql stable security definer
set search_path='pg_catalog','public','auth'
as $$
  select e.id,e.full_name
  from public.employees e
  where auth.uid() is not null and e.location_id=public.current_location_id() and e.active and e.deleted_at is null
  order by e.full_name,e.id;
$$;
revoke all on function public.staff_directory() from public,anon;
grant execute on function public.staff_directory() to authenticated;

create or replace function public.can_view_shift_pool_offer(p_offer_id uuid)
returns boolean
language plpgsql stable security definer
set search_path='pg_catalog','public','auth'
as $$
declare loc uuid:=public.current_location_id();eid uuid:=public.current_schedule_employee_id();
begin
  if auth.uid() is null or loc is null then return false; end if;
  if public.current_app_role() in ('admin','manager') then return exists(select 1 from public.shift_pool_offers o where o.id=p_offer_id and o.location_id=loc); end if;
  if eid is null then return false; end if;
  return exists(
    select 1 from public.shift_pool_offers o join public.schedule_shifts s on s.id=o.shift_id and s.location_id=o.location_id
    where o.id=p_offer_id and o.location_id=loc and (
      o.offered_by_employee_id=eid or o.assigned_to_employee_id=eid or (
        o.status='open'
        and exists(select 1 from public.employee_role_assignments a where a.employee_id=eid and a.role_id=s.role_id)
        and (o.audience='role' or exists(select 1 from public.shift_pool_offer_recipients r where r.offer_id=o.id and r.employee_id=eid))
      )
    )
  );
end $$;
revoke all on function public.can_view_shift_pool_offer(uuid) from public,anon;
grant execute on function public.can_view_shift_pool_offer(uuid) to authenticated;

create or replace function public.staff_shift_pool_shifts()
returns table(id uuid,employee_id uuid,role_id uuid,starts_at timestamptz,ends_at timestamptz,status text,schedule_period_id uuid)
language plpgsql stable security definer
set search_path='pg_catalog','public','auth'
as $$
declare loc uuid:=public.current_location_id();eid uuid:=public.current_schedule_employee_id();
begin
  if auth.uid() is null or loc is null then return; end if;
  if eid is null and public.current_app_role() not in ('admin','manager') then return; end if;
  return query
  select s.id,s.employee_id,s.role_id,s.starts_at,s.ends_at,s.status,s.schedule_period_id
  from public.schedule_shifts s
  where s.location_id=loc and s.ends_at>now() and (
    public.current_app_role() in ('admin','manager')
    or s.employee_id=eid
    or (s.employee_id is null and s.status='open' and (s.schedule_period_id is null or public.is_schedule_department_published(s.schedule_period_id,s.role_id)))
    or exists(select 1 from public.shift_pool_offers o where o.shift_id=s.id and public.can_view_shift_pool_offer(o.id))
  ) order by s.starts_at,s.id;
end $$;
revoke all on function public.staff_shift_pool_shifts() from public,anon;
grant execute on function public.staff_shift_pool_shifts() to authenticated;

create or replace function public.staff_trade_candidates(p_shift_id uuid)
returns table(shift_id uuid,employee_id uuid,employee_name text,role_id uuid,role_name text,starts_at timestamptz,ends_at timestamptz)
language plpgsql stable security definer
set search_path='pg_catalog','public','auth'
as $$
declare loc uuid:=public.current_location_id();eid uuid:=public.current_schedule_employee_id();src public.schedule_shifts%rowtype;
begin
  if auth.uid() is null or loc is null or eid is null then return; end if;
  select * into src from public.schedule_shifts where id=p_shift_id and location_id=loc and employee_id=eid and status in ('scheduled','covered');
  if not found or src.role_id is null then return; end if;
  if src.schedule_period_id is not null and not public.is_schedule_department_published(src.schedule_period_id,src.role_id) then return; end if;
  return query
  select t.id,t.employee_id,e.full_name,t.role_id,r.name,t.starts_at,t.ends_at
  from public.schedule_shifts t
  join public.employees e on e.id=t.employee_id and e.location_id=loc and e.active and e.deleted_at is null
  join public.employee_roles r on r.id=t.role_id and r.location_id=loc
  where t.location_id=loc and t.id<>src.id and t.employee_id is not null and t.employee_id<>eid and t.role_id is not null
    and t.status in ('scheduled','covered') and t.ends_at>now()
    and (t.schedule_period_id is null or public.is_schedule_department_published(t.schedule_period_id,t.role_id))
    and exists(select 1 from public.employee_role_assignments a where a.employee_id=eid and a.role_id=t.role_id)
    and exists(select 1 from public.employee_role_assignments a where a.employee_id=t.employee_id and a.role_id=src.role_id)
    and not public.time_off_conflicts_shift(eid,loc,t.starts_at,t.ends_at,'approved')
    and not public.time_off_conflicts_shift(t.employee_id,loc,src.starts_at,src.ends_at,'approved')
    and not exists(select 1 from public.schedule_shifts x where x.location_id=loc and x.employee_id=eid and x.id not in (src.id,t.id) and x.status in ('scheduled','covered') and x.starts_at<t.ends_at and x.ends_at>t.starts_at)
    and not exists(select 1 from public.schedule_shifts x where x.location_id=loc and x.employee_id=t.employee_id and x.id not in (src.id,t.id) and x.status in ('scheduled','covered') and x.starts_at<src.ends_at and x.ends_at>src.starts_at)
  order by t.starts_at,e.full_name,t.id;
end $$;
revoke all on function public.staff_trade_candidates(uuid) from public,anon;
grant execute on function public.staff_trade_candidates(uuid) to authenticated;

drop policy if exists employees_location_read on public.employees;
create policy employees_location_read on public.employees for select to authenticated
using(location_id=public.current_location_id() and (public.current_app_role() in ('admin','manager') or user_id=auth.uid()));

drop policy if exists employee_role_assignments_read on public.employee_role_assignments;
create policy employee_role_assignments_read on public.employee_role_assignments for select to authenticated
using(exists(select 1 from public.employees e where e.id=employee_role_assignments.employee_id and e.location_id=public.current_location_id() and (public.current_app_role() in ('admin','manager') or e.user_id=auth.uid())));

drop policy if exists schedule_shifts_location_read on public.schedule_shifts;
create policy schedule_shifts_location_read on public.schedule_shifts for select to authenticated
using(location_id=public.current_location_id() and (public.current_app_role() in ('admin','manager') or employee_id=public.current_schedule_employee_id() or (employee_id is null and status='open' and (schedule_period_id is null or public.is_schedule_department_published(schedule_period_id,role_id)))));

drop policy if exists shift_pool_offers_read on public.shift_pool_offers;
create policy shift_pool_offers_read on public.shift_pool_offers for select to authenticated using(location_id=public.current_location_id() and public.can_view_shift_pool_offer(id));

drop policy if exists shift_pool_offer_recipients_read on public.shift_pool_offer_recipients;
create policy shift_pool_offer_recipients_read on public.shift_pool_offer_recipients for select to authenticated
using(exists(select 1 from public.shift_pool_offers o where o.id=shift_pool_offer_recipients.offer_id and o.location_id=public.current_location_id() and (public.current_app_role() in ('admin','manager') or shift_pool_offer_recipients.employee_id=public.current_schedule_employee_id() or o.offered_by_employee_id=public.current_schedule_employee_id())));
