import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/mfa_internal_helper_surface_v3.sql','utf8');

test('internal MFA predicates live outside the exposed public RPC schema',()=>{
  assert.match(sql,/create or replace function private\.current_mfa_factor_approved\(\)/);
  assert.match(sql,/create or replace function private\.current_mfa_bootstrap_allowed\(\)/);
  assert.match(sql,/create or replace function private\.current_mfa_access_allowed\(\)/);
  assert.match(sql,/drop function if exists public\.current_mfa_access_allowed\(\)/);
  assert.match(sql,/drop function if exists public\.current_mfa_factor_approved\(\)/);
  assert.match(sql,/drop function if exists public\.current_mfa_bootstrap_allowed\(\)/);
});

test('Data API, RLS and Storage continue using the same MFA decision',()=>{
  assert.match(sql,/public\.enforce_el_molino_aal2_request/);
  assert.match(sql,/private\.current_mfa_factor_approved\(\)/);
  assert.match(sql,/private\.current_mfa_bootstrap_allowed\(\)/);
  assert.match(sql,/MFA_REQUIRED/);
  assert.match(sql,/MFA_FACTOR_NOT_APPROVED/);
  assert.match(sql,/as restrictive for all to authenticated/);
  assert.match(sql,/private\.current_mfa_access_allowed\(\)/);
  assert.match(sql,/storage\.objects/);
});

test('generic rate-limit helper is server-only',()=>{
  assert.match(sql,/revoke all on function public\.consume_rate_limit\(text,text,integer,integer\)[\s\S]*from public, anon, authenticated/);
  assert.match(sql,/grant execute on function public\.consume_rate_limit\(text,text,integer,integer\)[\s\S]*to service_role/);
});
