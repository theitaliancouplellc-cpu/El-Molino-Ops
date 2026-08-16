import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const clock=readFileSync('app/time-clock/page.tsx','utf8');
const kiosk=readFileSync('app/time-clock/kiosk/page.tsx','utf8');
const tips=readFileSync('app/tips/page.tsx','utf8');
const tools=readFileSync('app/tools/page.tsx','utf8');

test('time clock evidence changes use audited RPCs rather than direct table writes',()=>{
  for(const rpc of ['clock_in','clock_out','start_time_clock_break','end_time_clock_break','employee_attest_time_clock_punch','manager_upsert_time_clock_punch','manager_upsert_time_clock_break','manager_remove_time_clock_break','manager_approve_time_clock_punch','close_time_clock_pay_period','reopen_time_clock_pay_period']) assert.match(clock,new RegExp(rpc));
  assert.doesNotMatch(clock,/from\('time_clock_punches'\)\.(insert|update|delete|upsert)/);
  assert.doesNotMatch(clock,/from\('time_clock_breaks'\)\.(insert|update|delete|upsert)/);
});

test('employee and kiosk break starts cannot request paid payroll time',()=>{
  assert.match(clock,/start_time_clock_break',\{p_paid:false,p_source:'web'\}/);
  assert.match(kiosk,/p_paid_break:false/);
  assert.doesNotMatch(kiosk,/p_paid_break:true/);
});

test('kiosk uses the server PIN action and never reads credential hashes',()=>{
  assert.match(kiosk,/kiosk_time_clock_action/);
  assert.doesNotMatch(kiosk,/employee_time_clock_credentials/);
  assert.doesNotMatch(clock,/pin_hash/);
});

test('tips financial lifecycle uses server RPCs and does not write evidence tables directly',()=>{
  for(const rpc of ['ensure_tip_pool_run','add_tip_contribution','remove_tip_contribution','generate_tip_distributions','finalize_tip_pool_run','cancel_tip_pool_run','upsert_tip_pool_receiver','remove_tip_pool_receiver','tip_pool_report','my_tip_report']) assert.match(tips,new RegExp(rpc));
  for(const table of ['tip_pool_runs','tip_contributions','tip_distributions','tip_pool_receivers','tip_run_audit']) assert.doesNotMatch(tips,new RegExp(`from\\('${table}'\\)\\.(insert|update|delete|upsert)`));
});

test('tips UI makes negative corrections explicit adjustments',()=>{
  assert.match(tips,/Negative corrections must use Adjustment source/);
  assert.match(tips,/value="adjustment"/);
});

test('Tools exposes time clock and tips',()=>{
  assert.match(tools,/href:'\/time-clock'/);
  assert.match(tools,/href:'\/tips'/);
});
