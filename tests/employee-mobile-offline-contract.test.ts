import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const layout=readFileSync('app/employee/layout.tsx','utf8');
const connection=readFileSync('app/employee/connection-state.tsx','utf8');
const css=readFileSync('app/employee/mobile-polish.css','utf8');
const schedule=readFileSync('app/employee/schedule/page.tsx','utf8');
const scheduleI18n=readFileSync('lib/i18n-schedule.ts','utf8');
const cache=readFileSync('lib/employee-schedule-cache.ts','utf8');

test('employee shell enforces mobile accessibility and device safe areas',()=>{
 assert.match(layout,/mobile-polish\.css/);
 assert.match(layout,/EmployeeConnectionState/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/font-size:16px/);
 assert.match(css,/focus-visible/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/max-width:320px/);
 assert.match(css,/max-width:375px/);
 assert.match(css,/max-width:430px/);
 assert.match(css,/prefers-reduced-motion/);
});

test('offline state is explicit and does not promise offline mutations',()=>{
 assert.match(connection,/navigator\.onLine/);
 assert.match(connection,/Changes require a connection/);
 assert.match(schedule,/requireConnection/);
 assert.match(schedule,/setMessage\(tx\.offline\)/);
 assert.match(schedule,/tx\.viewOnly/);
 assert.match(scheduleI18n,/offline:'You are offline\. Schedule changes require a connection\.'/);
 assert.match(scheduleI18n,/viewOnly:'view only until reconnected\.'/);
 assert.match(scheduleI18n,/offline:'Estás sin conexión\. Los cambios de horario requieren conexión\.'/);
});

test('employee schedule stores and restores only last-known employee schedule snapshots',()=>{
 assert.match(schedule,/readEmployeeScheduleCache/);
 assert.match(schedule,/writeEmployeeScheduleCache/);
 assert.match(schedule,/employeeScheduleCacheAge/);
 assert.match(cache,/el-molino:employee-schedule:v1/);
 assert.match(cache,/employeeId:string/);
 assert.match(cache,/weekStart:string/);
 assert.match(cache,/ours\.slice\(8\)/);
 assert.doesNotMatch(cache,/wage|tip|payroll|cash/i);
});

test('network failure prefers cached schedule over partial server results',()=>{
 assert.match(schedule,/const failed=\[p,s,r,b\]\.some\(x=>x\.error\)/);
 assert.match(schedule,/if\(failed\)\{const cached=readEmployeeScheduleCache/);
 assert.match(schedule,/tx\.noSaved/);
 assert.match(scheduleI18n,/noSaved:'Schedule could not be refreshed and no saved copy is available for this week\.'/);
});
