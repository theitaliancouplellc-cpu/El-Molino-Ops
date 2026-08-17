import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=(p:string)=>fs.readFileSync(path.join(root,p),'utf8');

test('schedule warnings localization preserves validation and quick-fix contracts',()=>{
  const src=read('app/schedule/warnings/page.tsx');
  assert.match(src,/useI18n/);
  assert.match(src,/ensure_schedule_period/);
  assert.match(src,/schedule_period_validation/);
  assert.match(src,/schedule_compliance_warnings/);
  assert.match(src,/quick_fix_schedule_period/);
  assert.match(src,/p_period_id:period\.id/);
  assert.match(src,/p_fill_to_target:toTarget/);
  assert.match(src,/period\.status!=='draft'/);
  assert.match(src,/source:'coverage'/);
  assert.match(src,/source:'compliance'/);
});

test('schedule activity localization is read-only over authoritative audit sources',()=>{
  const src=read('app/schedule/activity/page.tsx');
  assert.match(src,/useI18n/);
  for(const table of ['schedule_shift_change_log','schedule_publication_events','schedule_department_publications','shift_pool_offers','shift_pool_bids','availability_change_requests','time_off_requests','shift_change_requests','shift_claims']) assert.match(src,new RegExp(table));
  assert.doesNotMatch(src,/\.insert\(/);
  assert.doesNotMatch(src,/\.update\(/);
  assert.doesNotMatch(src,/\.delete\(/);
  assert.match(src,/x\.status/);
  assert.match(src,/x\.request_kind/);
  assert.match(src,/x\.request_type/);
});
