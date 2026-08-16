import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(p:string)=>readFileSync(p,'utf8');

test('scheduler stays deterministic and never uses randomness',()=>{
  const src=read('lib/scheduling-engine.ts');
  assert.match(src,/algorithm_version:'v2\.2'/);
  assert.doesNotMatch(src,/Math\.random|crypto\.randomUUID/);
  assert.match(src,/constrained/);
  assert.match(src,/priority/);
  assert.match(src,/chronological/);
});

test('hard scheduling constraints are explicit in the optimizer',()=>{
  const src=read('lib/scheduling-engine.ts');
  for(const token of ['not_qualified','approved_time_off','unavailable','outside_availability','overlap','split_shift_not_allowed','min_split_gap','min_rest','max_weekly_hours','max_consecutive_days','max_shift_hours'])assert.match(src,new RegExp(token));
});

test('unfillable coverage becomes an open slot rather than forced assignment',()=>{
  const src=read('lib/scheduling-engine.ts');
  assert.match(src,/employee_id:null/);
  assert.match(src,/code:'unfilled_coverage'/);
});

test('auto schedule application is atomic and revision protected',()=>{
  const schedule=read('app/schedule/page.tsx'),optimizer=read('app/schedule/optimizer/page.tsx');
  assert.match(schedule,/rpc\('apply_schedule_generation'/);
  assert.match(schedule,/p_expected_revision:period\.revision/);
  assert.match(optimizer,/rpc\('apply_schedule_generation'/);
  assert.match(optimizer,/p_expected_revision:period\.revision/);
  assert.doesNotMatch(optimizer,/from\('schedule_shifts'\)\.insert\(preview\.shifts/);
});

test('publication validation and lifecycle go through server RPCs',()=>{
  const src=read('app/schedule/page.tsx');
  assert.match(src,/rpc\('schedule_period_validation'/);
  assert.match(src,/rpc\('publish_schedule_period'/);
  assert.match(src,/rpc\('reopen_schedule_period'/);
  assert.match(src,/p_expected_revision:period\.revision/);
});

test('employee request decisions are server authoritative',()=>{
  const src=read('app/schedule/page.tsx');
  for(const rpc of ['review_time_off_request','review_shift_change_request','claim_open_shift','review_shift_claim','set_my_weekly_availability'])assert.match(src,new RegExp(`rpc\\('${rpc}'`));
  assert.doesNotMatch(src,/from\('time_off_requests'\)\.update\(\{status:decision/);
});

test('copy week uses the transactional server function',()=>{
  const src=read('app/schedule/optimizer/page.tsx');
  assert.match(src,/rpc\('copy_schedule_period'/);
  assert.match(src,/p_expected_revision:period\.revision/);
  assert.match(src,/p_copy_assignments:copyAssignments/);
});

test('optimizer supports cost fairness preferences and forecast demand',()=>{
  const engine=read('lib/scheduling-engine.ts'),optimizer=read('app/schedule/optimizer/page.tsx');
  for(const mode of ['balanced','lowest_cost','equal_hours','preferences']){assert.match(engine,new RegExp(mode));assert.match(optimizer,new RegExp(mode));}
  assert.match(engine,/sales_per_labor_hour_target/);
  assert.match(engine,/demand_scalable/);
  assert.match(optimizer,/Estimate From History/);
});

test('sales forecasts never replace minimum staffing safeguards',()=>{
  const src=read('lib/scheduling-engine.ts');
  assert.match(src,/clamp\(Math\.round\(r\.target_staff\*factor\),r\.min_staff,cap\)/);
});

test('manager tools expose the optimizer workspace',()=>{
  const src=read('app/tools/page.tsx');
  assert.match(src,/\/schedule\/optimizer/);
  assert.match(src,/Schedule Optimizer/);
});
