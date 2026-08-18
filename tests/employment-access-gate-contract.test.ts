import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/employment_access_gate_v1.sql','utf8');

test('unlinked bootstrap profiles remain allowed while linked inactive profiles fail closed',()=>{
  assert.match(sql,/create or replace function private\.current_profile_access_allowed\(\)/i);
  assert.match(sql,/exists\([\s\S]*from public\.employees any_e[\s\S]*any_e\.user_id=p\.id/i);
  assert.match(sql,/active_e\.location_id=p\.location_id/i);
  assert.match(sql,/active_e\.active/i);
  assert.match(sql,/active_e\.deleted_at is null/i);
  assert.match(sql,/employment_status,'active'\)='active'/i);
  assert.match(sql,/else true/i);
});

test('role and location resolution disappear when linked employment is inactive',()=>{
  assert.match(sql,/create or replace function private\.current_app_role\(\)[\s\S]*current_profile_access_allowed\(\)/i);
  assert.match(sql,/else null::public\.app_role/i);
  assert.match(sql,/create or replace function private\.current_location_id\(\)[\s\S]*current_profile_access_allowed\(\)/i);
  assert.match(sql,/else null::uuid/i);
});

test('MFA restrictive gate also requires active employment access',()=>{
  assert.match(sql,/create or replace function private\.current_mfa_access_allowed\(\)/i);
  assert.match(sql,/current_profile_access_allowed\(\)[\s\S]*current_mfa_factor_approved\(\)[\s\S]*current_mfa_bootstrap_allowed\(\)/i);
});

test('PostgREST pre-request gate rejects disabled linked staff before normal RPC execution',()=>{
  assert.match(sql,/create or replace function public\.enforce_el_molino_aal2_request\(\)/i);
  assert.match(sql,/if not private\.current_profile_access_allowed\(\) then/i);
  assert.match(sql,/ACCOUNT_ACCESS_DISABLED/i);
  assert.match(sql,/status',403/i);
});

test('employment access loss revokes sessions and therefore cascading refresh tokens',()=>{
  assert.match(sql,/create or replace function private\.revoke_employee_sessions_on_access_loss\(\)/i);
  assert.match(sql,/old\.user_id is distinct from new\.user_id[\s\S]*delete from auth\.sessions where user_id=old\.user_id/i);
  assert.match(sql,/not coalesce\(new\.active,false\)/i);
  assert.match(sql,/new\.deleted_at is not null/i);
  assert.match(sql,/employment_status,'active'\)<>'active'/i);
  assert.match(sql,/delete from auth\.sessions where user_id=new\.user_id/i);
  assert.match(sql,/after insert or update on public\.employees/i);
});

test('new private authorization helpers are not directly executable by clients',()=>{
  assert.match(sql,/revoke all on function private\.current_profile_access_allowed\(\) from public, anon, authenticated/i);
  assert.match(sql,/revoke all on function private\.revoke_employee_sessions_on_access_loss\(\) from public, anon, authenticated/i);
});
