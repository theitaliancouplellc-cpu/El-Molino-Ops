import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const manager=readFileSync('app/manager/page.tsx','utf8');

test('manager command center exposes hardened people and pay systems',()=>{
  for(const href of ['/time-clock','/tips','/team','/training']) assert.match(manager,new RegExp(`href=["']${href}["']`),href);
  assert.match(manager,/time_clock_whos_working/);
  assert.match(manager,/timecards to review/);
  assert.match(manager,/draftTipRuns/);
  assert.match(manager,/draft runs/);
  assert.match(manager,/employee setups/);
  assert.match(manager,/href=["']\/manager\/team-setup["']/);
});

test('manager overview remains read-only for protected payroll evidence',()=>{
  for(const table of ['time_clock_punches','time_clock_breaks','time_clock_pay_periods','tip_pool_runs','tip_contributions','tip_distributions']){
    assert.doesNotMatch(manager,new RegExp(`from\\(['"]${table}['"]\\)\\.(insert|update|delete|upsert)`),table);
  }
  for(const rpc of ['clock_in','clock_out','start_time_clock_break','end_time_clock_break','manager_upsert_time_clock_punch','finalize_tip_pool_run','add_tip_contribution','remove_tip_contribution']){
    assert.doesNotMatch(manager,new RegExp(`rpc\\(['"]${rpc}['"]`),rpc);
  }
});
