import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/checklist_run_update_ownership_v1.sql','utf8');

test('non-manager checklist runs cannot rewrite assignment or identity fields',()=>{
  for(const field of ['checklist_template_id','assigned_employee_id','assigned_role_id','business_date','created_by','created_at']){
    assert.match(sql,new RegExp(`new\\.${field} is distinct from old\\.${field}`,'i'));
  }
});

test('staff lifecycle timestamps become immutable historical evidence',()=>{
  assert.match(sql,/old\.started_at is not null[\s\S]*?new\.started_at is distinct from old\.started_at/i);
  assert.match(sql,/old\.completed_at is not null[\s\S]*?new\.completed_at is distinct from old\.completed_at/i);
  assert.match(sql,/new\.started_at := now\(\)/i);
  assert.match(sql,/new\.completed_at := now\(\)/i);
});

test('checklist update RLS revalidates employee ownership after update',()=>{
  const policy=sql.match(/create policy checklist_runs_update[\s\S]*$/i)?.[0]||'';
  assert.match(policy,/using \([\s\S]*?created_by = \(select auth\.uid\(\)\)[\s\S]*?e\.user_id = \(select auth\.uid\(\)\)/i);
  assert.match(policy,/with check \([\s\S]*?created_by = \(select auth\.uid\(\)\)[\s\S]*?e\.user_id = \(select auth\.uid\(\)\)/i);
});

test('trigger helper is not directly exposed as an RPC',()=>{
  assert.match(sql,/revoke all on function private\.guard_checklist_run_non_manager_update\(\) from public, anon, authenticated/i);
});
