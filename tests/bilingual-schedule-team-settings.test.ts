import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=(p:string)=>fs.readFileSync(path.join(root,p),'utf8');

test('schedule settings localization preserves raw settings contract',()=>{
  const src=read('app/schedule/settings/page.tsx');
  assert.match(src,/useI18n/);
  assert.match(src,/auto_schedule_mode:'target'/);
  assert.match(src,/shift_pool_enabled:true/);
  assert.match(src,/shift_pool_allow_partial:false/);
  assert.match(src,/availability_approval_required:true/);
  assert.match(src,/shift_reminder_hours:2/);
  assert.match(src,/upsert\(\{location_id:profile\.location_id,\.\.\.settings\},\{onConflict:'location_id'\}\)/);
  assert.match(src,/value="target"/);
  assert.match(src,/value="minimum"/);
});

test('schedule team localization preserves private compliance and authored notes',()=>{
  const src=read('app/schedule/team/page.tsx');
  assert.match(src,/useI18n/);
  assert.match(src,/employee_compliance_profiles/);
  assert.match(src,/date_of_birth/);
  assert.match(src,/employee_schedule_profiles/);
  assert.match(src,/notes:notes\[employeeId\]\?\.trim\(\)\|\|null/);
  assert.match(src,/onConflict:'employee_id'/);
  assert.match(src,/employee_id:employeeId/);
  assert.match(src,/location_id:profile\.location_id/);
});
