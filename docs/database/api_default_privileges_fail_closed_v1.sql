-- PRODUCTION APPLIED: api_default_privileges_fail_closed_v1
--
-- Supabase legacy projects can auto-grant newly-created public-schema objects to
-- Data API roles. El Molino Ops opts out so every future API surface must be
-- granted deliberately by its own migration.

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public;
