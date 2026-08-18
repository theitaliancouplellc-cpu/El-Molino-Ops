import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gate=fs.readFileSync('app/mfa-gate.tsx','utf8');
const layout=fs.readFileSync('app/layout.tsx','utf8');
const migration=fs.readFileSync('docs/database/mandatory_mfa_aal2_v1.sql','utf8');
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
  assert.match(layout,/<MfaGate>/);
  assert.match(layout,/<EmployeeRootRedirect \/>/);
  assert.match(layout,/<NativeRuntime \/>/);
});

test('first-factor bootstrap is bound to an existing trusted session, not any aal2 factor',()=>{
  assert.match(migration,/private\.mfa_approved_factors/);
  assert.match(migration,/private\.mfa_bootstrap_sessions/);
  assert.match(migration,/auth\.sessions/);
  assert.match(migration,/s\.factor_id/);
  assert.match(migration,/row_number\(\) over\(partition by s\.user_id order by s\.updated_at desc,s\.created_at desc\)/);
  assert.match(migration,/where ranked\.rn=1/);
  assert.match(migration,/finalize_my_mfa_bootstrap/);
  assert.match(migration,/trusted bootstrap session required/);
  assert.match(migration,/MFA_FACTOR_NOT_APPROVED/);
  assert.doesNotMatch(migration,/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});

test('Data API, Realtime-backed tables and Storage require the approved factor',()=>{
  assert.match(migration,/pgrst\.db_pre_request = 'public\.enforce_el_molino_aal2_request'/);
  assert.match(migration,/claims->>'role'[\s\S]*= 'authenticated'/);
  assert.match(migration,/claims->>'aal','aal1'\) <> 'aal2'/);
  assert.match(migration,/as restrictive for all to authenticated/);
  assert.match(migration,/current_mfa_factor_approved/);
  assert.match(migration,/storage\.objects/);
  assert.match(migration,/MFA_REQUIRED/);
  assert.doesNotMatch(migration,/create policy[^;]*to anon[^;]*current_mfa_factor_approved/i);
});
