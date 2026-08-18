import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/time_clock_closed_period_integrity_v1.sql','utf8');

function body(name:string){
  const marker=`create or replace function ${name}`;
  const start=sql.toLowerCase().indexOf(marker.toLowerCase());
  assert.ok(start>=0,`${name} must exist`);
  const next=sql.toLowerCase().indexOf('create or replace function ',start+marker.length);
  return sql.slice(start,next<0?sql.length:next);
}

test('private helper ensures and locks every relevant pay period before mutation',()=>{
  const fn=body('private.time_clock_lock_open_periods');
  assert.match(fn,/perform public\.ensure_time_clock_pay_period\(local_date\)/i);
  assert.match(fn,/order by p\.starts_on,p\.id[\s\S]*for update/i);
  assert.match(fn,/if pp\.status<>'open'/i);
  assert.match(fn,/reopen the pay period before changing timecard evidence/i);
  assert.match(sql,/revoke all on function private\.time_clock_lock_open_periods\(uuid,timestamptz\[\]\) from public,anon,authenticated/i);
});

test('manager create and edit lock target and original accounting periods',()=>{
  const fn=body('public.manager_upsert_time_clock_punch');
  assert.match(fn,/p_punch_id is null[\s\S]*time_clock_lock_open_periods\(loc,array\[p_clock_in\]\)/i);
  assert.match(fn,/select p\.clock_in into observed_clock_in/i);
  assert.match(fn,/time_clock_lock_open_periods\(loc,array\[observed_clock_in,p_clock_in\]\)/i);
  assert.match(fn,/for update/i);
  assert.match(fn,/locked_clock_in is distinct from observed_clock_in/i);
  assert.doesNotMatch(fn,/time_clock_period_is_open/i);
});

test('employee attestation cannot modify a closed payroll period',()=>{
  const fn=body('public.employee_attest_time_clock_punch');
  const lock=fn.indexOf('time_clock_lock_open_periods');
  const update=fn.indexOf('update public.time_clock_punches');
  assert.ok(lock>=0&&update>lock,'period lock must precede punch update');
  assert.match(fn,/p\.clock_in is distinct from observed_clock_in/i);
  assert.match(fn,/employee_approval_status='disputed'/i);
  assert.match(fn,/manager_approved_by=null/i);
});

test('single manager approval cannot mutate a closed payroll period',()=>{
  const fn=body('public.manager_approve_time_clock_punch');
  const lock=fn.indexOf('time_clock_lock_open_periods');
  const punchLock=fn.indexOf('for update',lock);
  const update=fn.indexOf('update public.time_clock_punches',punchLock);
  assert.ok(lock>=0&&punchLock>lock&&update>punchLock,'period must be locked before the punch mutation');
  assert.match(fn,/open punches cannot be approved/i);
  assert.match(fn,/open breaks must be ended before approval/i);
});

test('bulk approval serializes on the pay-period row and refuses closed periods',()=>{
  const fn=body('public.manager_approve_all_time_clock_punches');
  const period=fn.indexOf('from public.time_clock_pay_periods');
  const periodLock=fn.indexOf('for update',period);
  const update=fn.indexOf('update public.time_clock_punches',periodLock);
  assert.ok(period>=0&&periodLock>period&&update>periodLock,'pay period must lock before bulk punch updates');
  assert.match(fn,/pp\.status<>'open'/i);
  assert.match(fn,/reopen the pay period before approving punches/i);
});

test('manager edits crossing pay periods use deterministic period lock ordering',()=>{
  const helper=body('private.time_clock_lock_open_periods');
  assert.match(helper,/order by p\.starts_on,p\.id[\s\S]*for update/i);
  const upsert=body('public.manager_upsert_time_clock_punch');
  assert.match(upsert,/array\[observed_clock_in,p_clock_in\]/i);
});
