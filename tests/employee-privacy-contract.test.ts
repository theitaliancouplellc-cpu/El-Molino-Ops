import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isStaffProductPathAllowed,isStaffRouteReleased} from '../lib/staff-features';

// Phase 1 intentionally certifies the centralized Staff allowlist rather than the retired route blocklist.
const privacy=readFileSync('docs/database/employee_privacy_minimization_v1.sql','utf8');
const schedule=readFileSync('app/employee/schedule/page.tsx','utf8');
const pool=readFileSync('app/schedule/pool/page.tsx','utf8');
const team=readFileSync('app/team/page.tsx','utf8');
const clock=readFileSync('app/employee/time-clock/page.tsx','utf8');
const tips=readFileSync('app/employee/tips/page.tsx','utf8');
const guard=readFileSync('app/employee-root-redirect.tsx','utf8');
const manager=readFileSync('app/manager/page.tsx','utf8');
const admin=readFileSync('app/admin/page.tsx','utf8');

test('employee row-level access is own-record/minimum-necessary instead of same-location directory access',()=>{
  assert.match(privacy,/or user_id=auth\.uid\(\)/);
  assert.match(privacy,/or e\.user_id=auth\.uid\(\)/);
  assert.match(privacy,/employee_id=public\.current_schedule_employee_id\(\)/);
  assert.match(privacy,/employee_id is null and status='open'/);
  assert.match(privacy,/returns table\(employee_id uuid, full_name text\)/);
  assert.doesNotMatch(privacy,/returns table\([^)]*phone/i);
  assert.doesNotMatch(privacy,/returns table\([^)]*notes/i);
});

test('employee schedule no longer enumerates coworker employee or qualification tables',()=>{
  assert.match(schedule,/staff_trade_candidates/);
  assert.doesNotMatch(schedule,/from\('employees'\)/);
  assert.doesNotMatch(schedule,/from\('employee_role_assignments'\)/);
  assert.match(privacy,/approved time off|time_off_conflicts_shift/);
  assert.match(privacy,/x\.starts_at<t\.ends_at and x\.ends_at>t\.starts_at/);
});

test('Shift Pool and Team use the privacy-safe staff directory/RPC surfaces',()=>{
  assert.match(pool,/staff_directory/);
  assert.match(pool,/staff_shift_pool_shifts/);
  assert.doesNotMatch(pool,/from\('employees'\)/);
  assert.match(team,/staff_directory/);
  assert.doesNotMatch(team,/from\('employees'\)/);
  assert.match(privacy,/can_view_shift_pool_offer/);
});

test('employee time clock is isolated from manager payroll and correction administration',()=>{
  for(const required of ['clock_in','clock_out','start_time_clock_break','end_time_clock_break','employee_attest_time_clock_punch','set_time_clock_pin'])assert.match(clock,new RegExp(required));
  for(const forbidden of ['time_clock_worked_hours_wages','time_clock_whos_working','manager_approve_time_clock_punch','manager_upsert_time_clock_punch','close_time_clock_pay_period','reopen_time_clock_pay_period','Add a missed punch','Who’s working'])assert.doesNotMatch(clock,new RegExp(forbidden));
  assert.match(clock,/\.eq\('employee_id',emp\)/);
});

test('employee tips page uses only the finalized-own-tip report',()=>{
  assert.match(tips,/my_tip_report/);
  for(const forbidden of ['tip_pool_report','tip_contributions','tip_pool_runs','tip_pool_receivers','generate_tip_distributions','finalize_tip_pool_run','cancel_tip_pool_run','Create pool','Tip Pooling'])assert.doesNotMatch(tips,new RegExp(forbidden));
  assert.match(tips,/Only finalized tip distributions assigned to your employee profile/);
});

test('Staff product routing is deny-by-default and permits only explicitly released employee surfaces',()=>{
  assert.match(guard,/isStaffProductPathAllowed/);
  assert.match(guard,/profileResult\.data\.app_role!==['"]employee['"]\)\{decide\('pass'\);return\}/);
  assert.match(guard,/const currentMode=decision\.path===pathname\?decision\.mode:'checking'/);

  for(const allowed of [
    '/employee',
    '/employee/schedule',
    '/employee/requests',
    '/employee/shift-pool',
    '/employee/team',
    '/employee/notifications',
    '/employee/notifications/preferences',
    '/employee/more',
    '/account',
    '/privacy',
    '/support'
  ]) assert.equal(isStaffProductPathAllowed(allowed),true,allowed);

  for(const denied of [
    '/time-clock',
    '/tips',
    '/schedule',
    '/team',
    '/discussions',
    '/manager',
    '/admin',
    '/ops',
    '/tools',
    '/inventory',
    '/performance',
    '/cash',
    '/payroll',
    '/labor',
    '/financial',
    '/toast',
    '/training',
    '/employee/time-clock',
    '/employee/tips',
    '/employee/training',
    '/employee/future-module'
  ]) assert.equal(isStaffProductPathAllowed(denied),false,denied);

  assert.equal(isStaffRouteReleased('/employee/future-module'),false,'unknown future employee routes must fail closed');
});

test('management implementations remain available to authorized manager/admin roles',()=>{
  assert.match(guard,/profileResult\.data\.app_role!==['"]employee['"]\)\{decide\('pass'\);return\}/);
  assert.match(guard,/if\(currentMode==='pass'\)return <>\{children\}<\/>/);
  assert.match(manager,/export default function ManagerPage/);
  assert.match(manager,/\['admin','manager'\]\.includes\(me\.app_role\)/);
  assert.match(manager,/href="\/time-clock"/);
  assert.match(manager,/href="\/tips"/);
  assert.match(manager,/href="\/team"/);
  assert.match(manager,/href="\/training"/);
  assert.match(manager,/href="\/performance"/);
  assert.match(admin,/export default function AdminPage/);
  assert.match(admin,/self\.app_role!==['"]admin['"]/);
  assert.match(admin,/Admin access required/);
});
