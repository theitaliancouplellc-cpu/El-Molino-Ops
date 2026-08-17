import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync('app/employee/requests/page.tsx','utf8');
const copy=readFileSync('lib/i18n-requests.ts','utf8');
const legacy=readFileSync('app/schedule/requests/layout.tsx','utf8');
const migration=readFileSync('docs/database/employee_requests_hardening_v3.sql','utf8');

test('employee Requests Center unifies recurring, temporary, time-off and history flows',()=>{
  for(const key of ['tx.weekly','tx.temp','tx.requestTimeOff','tx.requestHistory'])assert.match(page,new RegExp(key.replace('.','\\.')));
  assert.match(copy,/weekly:'Recurring weekly availability'/);
  assert.match(copy,/temp:'Temporary availability'/);
  assert.match(copy,/requestTimeOff:'Request time off'/);
  assert.match(copy,/requestHistory:'Request history'/);
  assert.match(copy,/weekly:'Disponibilidad semanal recurrente'/);
  assert.match(copy,/requestTimeOff:'Solicitar tiempo libre'/);
  assert.match(page,/set_my_weekly_availability/);
  assert.match(page,/submit_availability_request/);
  assert.match(page,/submit_my_time_off_request/);
  assert.match(page,/my_employee_request_center/);
});

test('employees no longer write protected request evidence tables directly',()=>{
  assert.doesNotMatch(page,/from\('time_off_requests'\)\.(insert|update|delete|upsert)/);
  assert.doesNotMatch(page,/from\('availability_change_requests'\)\.(insert|update|delete|upsert)/);
  assert.match(migration,/revoke insert,update,delete,truncate,references,trigger on public\.time_off_requests from authenticated,anon/);
  assert.match(migration,/revoke insert,update,delete,truncate,references,trigger on public\.availability_change_requests from authenticated,anon/);
});

test('time-off policy rejects invalid partial days, insufficient notice, blocked days and overlap',()=>{
  assert.match(migration,/partial-day time off must be a single date/);
  assert.match(migration,/partial-day time off needs a valid start and end time/);
  assert.match(migration,/minimum notice policy/);
  assert.match(migration,/requested dates are blocked for time off/);
  assert.match(migration,/overlaps existing pending or approved time off/);
  assert.match(migration,/time_off_min_notice_days between 0 and 365/);
});

test('employees can cancel only their own pending time-off and availability requests',()=>{
  assert.match(migration,/where id=p_request_id and employee_id=eid and status='pending'/);
  assert.match(migration,/cancel_my_time_off_request/);
  assert.match(migration,/cancel_my_availability_request/);
  assert.match(page,/tx\.cancelRequest/);
  assert.match(copy,/cancelRequest:'Cancel request'/);
  assert.match(copy,/cancelRequest:'Cancelar solicitud'/);
});

test('request center is employee-scoped and strips location/employee identifiers from returned evidence',()=>{
  assert.match(migration,/eid uuid:=public\.current_schedule_employee_id\(\)/);
  assert.match(migration,/where a\.employee_id=eid/);
  assert.match(migration,/where t\.employee_id=eid/);
  assert.match(migration,/to_jsonb\(t\)-'location_id'-'employee_id'/);
  assert.match(migration,/to_jsonb\(q\)-'location_id'-'employee_id'/);
});

test('legacy schedule request links cannot expose the shared manager request page to employees',()=>{
  assert.match(legacy,/app_role/);
  assert.match(legacy,/p\?\.app_role==='employee'/);
  assert.match(legacy,/location\.replace\('\/employee\/requests'\)/);
  assert.match(legacy,/if\(!ready\)return/);
});
