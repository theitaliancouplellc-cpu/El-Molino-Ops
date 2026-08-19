import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const home=readFileSync('app/employee/page.tsx','utf8');
const setup=readFileSync('app/employee/setup/page.tsx','utf8');
const schedule=readFileSync('app/employee/schedule/page.tsx','utf8');
const scheduleI18n=readFileSync('lib/i18n-schedule.ts','utf8');
const managerReview=readFileSync('app/manager/team-setup/page.tsx','utf8');
const managerHome=readFileSync('app/manager/page.tsx','utf8');
const routeGuard=readFileSync('app/employee-root-redirect.tsx','utf8');
const commands=readFileSync('app/global-actions.tsx','utf8');
const account=readFileSync('app/account/page.tsx','utf8');
const backup=readFileSync('lib/backup-manifest.ts','utf8');

test('employee accounts enter a dedicated deny-by-default released staff app',()=>{
  assert.match(routeGuard,/app_role.*employee/);
  assert.match(routeGuard,/target='\/employee'/);
  assert.match(routeGuard,/window\.location\.replace\(target\)/);
  assert.match(routeGuard,/isStaffProductPathAllowed/);
  assert.doesNotMatch(routeGuard,/STAFF_BLOCKED_PREFIXES|STAFF_BLOCKED_EXACT/);
  for(const href of ['/employee/notifications','/employee/schedule','/employee/shift-pool','/employee/requests','/employee/team','/employee/more','/account'])assert.match(home,new RegExp(href.replaceAll('/','\\/')));
  for(const managementLabel of ['Manager Dashboard','Admin Center','Cash Controls','Inventory & Food Cost','Restaurant command center'])assert.doesNotMatch(home,new RegExp(managementLabel));
  for(const unreleased of ['/employee/training','/employee/time-clock','/employee/tips']){
    assert.doesNotMatch(home,new RegExp(`href=["']${unreleased.replaceAll('/','\\/')}["']`));
    assert.doesNotMatch(account,new RegExp(`href=["']${unreleased.replaceAll('/','\\/')}["']`));
  }
  assert.match(home,/nav\.messages/);
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

test('employee schedule is own-shift focused with server-filtered trade discovery and RPC mutations',()=>{
  assert.match(schedule,/\.eq\('employee_id',emp\)/);
  assert.match(schedule,/offer_my_shift_to_pool/);
  assert.match(schedule,/submit_my_shift_change_request/);
  assert.match(schedule,/p_request_type:'swap'/);
  assert.match(schedule,/staff_trade_candidates/);
  assert.match(schedule,/tx\.sendTrade/);
  assert.match(scheduleI18n,/sendTrade:'Send Trade Request'/);
  assert.match(scheduleI18n,/sendTrade:'Enviar Solicitud de Intercambio'/);
  assert.match(schedule,/href="\/employee\/shift-pool"/);
  assert.match(schedule,/href="\/employee\/requests"/);
  assert.doesNotMatch(schedule,/from\('shift_change_requests'\)/);
  assert.doesNotMatch(schedule,/from\('employees'\)/);
  assert.doesNotMatch(schedule,/from\('employee_role_assignments'\)/);
  assert.doesNotMatch(schedule,/Auto Schedule/);
  assert.doesNotMatch(schedule,/Publish Entire Schedule/);
  assert.doesNotMatch(schedule,/Labor Budget/);
});

test('employee command palette exposes only released staff commands',()=>{
  assert.match(commands,/employeeCommands/);
  assert.match(commands,/appRole==='employee'\?employeeCommands:managerCommands/);
  assert.match(commands,/appRole==='employee'\)\{setResults\(\[\]\)/);
  for(const staffHref of ['/employee','/employee/notifications','/employee/schedule','/employee/shift-pool','/employee/requests','/employee/team'])assert.match(commands,new RegExp(staffHref.replaceAll('/','\\/')));
  const employeeCatalog=commands.split('const employeeCommands')[1]?.split('const [open')[0]||'';
  for(const hiddenHref of ['/employee/training','/employee/time-clock','/employee/tips','/time-clock','/tips','/manager','/admin'])assert.doesNotMatch(employeeCatalog,new RegExp(`href:['"]${hiddenHref.replaceAll('/','\\/')}['"]`));
  assert.match(employeeCatalog,/title:'Messages'/);
  assert.match(employeeCatalog,/title:'Mensajes'/);
});

test('employee parity-critical setup and notification preferences are portable recovery data',()=>{
  assert.match(backup,/employee_self_setup_claims/);
  assert.match(backup,/employee_self_setup_role_claims/);
  assert.match(backup,/notification_preferences/);
});
