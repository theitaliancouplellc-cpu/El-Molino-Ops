-- PRODUCTION APPLIED: mfa_internal_helper_surface_v3
--
-- Keep MFA enforcement semantics unchanged while removing internal security
-- predicates from the exposed public RPC schema. Also re-close the generic
-- consume_rate_limit helper to authenticated callers after production evidence
-- showed no runtime use or database dependencies.

create or replace function private.current_mfa_factor_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from auth.sessions s
    join private.mfa_approved_factors a
      on a.factor_id=s.factor_id and a.user_id=s.user_id
    where s.id=nullif(auth.jwt()->>'session_id','')::uuid
      and s.user_id=auth.uid()
      and s.aal::text='aal2'
  )
$$;

create or replace function private.current_mfa_bootstrap_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from private.mfa_bootstrap_sessions b
    join auth.sessions s on s.id=b.session_id and s.user_id=b.user_id
    where b.session_id=nullif(auth.jwt()->>'session_id','')::uuid
      and b.user_id=auth.uid()
      and b.consumed_at is null
      and b.expires_at>now()
  )
$$;

create or replace function private.current_mfa_access_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_mfa_factor_approved()
      or private.current_mfa_bootstrap_allowed()
$$;

revoke all on function private.current_mfa_factor_approved() from public, anon, authenticated;
revoke all on function private.current_mfa_bootstrap_allowed() from public, anon, authenticated;
revoke all on function private.current_mfa_access_allowed() from public, anon;
grant execute on function private.current_mfa_access_allowed() to authenticated, service_role;

create or replace function public.my_mfa_access_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sid uuid := nullif(auth.jwt()->>'session_id','')::uuid;
  factor uuid;
  approved boolean := false;
  bootstrap boolean := false;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select s.factor_id into factor
  from auth.sessions s
  where s.id=sid and s.user_id=auth.uid();

  approved := factor is not null and private.current_mfa_factor_approved();
  bootstrap := exists(
    select 1
    from private.mfa_bootstrap_sessions b
    where b.session_id=sid
      and b.user_id=auth.uid()
      and b.consumed_at is null
      and b.expires_at>now()
  );

  return jsonb_build_object(
    'aal2',coalesce(auth.jwt()->>'aal','aal1')='aal2',
    'factor_approved',approved,
    'bootstrap_eligible',bootstrap
  );
end;
$$;

create or replace function public.finalize_my_mfa_bootstrap()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid := nullif(auth.jwt()->>'session_id','')::uuid;
  factor uuid;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then
    raise exception 'aal2 session required';
  end if;

  select s.factor_id into factor
  from auth.sessions s
  where s.id=sid
    and s.user_id=auth.uid()
    and s.aal::text='aal2';

  if factor is null then raise exception 'verified factor required'; end if;
  if not private.current_mfa_bootstrap_allowed() then
    raise exception 'trusted bootstrap session required';
  end if;

  insert into private.mfa_approved_factors(factor_id,user_id,approved_by,approval_source)
  values(factor,auth.uid(),auth.uid(),'bootstrap')
  on conflict(factor_id) do update set
    user_id=excluded.user_id,
    approved_at=now(),
    approved_by=excluded.approved_by,
    approval_source='bootstrap';

  update private.mfa_bootstrap_sessions
  set consumed_at=now()
  where user_id=auth.uid() and consumed_at is null;

  return true;
end;
$$;

create or replace function public.enforce_el_molino_aal2_request()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  path text := coalesce(current_setting('request.path',true),'');
begin
  if coalesce(claims->>'role','') <> 'authenticated' then return; end if;
  if private.current_mfa_factor_approved() then return; end if;
  if private.current_mfa_bootstrap_allowed() then return; end if;

  if coalesce(claims->>'aal','aal1') <> 'aal2' then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code','MFA_REQUIRED',
        'message','Two-step authentication is required for El Molino Ops.'
      )::text,
      detail = json_build_object('status',403)::text;
  end if;

  if right(path,length('rpc/my_mfa_access_status'))='rpc/my_mfa_access_status' then
    return;
  end if;

  raise sqlstate 'PGRST' using
    message = json_build_object(
      'code','MFA_FACTOR_NOT_APPROVED',
      'message','This authenticator factor is not approved for El Molino Ops.'
    )::text,
    detail = json_build_object('status',403)::text;
end;
$$;

-- Repoint every existing RLS MFA gate to the private helper.
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
    execute format(
      'drop policy if exists %I on public.%I',
      'mfa_approved_factor_gate',r.relname
    );
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using ((select private.current_mfa_access_allowed())) with check ((select private.current_mfa_access_allowed()))',
      'mfa_approved_factor_gate',r.relname
    );
  end loop;
end $$;

drop policy if exists mfa_approved_factor_gate on storage.objects;
create policy mfa_approved_factor_gate
  on storage.objects
  as restrictive
  for all
  to authenticated
  using ((select private.current_mfa_access_allowed()))
  with check ((select private.current_mfa_access_allowed()));

-- The old public predicates no longer need to exist as PostgREST RPCs.
drop function if exists public.current_mfa_access_allowed();
drop function if exists public.current_mfa_factor_approved();
drop function if exists public.current_mfa_bootstrap_allowed();

-- Production evidence: no pg_stat_statements runtime calls and no pg_proc
-- function dependencies. Keep only server-side access.
revoke all on function public.consume_rate_limit(text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text,text,integer,integer)
  to service_role;
