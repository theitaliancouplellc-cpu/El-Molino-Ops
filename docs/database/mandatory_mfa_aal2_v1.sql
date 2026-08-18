-- Free server-side compensating control for the hosted leaked-password feature.
--
-- This migration is bootstrap-safe: it can be activated before the MFA UI has
-- propagated. Every NEW authenticated session is blocked from restaurant data
-- unless it has an approved TOTP factor. Only the single most-recent admin
-- session that already existed at migration time receives a temporary bootstrap
-- exception. A stolen password creates a different session_id and cannot use it.
-- Once that trusted session approves TOTP, the bootstrap exception is consumed
-- and normal access requires the approved factor.

create table if not exists private.mfa_approved_factors (
  factor_id uuid primary key references auth.mfa_factors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  approved_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null,
  approval_source text not null check (approval_source in ('bootstrap','manager'))
);

create index if not exists mfa_approved_factors_user_idx
  on private.mfa_approved_factors(user_id);

create table if not exists private.mfa_bootstrap_sessions (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

revoke all on table private.mfa_approved_factors from public, anon, authenticated;
revoke all on table private.mfa_bootstrap_sessions from public, anon, authenticated;

-- Select only the single most-recent pre-existing session for each pre-release
-- admin. The exception is deliberately session-bound, not password-bound. It is
-- long enough to survive deployment/device timing but cannot be recreated by a
-- public Auth call after this migration runs.
insert into private.mfa_bootstrap_sessions(session_id,user_id,expires_at)
select ranked.id,ranked.user_id,now()+interval '14 days'
from (
  select s.id,s.user_id,
         row_number() over(partition by s.user_id order by s.updated_at desc,s.created_at desc) as rn
  from auth.sessions s
  join public.profiles p on p.id=s.user_id
  where p.app_role='admin'
    and s.updated_at >= now()-interval '7 days'
) ranked
where ranked.rn=1
on conflict(session_id) do nothing;

-- If the trusted session already completed TOTP before migration activation,
-- approve that factor immediately.
insert into private.mfa_approved_factors(factor_id,user_id,approved_by,approval_source)
select distinct s.factor_id,s.user_id,s.user_id,'bootstrap'
from auth.sessions s
join private.mfa_bootstrap_sessions b on b.session_id=s.id and b.user_id=s.user_id
where s.factor_id is not null and s.aal::text='aal2'
on conflict(factor_id) do nothing;

create or replace function public.current_mfa_factor_approved()
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

revoke all on function public.current_mfa_factor_approved() from public;
grant execute on function public.current_mfa_factor_approved() to authenticated, service_role;

create or replace function public.current_mfa_bootstrap_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists(
      select 1
      from private.mfa_bootstrap_sessions b
      join auth.sessions s on s.id=b.session_id and s.user_id=b.user_id
      where b.session_id=nullif(auth.jwt()->>'session_id','')::uuid
        and b.user_id=auth.uid()
        and b.consumed_at is null
        and b.expires_at>now()
    )
    and not exists(
      select 1 from private.mfa_approved_factors a where a.user_id=auth.uid()
    )
$$;

revoke all on function public.current_mfa_bootstrap_allowed() from public;
grant execute on function public.current_mfa_bootstrap_allowed() to authenticated, service_role;

create or replace function public.current_mfa_access_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_mfa_factor_approved() or public.current_mfa_bootstrap_allowed()
$$;

revoke all on function public.current_mfa_access_allowed() from public;
grant execute on function public.current_mfa_access_allowed() to authenticated, service_role;

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
  select s.factor_id into factor from auth.sessions s where s.id=sid and s.user_id=auth.uid();
  approved := factor is not null and public.current_mfa_factor_approved();
  bootstrap := public.current_mfa_bootstrap_allowed();
  return jsonb_build_object(
    'aal2',coalesce(auth.jwt()->>'aal','aal1')='aal2',
    'factor_approved',approved,
    'bootstrap_eligible',bootstrap
  );
end;
$$;

revoke all on function public.my_mfa_access_status() from public;
grant execute on function public.my_mfa_access_status() to authenticated;

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
  where s.id=sid and s.user_id=auth.uid() and s.aal::text='aal2';
  if factor is null then raise exception 'verified factor required'; end if;

  if not public.current_mfa_bootstrap_allowed() then
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

revoke all on function public.finalize_my_mfa_bootstrap() from public;
grant execute on function public.finalize_my_mfa_bootstrap() to authenticated;

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

  -- Existing trusted bootstrap session remains usable while the MFA UI rolls
  -- out; approved aal2 sessions are also allowed. This check is session-bound.
  if public.current_mfa_access_allowed() then return; end if;

  -- Any NEW password-only session is stopped here, including callers bypassing
  -- the El Molino client and talking directly to Supabase Auth/Data API.
  if coalesce(claims->>'aal','aal1') <> 'aal2' then
    raise sqlstate 'PGRST' using
      message = json_build_object('code','MFA_REQUIRED','message','Two-step authentication is required for El Molino Ops.')::text,
      detail = json_build_object('status',403)::text;
  end if;

  -- A newly-enrolled but unapproved aal2 factor can inspect status so the app can
  -- explain why access is blocked. It cannot finalize unless it is the trusted
  -- bootstrap session (which would already have passed current_mfa_access_allowed).
  if right(path,length('rpc/my_mfa_access_status'))='rpc/my_mfa_access_status' then return; end if;

  raise sqlstate 'PGRST' using
    message = json_build_object('code','MFA_FACTOR_NOT_APPROVED','message','This authenticator factor is not approved for El Molino Ops.')::text,
    detail = json_build_object('status',403)::text;
end;
$$;

revoke all on function public.enforce_el_molino_aal2_request() from public;
grant execute on function public.enforce_el_molino_aal2_request() to anon, authenticated, service_role;

-- One central gate runs before every PostgREST table/RPC request. This catches
-- SECURITY DEFINER RPCs too, which ordinary RLS cannot protect by itself.
alter role authenticator set pgrst.db_pre_request = 'public.enforce_el_molino_aal2_request';
notify pgrst, 'reload config';

-- PostgREST pre-request hooks do not cover Realtime. Add a restrictive policy to
-- every existing RLS-protected public table. The trusted bootstrap session is
-- temporarily permitted; every new password session is denied. Once a factor is
-- approved the bootstrap condition automatically becomes false.
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
    execute format('drop policy if exists %I on public.%I','mfa_approved_factor_gate',r.relname);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using ((select public.current_mfa_access_allowed())) with check ((select public.current_mfa_access_allowed()))',
      'mfa_approved_factor_gate',r.relname
    );
  end loop;
end $$;

-- Storage has its own API and does not execute the PostgREST pre-request hook.
-- Existing object policies remain authoritative; this adds the same approved-
-- factor-or-trusted-bootstrap condition as an additional requirement.
drop policy if exists mfa_approved_factor_gate on storage.objects;
create policy mfa_approved_factor_gate
  on storage.objects
  as restrictive
  for all
  to authenticated
  using ((select public.current_mfa_access_allowed()))
  with check ((select public.current_mfa_access_allowed()));

comment on function public.enforce_el_molino_aal2_request() is
'El Molino Ops free password-takeover control: new sessions require an approved aal2 factor; one pre-existing trusted admin session may bootstrap.';
