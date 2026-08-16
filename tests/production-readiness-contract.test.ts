import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const read=(p:string)=>{assert.ok(existsSync(p),`required release artifact missing: ${p}`);return readFileSync(p,'utf8')};
const guard=read('app/employee-root-redirect.tsx');
const schedule=read('app/employee/schedule/page.tsx');
const pool=read('app/employee/shift-pool/page.tsx');
const requests=read('app/employee/requests/page.tsx');
const commands=read('app/global-actions.tsx');
const mobile=read('app/employee/mobile-polish.css');
const cache=read('lib/employee-schedule-cache.ts');
const backup=read('lib/backup-manifest.ts');
const manifest=read('public/manifest.webmanifest');
const readiness=read('docs/release/PRODUCTION_READINESS.md');

test('release certification artifacts are explicit and general availability is evidence-gated',()=>{
  for(const phrase of ['Authentication and authorization','Schedule lifecycle','Network resilience','Pilot certification','Staged rollout','General availability']) assert.match(readiness,new RegExp(phrase));
  assert.match(readiness,/General availability is permitted only after all automated gates pass and the real-user pilot thresholds are met/);
});

test('installed PWA identity is safe for both staff and management',()=>{
  const parsed=JSON.parse(manifest);
  assert.equal(parsed.name,'El Molino');
  assert.equal(parsed.display,'standalone');
  assert.equal(parsed.start_url,'/');
  assert.match(parsed.description,/staff and management/i);
  assert.ok(!Array.isArray(parsed.shortcuts)||parsed.shortcuts.length===0,'role-specific install shortcuts must not leak manager-only destinations to staff');
});

test('employees remain structurally separated from management and sensitive shared surfaces',()=>{
  assert.match(guard,/app_role.*employee/);
  for(const blocked of ['/admin','/manager','/performance','/logbook','/inventory','/safety','/maintenance','/incidents','/cash','/vendors','/procedures','/capture','/files','/menu','/ops','/tools']) assert.match(guard,new RegExp(blocked.replaceAll('/','\\/')));
  assert.match(commands,/appRole==='employee'\?employeeCommands:managerCommands/);
  const employeeCatalog=commands.split('const employeeCommands')[1]?.split('const stableResultHref')[0]||'';
  assert.doesNotMatch(employeeCatalog,/href:'\/manager/);
  assert.doesNotMatch(employeeCatalog,/href:'\/admin/);
  assert.doesNotMatch(employeeCatalog,/href:'\/cash/);
});

test('employee schedule remains employee-scoped, server-authoritative, and offline-safe',()=>{
  assert.match(schedule,/\.eq\('employee_id',emp\)/);
  assert.match(schedule,/submit_my_shift_change_request/);
  assert.match(schedule,/offer_my_shift_to_pool/);
  assert.match(schedule,/staff_trade_candidates/);
  assert.match(schedule,/requireConnection/);
  assert.match(schedule,/Showing .*saved|Saved schedule/);
  assert.doesNotMatch(schedule,/from\('shift_change_requests'\)\.insert/);
  assert.doesNotMatch(schedule,/from\('employees'\)/);
  assert.doesNotMatch(schedule,/from\('employee_role_assignments'\)/);
});

test('offline cache contains schedule-only data and is bounded',()=>{
  assert.match(cache,/localStorage/);
  assert.match(cache,/slice\(0,8\)|8/);
  for(const forbidden of ['wage','payroll','cash','tip_pool','declared_cash_tip']) assert.doesNotMatch(cache,new RegExp(forbidden,'i'));
  assert.match(mobile,/safe-area-inset/);
  assert.match(mobile,/min-height:44px/);
  assert.match(mobile,/font-size:16px/);
  assert.match(mobile,/focus-visible/);
  assert.match(mobile,/prefers-reduced-motion/);
  for(const width of ['430px','375px','320px']) assert.match(mobile,new RegExp(width.replace('px','px')));
});

test('employee Shift Pool exposes only hardened employee mutation paths',()=>{
  for(const rpc of ['employee_shift_pool_snapshot','bid_on_shift_pool_offer','claim_open_shift','withdraw_my_shift_pool_offer','withdraw_my_shift_pool_bid','respond_to_my_shift_trade','cancel_my_shift_change_request']) assert.match(pool,new RegExp(rpc));
  for(const managerRpc of ['review_shift_pool_bid','review_shift_claim','review_shift_change_request']) assert.doesNotMatch(pool,new RegExp(managerRpc));
  for(const table of ['shift_pool_offers','shift_pool_bids','shift_claims','shift_change_requests']) assert.doesNotMatch(pool,new RegExp(`from\\('${table}'\\)`));
});

test('employee requests are authoritative workflows rather than direct protected-table writes',()=>{
  for(const rpc of ['submit_my_time_off_request','set_my_weekly_availability','submit_availability_request','cancel_my_time_off_request','cancel_my_availability_request']) assert.match(requests,new RegExp(rpc));
  assert.doesNotMatch(requests,/from\('time_off_requests'\)\.insert/);
  assert.doesNotMatch(requests,/from\('availability_change_requests'\)\.insert/);
});

test('recovery manifest carries employee parity critical state',()=>{
  for(const table of ['employee_self_setup_claims','employee_self_setup_role_claims','notification_preferences']) assert.match(backup,new RegExp(table));
});
