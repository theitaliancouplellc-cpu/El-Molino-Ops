import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync('docs/database/employee_identity_lifecycle_v2.sql','utf8');
const guard=readFileSync('app/employee-root-redirect.tsx','utf8');
const access=readFileSync('app/employee/access/page.tsx','utf8');
const account=readFileSync('app/account/page.tsx','utf8');
const manager=readFileSync('app/manager/team-setup/page.tsx','utf8');
const backup=readFileSync('lib/backup-manifest.ts','utf8');
const recovery=readFileSync('docs/database/backup_recovery_employee_identity_v2.sql','utf8');

test('employment lifecycle is a constrained authoritative state machine',()=>{
  assert.match(migration,/employment_status in \('active','suspended','inactive'\)/);
  assert.match(migration,/set_employee_employment_status/);
  assert.match(migration,/public\.current_app_role\(\) not in \('admin','manager'\)/);
  assert.match(migration,/inactive employees must be reactivated before suspension/);
  assert.match(migration,/enter a reason for suspending or deactivating this employee/);
  assert.match(migration,/employee_employment_status_history/);
  assert.match(migration,/override_used/);
});

test('employee lifecycle guard blocks unapproved suspended and inactive operational access',()=>{
  assert.match(guard,/employee_self_setup_status/);
  assert.match(guard,/setup\.status!==['"]approved['"]/);
  assert.match(guard,/window\.location\.replace\('\/employee\/setup'\)/);
  assert.match(guard,/setup\.employment_status!==['"]active['"]/);
  assert.match(guard,/window\.location\.replace\('\/employee\/access'\)/);
  assert.match(guard,/lifecycleException/);
  assert.match(access,/Access suspended/);
  assert.match(access,/Account inactive/);
  assert.match(access,/Check access again/);
});

test('future scheduled work must be acknowledged before staff access or qualification removal',()=>{
  assert.match(migration,/employee has future scheduled shifts; review coverage or confirm override/);
  assert.match(migration,/removing a role conflicts with future scheduled shifts; review the schedule or confirm override/);
  assert.match(manager,/p_override_future_shifts:override/);
  assert.match(manager,/future scheduled shifts/);
  assert.match(manager,/review schedule coverage immediately/);
});

test('employees request position changes without directly mutating verified qualifications',()=>{
  assert.match(account,/my_employee_role_profile/);
  assert.match(account,/submit_employee_role_change_request/);
  assert.match(account,/cancel_my_employee_role_change_request/);
  assert.match(account,/current verified positions stay authoritative/i);
  assert.doesNotMatch(account,/from\('employee_role_assignments'\)\.delete/);
  assert.doesNotMatch(account,/from\('employee_role_assignments'\)\.insert/);
  assert.match(migration,/employee_role_change_one_open_uidx/);
  assert.match(migration,/department<>['"]management['"]/);
});

test('managers re-verify position changes through an auditable request workflow',()=>{
  assert.match(manager,/review_employee_role_change_request/);
  assert.match(manager,/Approve Positions/);
  assert.match(manager,/Request Changes/);
  assert.match(manager,/Reject/);
  assert.match(migration,/employee_role_assignment_history/);
  assert.match(migration,/audit_employee_role_assignment_change/);
  assert.match(migration,/employee_role_request/);
  assert.match(migration,/employee_setup/);
});

test('role and lifecycle request evidence is RPC-only for employee clients',()=>{
  for(const table of ['employee_employment_status_history','employee_role_change_requests','employee_role_change_request_roles','employee_role_assignment_history']){
    assert.match(migration,new RegExp(`revoke insert,update,delete on public\\.${table} from authenticated`));
  }
  assert.match(migration,/review_employee_role_change_request/);
  assert.match(migration,/set_employee_employment_status/);
});

test('employee lifecycle and role verification data is recoverable',()=>{
  for(const table of ['employee_employment_status_history','employee_role_change_requests','employee_role_change_request_roles','employee_role_assignment_history']){
    assert.match(backup,new RegExp(table));
    assert.match(recovery,new RegExp(table));
  }
});
