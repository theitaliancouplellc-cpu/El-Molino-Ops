import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gate=fs.readFileSync('app/mfa-gate.tsx','utf8');
const migration=fs.readFileSync('docs/database/mandatory_mfa_aal2_legacy_bridge_v2.sql','utf8');
const supabase=fs.readFileSync('lib/supabase.ts','utf8');

test('password breach screening remains mandatory on supported password flows',()=>{
  assert.match(supabase,/password-risk-check/);
  assert.match(supabase,/signInWithPassword/);
  assert.match(supabase,/signUp/);
  assert.match(supabase,/attributes\?\.password/);
  assert.match(supabase,/known breach data/);
});

test('authenticated application runtime requires TOTP plus approved-factor status',()=>{
  assert.match(gate,/getAuthenticatorAssuranceLevel/);
  assert.match(gate,/factorType:'totp'/);
  assert.match(gate,/mfa\.challenge/);
  assert.match(gate,/mfa\.verify/);
  assert.match(gate,/my_mfa_access_status/);
  assert.match(gate,/finalize_my_mfa_bootstrap/);
  assert.match(gate,/factor_approved/);
  assert.match(gate,/bootstrap_eligible/);
});

test('migration bridge admits only sessions that already exist when protection activates',()=>{
  assert.match(migration,/private\.mfa_approved_factors/);
  assert.match(migration,/private\.mfa_bootstrap_sessions/);
  assert.match(migration,/insert into private\.mfa_bootstrap_sessions/);
  assert.match(migration,/from auth\.sessions s/);
  assert.match(migration,/s\.updated_at >= now\(\)-interval '7 days'/);
  assert.match(migration,/s\.not_after is null or s\.not_after>now\(\)/);
  assert.match(migration,/now\(\)\+interval '24 hours'/);
  assert.match(migration,/current_mfa_bootstrap_allowed/);
  assert.match(migration,/b\.session_id=nullif\(auth\.jwt\(\)->>'session_id',''\)::uuid/);
  assert.match(migration,/b\.expires_at>now\(\)/);
  assert.match(migration,/finalize_my_mfa_bootstrap/);
  assert.match(migration,/trusted bootstrap session required/);
  assert.doesNotMatch(migration,/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});

test('new password-only sessions are rejected before restaurant data access',()=>{
  assert.match(migration,/pgrst\.db_pre_request = 'public\.enforce_el_molino_aal2_request'/);
  assert.match(migration,/if public\.current_mfa_factor_approved\(\) then/);
  assert.match(migration,/if public\.current_mfa_bootstrap_allowed\(\) then/);
  assert.match(migration,/coalesce\(claims->>'aal','aal1'\) <> 'aal2'/);
  assert.match(migration,/MFA_REQUIRED/);
  assert.match(migration,/MFA_FACTOR_NOT_APPROVED/);
});

test('Realtime-backed tables and Storage share the server MFA predicate',()=>{
  assert.match(migration,/as restrictive for all to authenticated/);
  assert.match(migration,/current_mfa_access_allowed/);
  assert.match(migration,/storage\.objects/);
  assert.doesNotMatch(migration,/create policy[^;]*to anon[^;]*current_mfa_access_allowed/i);
});

test('internal MFA helpers are not directly granted to anon',()=>{
  assert.match(migration,/revoke all on function public\.current_mfa_factor_approved\(\) from anon/);
  assert.match(migration,/revoke all on function public\.current_mfa_bootstrap_allowed\(\) from anon/);
  assert.match(migration,/revoke all on function public\.current_mfa_access_allowed\(\) from anon/);
  assert.match(migration,/revoke all on function public\.my_mfa_access_status\(\) from anon/);
  assert.match(migration,/revoke all on function public\.finalize_my_mfa_bootstrap\(\) from anon/);
});
