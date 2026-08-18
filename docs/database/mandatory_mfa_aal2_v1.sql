-- SUPERSEDED — DO NOT APPLY.
--
-- This pre-production draft was never applied to Supabase. Its request gate
-- checked aal2 before consulting the bootstrap session and could therefore lock
-- out the only pre-existing administrator before TOTP enrollment completed.
--
-- The production-applied replacement is:
--   docs/database/mandatory_mfa_aal2_legacy_bridge_v2.sql
--
-- Keeping this tombstone instead of deleting the path prevents an old handoff or
-- automation from mistaking the original v1 draft for the authoritative schema.

do $$
begin
  raise exception 'mandatory_mfa_aal2_v1 is superseded; apply mandatory_mfa_aal2_legacy_bridge_v2 instead';
end $$;
