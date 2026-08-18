import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/checklist_run_item_integrity_v1.sql','utf8');

test('run-item trigger rejects cross-template item attachment',()=>{
  assert.match(sql,/create or replace function private\.guard_checklist_run_item_template_match\(\)[\s\S]*?run_template is distinct from item_template[\s\S]*?raise exception 'checklist run item must belong to the run template'/i);
  assert.match(sql,/before insert or update of checklist_run_id, template_item_id[\s\S]*?private\.guard_checklist_run_item_template_match\(\)/i);
});

test('authenticated insert policy also requires template match',()=>{
  assert.match(sql,/create policy checklist_run_items_insert[\s\S]*?i\.checklist_template_id = r\.checklist_template_id[\s\S]*?c\.location_id = public\.current_location_id\(\)/i);
});

test('employee run-item authority remains bound to active same-location employee',()=>{
  assert.match(sql,/e\.user_id = \(select auth\.uid\(\)\)[\s\S]*?e\.location_id = c\.location_id[\s\S]*?e\.deleted_at is null/i);
});

test('private trigger helpers are not direct client RPC surfaces',()=>{
  for(const name of [
    'guard_checklist_run_item_template_match',
    'guard_non_manager_comment_update',
    'guard_non_manager_task_update',
    'guard_row_identity',
  ]){
    assert.match(sql,new RegExp(`revoke all on function private\\.${name}\\(\\) from public, anon, authenticated, service_role`,'i'));
  }
});
