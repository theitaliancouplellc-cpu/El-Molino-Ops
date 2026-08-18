-- PRODUCTION APPLIED: anonymous_function_surface_allowlist_v1
--
-- Old Supabase default privileges left many public-schema helpers executable by
-- anon. Most are internal trigger/utility functions and have no reason to exist
-- as anonymous Data API endpoints. Preserve only the three intentional public
-- functions and make all other inherited access explicit for signed-in/server
-- callers.

do $$
declare r record;
begin
  for r in
    select p.oid,
           n.nspname,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args,
           p.prorettype
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and has_function_privilege('anon',p.oid,'EXECUTE')
      and p.proname not in (
        'enforce_el_molino_aal2_request',
        'public_job_postings',
        'submit_job_application'
      )
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public, anon',
      r.nspname,r.proname,r.args
    );

    if r.prorettype <> 'trigger'::regtype then
      execute format(
        'grant execute on function %I.%I(%s) to authenticated, service_role',
        r.nspname,r.proname,r.args
      );
    end if;
  end loop;
end $$;

revoke execute on function public.enforce_el_molino_aal2_request() from public;
grant execute on function public.enforce_el_molino_aal2_request()
  to anon, authenticated, service_role;

revoke execute on function public.public_job_postings() from public;
grant execute on function public.public_job_postings()
  to anon, authenticated, service_role;

revoke execute on function public.submit_job_application(uuid,text,text,text,jsonb,text,text,boolean,boolean,text)
  from public, authenticated, service_role;
grant execute on function public.submit_job_application(uuid,text,text,text,jsonb,text,text,boolean,boolean,text)
  to anon;
