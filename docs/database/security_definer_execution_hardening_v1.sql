-- Applied to production Supabase as migration: security_definer_execution_hardening_v1
-- Removes implicit PUBLIC/anonymous execution from privileged functions while preserving authenticated/service execution.

do $$
declare r record;
begin
  for r in
    select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
  loop
    execute format('revoke all on function %I.%I(%s) from public',r.nspname,r.proname,r.args);
    execute format('grant execute on function %I.%I(%s) to authenticated',r.nspname,r.proname,r.args);
    execute format('grant execute on function %I.%I(%s) to service_role',r.nspname,r.proname,r.args);
  end loop;
end $$;

grant execute on function public.public_job_postings() to anon;
grant execute on function public.submit_job_application(uuid,text,text,text,jsonb,text,text,boolean,boolean,text) to anon;

alter function public.schedule_net_hours(timestamptz,timestamptz,integer) set search_path='pg_catalog','public';
alter function public.schedule_is_summer_minor_hours(date) set search_path='pg_catalog','public';
