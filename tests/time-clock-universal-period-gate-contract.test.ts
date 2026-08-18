import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/time_clock_universal_period_gate_v1.sql','utf8');

function body(name:string){
  const marker=`create or replace function ${name}`;
  const start=sql.toLowerCase().indexOf(marker.toLowerCase());
  assert.ok(start>=0,`${name} must exist`);
  const next=sql.toLowerCase().indexOf('create or replace function ',start+marker.length);
  return sql.slice(start,next<0?sql.length:next);
}

test('all punch inserts and updates pass through a closed-period row lock',()=>{
  const fn=body('private.guard_time_clock_pay_period_mutation');
  assert.match(fn,/tg_op='INSERT'[\s\S]*from public\.time_clock_pay_periods[\s\S]*for update/i);
  assert.match(fn,/tg_op='UPDATE'[\s\S]*old\.clock_in[\s\S]*new\.clock_in[\s\S]*for update/i);
  assert.match(fn,/if pp\.status<>'open'/i);
  assert.match(sql,/before insert or update on public\.time_clock_punches/i);
});

test('period mutation trigger is client-inaccessible',()=>{
  assert.match(sql,/revoke all on function private\.guard_time_clock_pay_period_mutation\(\) from public,anon,authenticated/i);
});

test('clock-in serializes on the pay period before checking for an open punch',()=>{
  const fn=body('public.time_clock_clock_in_internal');
  const lock=fn.indexOf('time_clock_lock_open_periods');
  const duplicate=fn.indexOf('employee is already clocked in');
  const insert=fn.indexOf('insert into public.time_clock_punches');
  assert.ok(lock>=0&&duplicate>lock&&insert>duplicate,'period lock must precede duplicate check and insert');
  assert.match(fn,/where employee_id=e\.id and location_id=e\.location_id and clock_out is null/i);
});

test('clock-in keeps schedule and geofence validation',()=>{
  const fn=body('public.time_clock_clock_in_internal');
  assert.match(fn,/time_clock_match_shift/i);
  assert.match(fn,/require_scheduled_shift/i);
  assert.match(fn,/time_clock_validate_geo/i);
});

test('internal clock-in remains unavailable to normal clients',()=>{
  assert.match(sql,/revoke all on function public\.time_clock_clock_in_internal\(uuid,text,numeric,numeric,uuid\)[\s\S]*from public,anon,authenticated/i);
  assert.match(sql,/grant execute on function public\.time_clock_clock_in_internal\(uuid,text,numeric,numeric,uuid\)[\s\S]*to service_role/i);
});
