-- Applied to production Supabase as migration: security_definer_anon_execution_hardening_v2
-- Explicitly removes anonymous execution from every public SECURITY DEFINER function,
-- then restores only the two intentional public recruiting endpoints.

do $$
declare r record;
begin
  for r in
    select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
  loop
    execute format('revoke execute on function %I.%I(%s) from anon',r.nspname,r.proname,r.args);
  end loop;
end $$;

grant execute on function public.public_job_postings() to anon;
grant execute on function public.submit_job_application(uuid,text,text,text,jsonb,text,text,boolean,boolean,text) to anon;
