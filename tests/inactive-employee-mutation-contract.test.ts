import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/inactive_employee_mutation_hardening_v1.sql','utf8');

test('task mutations require a currently active employee identity',()=>{
  assert.match(sql,/create or replace function public\.guard_task_employee_update\(\)/i);
  assert.match(sql,/actor_employee := public\.current_schedule_employee_id\(\)/i);
  assert.match(sql,/if actor_employee is null then[\s\S]*active employee account required/i);
  assert.match(sql,/old\.assigned_employee_id=actor_employee/i);
  assert.match(sql,/create policy tasks_assignee_or_manager_update[\s\S]*current_schedule_employee_id\(\) is not null/i);
});

test('ops mutations require a currently active employee identity',()=>{
  assert.match(sql,/create or replace function public\.guard_ops_employee_update\(\)/i);
  assert.match(sql,/actor_employee := public\.current_schedule_employee_id\(\)/i);
  assert.match(sql,/old\.assigned_employee_id=actor_employee/i);
  assert.match(sql,/create policy ops_records_update[\s\S]*current_schedule_employee_id\(\) is not null/i);
});

test('inactive accounts cannot retain authority merely through user-id assignment',()=>{
  assert.match(sql,/current_schedule_employee_id\(\) is not null[\s\S]*assigned_user_id=\(select auth\.uid\(\)\)/i);
  assert.match(sql,/current_schedule_employee_id\(\) is not null[\s\S]*created_by=\(select auth\.uid\(\)\)/i);
});

test('manager and admin mutation authority remains explicit',()=>{
  assert.match(sql,/current_app_role\(\) in \('admin'::public\.app_role,'manager'::public\.app_role\)/i);
  assert.match(sql,/role_now in \('admin'::public\.app_role,'manager'::public\.app_role\)/i);
});

test('employee update guards still freeze manager-managed task and ops fields',()=>{
  assert.match(sql,/assignees may only update task progress/i);
  assert.match(sql,/restricted operational fields are manager-managed/i);
  assert.match(sql,/submitted safety records require manager changes/i);
});
