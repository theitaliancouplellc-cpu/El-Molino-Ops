import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const files=['app/employee/page.tsx','app/employee/schedule/page.tsx','app/employee/requests/page.tsx','app/employee/time-clock/page.tsx','app/employee/tips/page.tsx'];

test('critical employee screens are locale-aware',()=>{
 for(const path of files){const s=fs.readFileSync(path,'utf8');assert.match(s,/useI18n/,`${path} must consume app locale`)}
});

test('schedule and requests keep authored operational fields as raw data',()=>{
 const schedule=fs.readFileSync('app/employee/schedule/page.tsx','utf8');
 const requests=fs.readFileSync('app/employee/requests/page.tsx','utf8');
 assert.match(schedule,/\{s\.notes\}/);
 assert.match(schedule,/\{s\.employee_name\}/);
 assert.match(requests,/x\.reason\|\|x\.employee_note/);
 assert.ok(!schedule.includes('translate('));
 assert.ok(!requests.includes('translate('));
});

test('critical bilingual dictionaries include Spanish operational copy',()=>{
 for(const path of ['lib/i18n-schedule.ts','lib/i18n-requests.ts','lib/i18n-time-clock.ts']){
  const s=fs.readFileSync(path,'utf8');assert.match(s,/es:\{/);assert.match(s,/[áéíóúñ¿]/i,`${path} should contain real Spanish copy`)
 }
});
