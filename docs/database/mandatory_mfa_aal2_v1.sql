-- Free server-side compensating control for the hosted leaked-password feature.
-- Apply only after the MFA gate is live in production.
-- TOTP MFA is a free Supabase Auth capability. This policy makes an aal1 password
-- session insufficient for restaurant data access, even when a caller bypasses
-- the El Molino client and talks to Supabase directly.

create or replace function public.enforce_el_molino_aal2_request()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
begin
  if coalesce(claims->>'role','') = 'authenticated'
     and coalesce(claims->>'aal','aal1') <> 'aal2' then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code','MFA_REQUIRED',
        'message','Two-step authentication is required for El Molino Ops.'
      )::text,
      detail = json_build_object('status',403)::text;
  end if;
end;
$$;

revoke all on function public.enforce_el_molino_aal2_request() from public;
grant execute on function public.enforce_el_molino_aal2_request() to anon, authenticated, service_role;

-- One central gate runs before every PostgREST table/RPC request. This catches
-- SECURITY DEFINER RPCs too, which ordinary RLS cannot protect by itself.
alter role authenticator set pgrst.db_pre_request = 'public.enforce_el_molino_aal2_request';
notify pgrst, 'reload config';

-- PostgREST pre-request hooks do not cover Realtime or Storage. Add a restrictive
-- AAL2 policy to every existing RLS-protected public table so those products
-- cannot turn an aal1 session into a bypass. Restrictive policies never grant
-- access; they only narrow whatever access existing policies already grant.
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relkind in ('r','p')
      and c.relrowsecurity
  loop
    execute format('drop policy if exists %I on public.%I','mfa_aal2_authenticated_gate',r.relname);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using ((select auth.jwt()->>''aal'') = ''aal2'') with check ((select auth.jwt()->>''aal'') = ''aal2'')',
      'mfa_aal2_authenticated_gate',r.relname
    );
  end loop;
end $$;

-- Storage has its own API and does not execute the PostgREST pre-request hook.
-- Its existing object policies remain authoritative; this only adds AAL2 as an
-- additional required condition for authenticated users.
drop policy if exists mfa_aal2_authenticated_gate on storage.objects;
create policy mfa_aal2_authenticated_gate
  on storage.objects
  as restrictive
  for all
  to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');

comment on function public.enforce_el_molino_aal2_request() is
'El Molino Ops free MFA compensating control: authenticated Data API sessions must have aal2.';
