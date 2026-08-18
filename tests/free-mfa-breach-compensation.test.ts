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

test('authenticated application runtime is gated by free TOTP MFA',()=>{
  assert.match(gate,/getAuthenticatorAssuranceLevel/);
  assert.match(gate,/factorType:'totp'/);
  assert.match(gate,/mfa\.challenge/);
  assert.match(gate,/mfa\.verify/);
  assert.match(gate,/currentLevel==='aal2'/);
  assert.match(layout,/<MfaGate>/);
  assert.match(layout,/<EmployeeRootRedirect \/>/);
  assert.match(layout,/<NativeRuntime \/>/);
});

test('server-side Data API, Realtime-table and Storage access require aal2',()=>{
  assert.match(migration,/pgrst\.db_pre_request = 'public\.enforce_el_molino_aal2_request'/);
  assert.match(migration,/claims->>'role'.*= 'authenticated'/s);
  assert.match(migration,/claims->>'aal','aal1'\) <> 'aal2'/);
  assert.match(migration,/as restrictive for all to authenticated/);
  assert.match(migration,/storage\.objects/);
  assert.match(migration,/MFA_REQUIRED/);
  assert.doesNotMatch(migration,/to anon[^;]*aal2/i);
});
