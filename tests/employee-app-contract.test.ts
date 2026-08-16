import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const home=readFileSync('app/employee/page.tsx','utf8');
const setup=readFileSync('app/employee/setup/page.tsx','utf8');
const schedule=readFileSync('app/employee/schedule/page.tsx','utf8');
const managerReview=readFileSync('app/manager/team-setup/page.tsx','utf8');
const managerHome=readFileSync('app/manager/page.tsx','utf8');
const routeGuard=readFileSync('app/employee-root-redirect.tsx','utf8');
const commands=readFileSync('app/global-actions.tsx','utf8');
const backup=readFileSync('lib/backup-manifest.ts','utf8');

test('employee accounts enter a dedicated staff-only app',()=>{
  assert.match(routeGuard,/app_role.*employee/);
  assert.match(routeGuard,/location\.replace\('\/employee'\)/);
  assert.match(routeGuard,/STAFF_BLOCKED_EXACT=new Set\(\['\/schedule','\/time-clock','\/tips'\]\)/);
  for(const prefix of ['/admin','/manager','/performance','/logbook','/inventory','/safety','/maintenance','/incidents','/cash','/vendors','/procedures','/capture','/files','/menu','/ops','/tools'])assert.match(routeGuard,new RegExp(`['"]${prefix.replaceAll('/','\\/')}['"]`),`staff guard must block ${prefix}`);
  for(const href of ['/employee/notifications','/employee/schedule','/schedule/pool','/schedule/requests','/team','/training/courses','/employee/time-clock','/employee/tips','/account'])assert.match(home,new RegExp(href.replaceAll('/','\\/')));
  for(const managementLabel of ['Manager Dashboard','Admin Center','Cash Controls','Inventory & Food Cost','Restaurant command center'])assert.doesNotMatch(home,new RegExp(managementLabel));
  assert.doesNotMatch(home,/href="\/time-clock"/);
  assert.doesNotMatch(home,/href="\/tips"/);
});

test('employee setup is self-declared but manager-authorized',()=>{
  assert.match(setup,/submit_employee_self_setup/);
  assert.match(setup,/first_name/);
  assert.match(setup,/last_name/);
  assert.match(setup,/department','management/);
  assert.match(managerReview,/review_employee_self_setup/);
  assert.match(managerReview,/Approve Profile/);
  assert.match(managerReview,/Request Changes/);
  assert.match(managerHome,/href="\/manager\/team-setup"/);
});

test('employee schedule is own-shift focused with server-filtered trade discovery',()=>{
  assert.match(schedule,/\.eq\('employee_id',emp\)/);
  assert.match(schedule,/offer_my_shift_to_pool/);
  assert.match(schedule,/shift_change_requests/);
  assert.match(schedule,/request_type:'swap'/);
  assert.match(schedule,/staff_trade_candidates/);
  assert.match(schedule,/Submit Trade/);
  assert.match(schedule,/href="\/schedule\/pool"/);
  assert.match(schedule,/href="\/schedule\/requests"/);
  assert.doesNotMatch(schedule,/from\('employees'\)/);
  assert.doesNotMatch(schedule,/from\('employee_role_assignments'\)/);
  assert.doesNotMatch(schedule,/Auto Schedule/);
  assert.doesNotMatch(schedule,/Publish Entire Schedule/);
  assert.doesNotMatch(schedule,/Labor Budget/);
});

test('employee command palette cannot surface manager command catalog or blocked shared time-money routes',()=>{
  assert.match(commands,/employeeCommands/);
  assert.match(commands,/appRole==='employee'\?employeeCommands:managerCommands/);
  assert.match(commands,/appRole==='employee'\)\{setResults\(\[\]\)/);
  for(const staffHref of ['/employee','/employee/notifications','/employee/schedule','/schedule/pool','/schedule/requests','/employee/time-clock','/employee/tips'])assert.match(commands,new RegExp(staffHref.replaceAll('/','\\/')));
  const employeeCatalog=commands.split('const employeeCommands')[1]?.split('const stableResultHref')[0]||'';
  assert.doesNotMatch(employeeCatalog,/href:'\/time-clock'/);
  assert.doesNotMatch(employeeCatalog,/href:'\/tips'/);
  assert.doesNotMatch(employeeCatalog,/href:'\/manager/);
  assert.doesNotMatch(employeeCatalog,/href:'\/admin/);
});

test('employee parity-critical setup and notification preferences are portable recovery data',()=>{
  assert.match(backup,/employee_self_setup_claims/);
  assert.match(backup,/employee_self_setup_role_claims/);
  assert.match(backup,/notification_preferences/);
});
