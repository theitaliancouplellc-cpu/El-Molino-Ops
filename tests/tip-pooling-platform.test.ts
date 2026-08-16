import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('employee My Tips uses finalized employee-scoped report RPC', () => {
  const page = read('app/tips/page.tsx');
  assert.match(page, /my_tip_report/);
  assert.match(page, /Finalized distributions/);
  assert.doesNotMatch(page, /tip_contributions/);
});

test('Tip Management supports multiple pools, receiver weights, contributions, allocation and immutable finalization', () => {
  const page = read('app/tips/manage/page.tsx');
  assert.match(page, /tip_pools/);
  assert.match(page, /upsert_tip_pool_receiver/);
  assert.match(page, /remove_tip_pool_receiver/);
  assert.match(page, /ensure_tip_pool_run/);
  assert.match(page, /add_tip_contribution/);
  assert.match(page, /remove_tip_contribution/);
  assert.match(page, /generate_tip_distributions/);
  assert.match(page, /finalize_tip_pool_run/);
  assert.match(page, /cancel_tip_pool_run/);
  assert.match(page, /tip_pool_payroll_report/);
  assert.match(page, /Export Payroll Tips CSV/);
  assert.match(page, /FINAL · IMMUTABLE/);
});

test('Tip Management explicitly does not claim a money-transfer payout rail', () => {
  const page = read('app/tips/manage/page.tsx');
  assert.match(page, /No money-transfer rail is built into this page/);
  assert.match(page, /payroll-ready reporting/);
});

test('Tips are exposed from Ops and manager Time Clocking', () => {
  const home = read('app/page.tsx');
  const timeClock = read('app/time-clock/manage/page.tsx');
  assert.match(home, /href="\/tips"/);
  assert.match(home, />Tips</);
  assert.match(timeClock, /href="\/tips\/manage"/);
});
