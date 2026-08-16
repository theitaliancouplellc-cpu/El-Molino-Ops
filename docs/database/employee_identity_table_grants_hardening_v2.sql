-- Applied to production Supabase as migration: employee_identity_table_grants_hardening_v2
-- RLS is not a substitute for table-level privilege hygiene; authenticated staff need SELECT only.

revoke all on table public.employee_employment_status_history from anon,authenticated;
revoke all on table public.employee_role_change_requests from anon,authenticated;
revoke all on table public.employee_role_change_request_roles from anon,authenticated;
revoke all on table public.employee_role_assignment_history from anon,authenticated;

grant select on table public.employee_employment_status_history to authenticated;
grant select on table public.employee_role_change_requests to authenticated;
grant select on table public.employee_role_change_request_roles to authenticated;
grant select on table public.employee_role_assignment_history to authenticated;
