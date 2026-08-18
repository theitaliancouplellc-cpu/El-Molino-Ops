-- El Molino Ops: protect labor-budget and forecast configuration from employee clients.
--
-- The labor budget RPC is SECURITY DEFINER because it must aggregate employee pay
-- rates. It therefore must enforce the manager/admin boundary inside the function,
-- not rely on client navigation or RLS beneath it.

create or replace function public.schedule_labor_budget_report(p_period_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  p public.schedule_periods%rowtype;
  loc uuid:=public.current_location_id();
  tz text;
  ot_after numeric:=40;
  ot_mult numeric:=1.5;
  lp_target numeric;
  splh_target numeric;
  weekly_target numeric;
  days jsonb;
  tot_sales numeric:=0;
  tot_hours numeric:=0;
  total_base_cost numeric:=0;
  ot_hours numeric:=0;
  ot_premium numeric:=0;
  total_cost numeric:=0;
begin
  if auth.uid() is null or public.current_app_role() not in ('admin','manager') then
    raise exception 'manager access required';
  end if;

  select * into p
  from public.schedule_periods
  where id=p_period_id and location_id=loc;
  if not found then raise exception 'schedule period not found'; end if;

  tz:=public.schedule_timezone(loc);
  select coalesce(overtime_after_hours,40),
         coalesce(overtime_multiplier,1.5),
         labor_percent_target,
         sales_per_labor_hour_target,
         weekly_labor_cost_target
    into ot_after,ot_mult,lp_target,splh_target,weekly_target
  from public.schedule_settings
  where location_id=loc;

  with shift_paid as (
    select s.id,s.employee_id,(s.starts_at at time zone tz)::date business_date,
      coalesce(sp.hourly_rate,0) rate,
      greatest(0::numeric,extract(epoch from (s.ends_at-s.starts_at))/3600.0-
        (case when exists(select 1 from public.schedule_shift_breaks b where b.shift_id=s.id and b.status<>'cancelled')
          then coalesce((select sum(b.duration_minutes) from public.schedule_shift_breaks b where b.shift_id=s.id and not b.paid and b.status<>'cancelled'),0)
          else coalesce(s.break_minutes,0) end)/60.0) paid_hours
    from public.schedule_shifts s
    left join public.employee_schedule_profiles sp on sp.employee_id=s.employee_id and sp.location_id=s.location_id
    where s.schedule_period_id=p.id and s.employee_id is not null and s.status in ('scheduled','covered')
  ), daily as (
    select d::date business_date,coalesce(f.projected_sales,0)::numeric projected_sales,
      coalesce((select sum(x.paid_hours) from shift_paid x where x.business_date=d::date),0)::numeric paid_hours,
      coalesce((select sum(x.paid_hours*x.rate) from shift_paid x where x.business_date=d::date),0)::numeric daily_base_cost
    from generate_series(p.starts_on,p.ends_on,interval '1 day') d
    left join public.schedule_daily_forecasts f on f.location_id=loc and f.business_date=d::date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'business_date',daily.business_date,
           'projected_sales',round(daily.projected_sales,2),
           'scheduled_paid_hours',round(daily.paid_hours,2),
           'base_labor_cost',round(daily.daily_base_cost,2),
           'base_labor_percent',case when daily.projected_sales>0 then round(100*daily.daily_base_cost/daily.projected_sales,2) end,
           'sales_per_labor_hour',case when daily.paid_hours>0 then round(daily.projected_sales/daily.paid_hours,2) end
         ) order by daily.business_date),'[]'::jsonb),
         coalesce(sum(daily.projected_sales),0),
         coalesce(sum(daily.paid_hours),0),
         coalesce(sum(daily.daily_base_cost),0)
    into days,tot_sales,tot_hours,total_base_cost
  from daily;

  with shift_paid as (
    select s.employee_id,coalesce(sp.hourly_rate,0) rate,
      greatest(0::numeric,extract(epoch from (s.ends_at-s.starts_at))/3600.0-
        (case when exists(select 1 from public.schedule_shift_breaks b where b.shift_id=s.id and b.status<>'cancelled')
          then coalesce((select sum(b.duration_minutes) from public.schedule_shift_breaks b where b.shift_id=s.id and not b.paid and b.status<>'cancelled'),0)
          else coalesce(s.break_minutes,0) end)/60.0) paid_hours
    from public.schedule_shifts s
    left join public.employee_schedule_profiles sp on sp.employee_id=s.employee_id and sp.location_id=s.location_id
    where s.schedule_period_id=p.id and s.employee_id is not null and s.status in ('scheduled','covered')
  ), employee_totals as (
    select employee_id,max(rate) rate,sum(paid_hours) hours
    from shift_paid
    group by employee_id
  )
  select coalesce(sum(greatest(hours-ot_after,0)),0),
         coalesce(sum(greatest(hours-ot_after,0)*rate*greatest(ot_mult-1,0)),0)
    into ot_hours,ot_premium
  from employee_totals;

  total_cost:=total_base_cost+ot_premium;
  return jsonb_build_object(
    'period_id',p.id,
    'starts_on',p.starts_on,
    'ends_on',p.ends_on,
    'days',days,
    'projected_sales',round(tot_sales,2),
    'scheduled_paid_hours',round(tot_hours,2),
    'base_labor_cost',round(total_base_cost,2),
    'overtime_hours',round(ot_hours,2),
    'overtime_premium',round(ot_premium,2),
    'scheduled_labor_cost',round(total_cost,2),
    'labor_percent',case when tot_sales>0 then round(100*total_cost/tot_sales,2) end,
    'sales_per_labor_hour',case when tot_hours>0 then round(tot_sales/tot_hours,2) end,
    'labor_percent_target',lp_target,
    'sales_per_labor_hour_target',splh_target,
    'weekly_labor_cost_target',weekly_target
  );
end
$function$;

revoke all on function public.schedule_labor_budget_report(uuid) from public, anon;
grant execute on function public.schedule_labor_budget_report(uuid) to authenticated;

-- Forecast sales and labor target configuration are manager-side planning data.
-- Employee workflows consume only bounded outputs exposed by their own RPCs.
drop policy if exists schedule_settings_read on public.schedule_settings;
create policy schedule_settings_read
on public.schedule_settings
for select
to authenticated
using (
  location_id=public.current_location_id()
  and public.current_app_role() in ('admin','manager')
);

drop policy if exists schedule_daily_forecasts_read on public.schedule_daily_forecasts;
create policy schedule_daily_forecasts_read
on public.schedule_daily_forecasts
for select
to authenticated
using (
  location_id=public.current_location_id()
  and public.current_app_role() in ('admin','manager')
);
