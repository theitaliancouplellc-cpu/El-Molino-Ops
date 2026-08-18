-- PRODUCTION APPLIED: mandatory_mfa_aal2_legacy_bridge_v2
-- Follow-up grant cleanup mfa_helper_grant_cleanup_v3 is included at the end.
--
-- Purpose
--   Supabase hosted leaked-password protection is unavailable on the Free plan.
--   El Molino Ops therefore keeps the HIBP password-risk check in application
--   password flows and adds a server-side account-takeover boundary:
--     * all newly-created authenticated sessions need approved TOTP MFA;
--     * sessions that existed before activation receive only a short migration
--       bridge so the pre-release admin can enroll TOTP without lockout;
--     * PostgREST, RLS/Realtime-backed tables, and Storage all share the same
--       access predicate;
--     * an attacker cannot turn a password-only session into data access by
--       calling Supabase Auth directly, and an attacker-created TOTP factor is
--       not trusted unless it came from an approved bootstrap path.
--
-- This file intentionally contains no generated session or user IDs.

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

-- Capture only sessions that already existed when the migration is applied.
-- New sessions created after this INSERT can never enter the bridge through a
-- public API. The bridge expires automatically.
insert into private.mfa_bootstrap_sessions(session_id,user_id,expires_at)
select s.id,s.user_id,now()+interval '24 hours'
from auth.sessions s
join public.profiles p on p.id=s.user_id
where p.app_role='admin'
  and s.updated_at >= now()-interval '7 days'
  and (s.not_after is null or s.not_after>now())
on conflict(session_id) do nothing;

-- If a trusted session already completed TOTP before migration application,
-- preserve that factor as approved.
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

revoke all on function public.current_mfa_bootstrap_allowed() from public;
grant execute on function public.current_mfa_bootstrap_allowed() to authenticated, service_role;

create or replace function public.current_mfa_access_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_mfa_factor_approved()
      or public.current_mfa_bootstrap_allowed()
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
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select s.factor_id into factor
  from auth.sessions s
  where s.id=sid and s.user_id=auth.uid();

  approved := factor is not null and public.current_mfa_factor_approved();
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
  where s.id=sid
    and s.user_id=auth.uid()
    and s.aal::text='aal2';

  if factor is null then
    raise exception 'verified factor required';
  end if;

  if not public.current_mfa_bootstrap_allowed() then
    raise exception 'trusted bootstrap session required';
  end if;

  insert into private.mfa_approved_factors(
    factor_id,user_id,approved_by,approval_source
  )
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
  if coalesce(claims->>'role','') <> 'authenticated' then
    return;
  end if;

  -- Permanent approved path.
  if public.current_mfa_factor_approved() then
    return;
  end if;

  -- Short-lived bridge for only the sessions captured before activation.
  if public.current_mfa_bootstrap_allowed() then
    return;
  end if;

  if coalesce(claims->>'aal','aal1') <> 'aal2' then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code','MFA_REQUIRED',
        'message','Two-step authentication is required for El Molino Ops.'
      )::text,
      detail = json_build_object('status',403)::text;
  end if;

  -- An AAL2 factor not yet approved may inspect only its own security status.
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

revoke all on function public.enforce_el_molino_aal2_request() from public;
grant execute on function public.enforce_el_molino_aal2_request()
  to anon, authenticated, service_role;

-- Central Data API/RPC gate. This includes SECURITY DEFINER RPCs that ordinary
-- table RLS cannot protect by itself.
alter role authenticator
  set pgrst.db_pre_request = 'public.enforce_el_molino_aal2_request';
notify pgrst, 'reload config';

-- PostgREST's pre-request hook does not cover Realtime. Add a restrictive policy
-- to every existing RLS-enabled public table. It grants nothing by itself; it
-- only narrows existing permissive policies.
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
      'create policy %I on public.%I as restrictive for all to authenticated using ((select public.current_mfa_access_allowed())) with check ((select public.current_mfa_access_allowed()))',
      'mfa_approved_factor_gate',r.relname
    );
  end loop;
end $$;

-- Storage is a separate API and also needs the access predicate directly.
drop policy if exists mfa_approved_factor_gate on storage.objects;
create policy mfa_approved_factor_gate
  on storage.objects
  as restrictive
  for all
  to authenticated
  using ((select public.current_mfa_access_allowed()))
  with check ((select public.current_mfa_access_allowed()));

comment on function public.enforce_el_molino_aal2_request() is
'El Molino Ops free password-takeover compensating control: new authenticated sessions require aal2 plus an approved TOTP factor; only pre-existing bootstrap sessions receive a short migration bridge.';

-- mfa_helper_grant_cleanup_v3
-- Existing-project default privileges may grant new public-schema functions
-- directly to anon even after PUBLIC is revoked. Remove those unnecessary direct
-- RPC grants. The pre-request hook itself must remain executable by request roles
-- because PostgREST runs it after selecting anon/authenticated.
revoke all on function public.current_mfa_factor_approved() from anon;
revoke all on function public.current_mfa_bootstrap_allowed() from anon;
revoke all on function public.current_mfa_access_allowed() from anon;
revoke all on function public.my_mfa_access_status() from anon;
revoke all on function public.finalize_my_mfa_bootstrap() from anon;

revoke all on function public.enforce_el_molino_aal2_request() from public;
grant execute on function public.enforce_el_molino_aal2_request()
  to anon, authenticated, service_role;
