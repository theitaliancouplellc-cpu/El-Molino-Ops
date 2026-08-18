-- Free server-side compensating control for the hosted leaked-password feature.
-- Apply only after the MFA gate is live in production.
--
-- Threat model:
--   1. HIBP blocks breached passwords in supported El Molino password flows.
--   2. A caller can still talk to Supabase Auth directly with the public project key.
--   3. Therefore restaurant data requires a verified TOTP factor (aal2) AND an
--      approved factor. A newly-created attacker session cannot self-approve a
--      factor even if it bypasses the client and enrolls TOTP directly.
--
-- Bootstrap:
--   The only current account is the pre-release admin. Only that user's single
--   most recently active session at migration time is placed in a short bootstrap
--   window. Once that same session ID is upgraded to aal2,
--   finalize_my_mfa_bootstrap() approves the factor. A new leaked-password session
--   gets a different session ID and cannot approve its own factor.

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

-- Trust only the single most recently active session that already existed for
-- each pre-release admin. This bootstrap expires quickly and cannot be recreated
-- through a public RPC.
insert into private.mfa_bootstrap_sessions(session_id,user_id,expires_at)
select ranked.id,ranked.user_id,now()+interval '24 hours'
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

-- If the admin completes TOTP enrollment after the UI deployment but before this
-- migration is activated, trust that factor only when it belongs to the same
-- pre-existing bootstrap session selected above.
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
  bootstrap := factor is not null and exists(
    select 1 from private.mfa_bootstrap_sessions b
    where b.session_id=sid and b.user_id=auth.uid()
      and b.consumed_at is null and b.expires_at>now()
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
  where s.id=sid and s.user_id=auth.uid() and s.aal::text='aal2';
  if factor is null then raise exception 'verified factor required'; end if;

  if not exists(
    select 1 from private.mfa_bootstrap_sessions b
    where b.session_id=sid and b.user_id=auth.uid()
      and b.consumed_at is null and b.expires_at>now()
  ) then
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
  sid uuid;
  path text := coalesce(current_setting('request.path',true),'');
  bootstrap_ok boolean := false;
begin
  if coalesce(claims->>'role','') <> 'authenticated' then return; end if;

  if coalesce(claims->>'aal','aal1') <> 'aal2' then
    raise sqlstate 'PGRST' using
      message = json_build_object('code','MFA_REQUIRED','message','Two-step authentication is required for El Molino Ops.')::text,
      detail = json_build_object('status',403)::text;
  end if;

  if public.current_mfa_factor_approved() then return; end if;

  sid := nullif(claims->>'session_id','')::uuid;
  bootstrap_ok := exists(
    select 1
    from private.mfa_bootstrap_sessions b
    join auth.sessions s on s.id=b.session_id and s.user_id=b.user_id
    where b.session_id=sid and b.user_id=auth.uid()
      and b.consumed_at is null and b.expires_at>now()
      and s.factor_id is not null and s.aal::text='aal2'
  );

  -- An unapproved factor may only inspect its security status. A trusted
  -- pre-existing bootstrap session may additionally finalize its own factor.
  -- Match by suffix as request.path representation may include a leading slash.
  if right(path,length('rpc/my_mfa_access_status'))='rpc/my_mfa_access_status' then return; end if;
  if bootstrap_ok and right(path,length('rpc/finalize_my_mfa_bootstrap'))='rpc/finalize_my_mfa_bootstrap' then return; end if;

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
-- every existing RLS-protected public table. Restrictive policies never grant
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
    execute format('drop policy if exists %I on public.%I','mfa_approved_factor_gate',r.relname);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using ((select public.current_mfa_factor_approved())) with check ((select public.current_mfa_factor_approved()))',
      'mfa_approved_factor_gate',r.relname
    );
  end loop;
end $$;

-- Storage has its own API and does not execute the PostgREST pre-request hook.
-- Its existing object policies remain authoritative; this adds approved MFA as
-- an additional required condition for authenticated users.
drop policy if exists mfa_approved_factor_gate on storage.objects;
create policy mfa_approved_factor_gate
  on storage.objects
  as restrictive
  for all
  to authenticated
  using ((select public.current_mfa_factor_approved()))
  with check ((select public.current_mfa_factor_approved()));

comment on function public.enforce_el_molino_aal2_request() is
'El Molino Ops free password-takeover compensating control: Data API requires aal2 plus an approved TOTP factor.';
