-- El Molino Ops: employment status is an authorization boundary, not just UI state.
--
-- A profile with no employee row remains eligible for bootstrap/self-setup (and
-- owner/admin profiles that are intentionally not employee-linked remain valid).
-- Once a profile has ever been linked to an employee row, however, its app access
-- is valid only while an active, non-deleted employee record in the profile's
-- current location remains in employment_status='active'.

create or replace function private.current_profile_access_allowed()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce((
    select case
      when exists(
        select 1 from public.employees any_e
        where any_e.user_id=p.id
      ) then exists(
        select 1 from public.employees active_e
        where active_e.user_id=p.id
          and active_e.location_id=p.location_id
          and active_e.active
          and active_e.deleted_at is null
          and coalesce(active_e.employment_status,'active')='active'
      )
      else true
    end
    from public.profiles p
    where p.id=auth.uid()
  ),false)
$function$;

revoke all on function private.current_profile_access_allowed() from public, anon, authenticated;

create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when private.current_profile_access_allowed() then p.app_role
    else null::public.app_role
  end
  from public.profiles p
  where p.id=auth.uid()
$function$;

create or replace function private.current_location_id()
returns uuid
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when private.current_profile_access_allowed() then p.location_id
    else null::uuid
  end
  from public.profiles p
  where p.id=auth.uid()
$function$;

create or replace function private.current_mfa_access_allowed()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select private.current_profile_access_allowed()
     and (
       private.current_mfa_factor_approved()
       or private.current_mfa_bootstrap_allowed()
     )
$function$;

create or replace function public.enforce_el_molino_aal2_request()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  path text := coalesce(current_setting('request.path',true),'');
begin
  if coalesce(claims->>'role','') <> 'authenticated' then return; end if;

  if not private.current_profile_access_allowed() then
    raise sqlstate 'PGRST' using
      message = json_build_object('code','ACCOUNT_ACCESS_DISABLED','message','This El Molino staff account is not active.')::text,
      detail = json_build_object('status',403)::text;
  end if;

  if private.current_mfa_factor_approved() then return; end if;
  if private.current_mfa_bootstrap_allowed() then return; end if;
  if coalesce(claims->>'aal','aal1') <> 'aal2' then
    raise sqlstate 'PGRST' using
      message = json_build_object('code','MFA_REQUIRED','message','Two-step authentication is required for El Molino Ops.')::text,
      detail = json_build_object('status',403)::text;
  end if;
  if right(path,length('rpc/my_mfa_access_status'))='rpc/my_mfa_access_status' then return; end if;
  raise sqlstate 'PGRST' using
    message = json_build_object('code','MFA_FACTOR_NOT_APPROVED','message','This authenticator factor is not approved for El Molino Ops.')::text,
    detail = json_build_object('status',403)::text;
end;
$function$;

create or replace function private.revoke_employee_sessions_on_access_loss()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- If an employee identity is detached from a user, revoke the old user's
  -- sessions so a stale token cannot retain the former association.
  if tg_op='UPDATE'
     and old.user_id is not null
     and old.user_id is distinct from new.user_id then
    delete from auth.sessions where user_id=old.user_id;
  end if;

  -- Any linked non-active/deleted employee record is fail-closed. Deleting an
  -- auth.sessions row also cascades to auth.refresh_tokens in this project.
  if new.user_id is not null
     and (
       not coalesce(new.active,false)
       or new.deleted_at is not null
       or coalesce(new.employment_status,'active')<>'active'
     ) then
    delete from auth.sessions where user_id=new.user_id;
  end if;
  return new;
end
$function$;

revoke all on function private.revoke_employee_sessions_on_access_loss() from public, anon, authenticated;

drop trigger if exists trg_revoke_employee_sessions_on_access_loss on public.employees;
create trigger trg_revoke_employee_sessions_on_access_loss
after insert or update on public.employees
for each row execute function private.revoke_employee_sessions_on_access_loss();
