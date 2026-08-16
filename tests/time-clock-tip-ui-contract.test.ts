import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const clock=readFileSync('app/time-clock/page.tsx','utf8');
const tips=readFileSync('app/tips/page.tsx','utf8');
const tools=readFileSync('app/tools/page.tsx','utf8');

test('time clock UI uses hardened RPCs for punch evidence and corrections',()=>{
  for(const rpc of ['clock_in','clock_out','start_time_clock_break','end_time_clock_break','employee_attest_time_clock_punch','manager_approve_time_clock_punch','manager_upsert_time_clock_punch','close_time_clock_pay_period','reopen_time_clock_pay_period']){
    assert.match(clock,new RegExp(`['"]${rpc}['"]`),rpc);
  }
  assert.doesNotMatch(clock,/from\(['"]time_clock_punches['"]\)\.insert/);
  assert.doesNotMatch(clock,/from\(['"]time_clock_punches['"]\)\.update/);
  assert.doesNotMatch(clock,/from\(['"]time_clock_breaks['"]\)\.(insert|update|delete)/);
  assert.match(clock,/p_paid:false/,'employee break UI must never request paid break');
});

test('tip UI keeps financial evidence behind server RPCs',()=>{
  for(const rpc of ['ensure_tip_pool_run','add_tip_contribution','remove_tip_contribution','generate_tip_distributions','finalize_tip_pool_run','cancel_tip_pool_run','upsert_tip_pool_receiver','remove_tip_pool_receiver','my_tip_report','tip_pool_report']){
    assert.match(tips,new RegExp(`['"]${rpc}['"]`),rpc);
  }
  for(const table of ['tip_pool_runs','tip_contributions','tip_distributions','tip_pool_receivers']){
    assert.doesNotMatch(tips,new RegExp(`from\\(['"]${table}['"]\\)\\.(insert|update|delete)`),table);
  }
});

test('time clock and tips are reachable from Tools',()=>{
  assert.match(tools,/href:'\/time-clock'/);
  assert.match(tools,/href:'\/tips'/);
});
