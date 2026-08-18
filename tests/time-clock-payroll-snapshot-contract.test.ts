import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/time_clock_payroll_snapshot_v1.sql','utf8');

function body(name:string){
  const marker=`create or replace function public.${name}`;
  const start=sql.toLowerCase().indexOf(marker.toLowerCase());
  assert.ok(start>=0,`${name} must exist`);
  const next=sql.toLowerCase().indexOf('create or replace function public.',start+marker.length);
  return sql.slice(start,next<0?sql.length:next);
}

test('closed periods require a persisted payroll snapshot',()=>{
  assert.match(sql,/add column if not exists payroll_snapshot jsonb/i);
  assert.match(sql,/add column if not exists payroll_snapshot_at timestamptz/i);
  assert.match(sql,/time_clock_pay_period_snapshot_state_chk/i);
  assert.match(sql,/status='closed' and payroll_snapshot is not null and payroll_snapshot_at is not null/i);
  assert.match(sql,/legacy closed pay periods require an explicit payroll snapshot/i);
});

test('closed payroll reports return stored history instead of current rates and rules',()=>{
  const fn=body('time_clock_worked_hours_wages');
  const closed=fn.indexOf("pp.status='closed'");
  const returned=fn.indexOf('return pp.payroll_snapshot',closed);
  const rates=fn.indexOf('employee_schedule_profiles',returned);
  assert.ok(closed>=0&&returned>closed,'closed snapshot branch missing');
  assert.ok(rates>returned,'live rate lookup must occur only after closed snapshot return');
  assert.match(fn,/closed pay period is missing its payroll snapshot/i);
  assert.match(fn,/'rules',jsonb_build_object/i);
  assert.match(fn,/'overtime_after_hours',ot_after/i);
  assert.match(fn,/'workweek_starts_on',cfg\.workweek_starts_on/i);
});

test('period close captures canonical approved payroll in the same transaction',()=>{
  const fn=body('close_time_clock_pay_period');
  assert.match(fn,/for update/i);
  assert.match(fn,/resolve all open punches before closing the pay period/i);
  assert.match(fn,/approve all punches before closing the pay period/i);
  assert.match(fn,/all employee timecards must be approved before closing the pay period/i);
  const snapshot=fn.indexOf('time_clock_worked_hours_wages(pp.id,true)');
  const close=fn.indexOf("set status='closed'",snapshot);
  assert.ok(snapshot>=0&&close>snapshot,'snapshot must be created before the closed state is committed');
  assert.match(fn,/payroll_snapshot=snapshot/i);
  assert.match(fn,/payroll_snapshot_at=snap_at/i);
});

test('reopening explicitly invalidates the prior payroll snapshot',()=>{
  const fn=body('reopen_time_clock_pay_period');
  assert.match(fn,/for update/i);
  assert.match(fn,/payroll_snapshot=null/i);
  assert.match(fn,/payroll_snapshot_at=null/i);
  assert.match(fn,/payroll_snapshot_by=null/i);
});

test('pay period ranges cannot overlap for one location',()=>{
  assert.match(sql,/time_clock_pay_periods_no_overlap/i);
  assert.match(sql,/exclude using gist/i);
  assert.match(sql,/location_id with =/i);
  assert.match(sql,/daterange\(starts_on,ends_on,'\[\]'\) with &&/i);
  assert.match(body('ensure_time_clock_pay_period'),/exception when exclusion_violation[\s\S]*pay-period cadence overlaps existing payroll history/i);
});

test('cadence and anchor cannot silently change after period history exists',()=>{
  const fn=body('guard_time_clock_settings');
  assert.match(fn,/new\.pay_period_frequency is distinct from old\.pay_period_frequency/i);
  assert.match(fn,/new\.pay_period_anchor is distinct from old\.pay_period_anchor/i);
  assert.match(fn,/exists\([\s\S]*from public\.time_clock_pay_periods/i);
  assert.match(fn,/pay-period cadence cannot change after payroll periods exist/i);
});
