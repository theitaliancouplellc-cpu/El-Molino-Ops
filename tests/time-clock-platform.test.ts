import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('employee Time Clock uses authoritative RPCs for punches, breaks, attestation and kiosk PIN', () => {
  const page = read('app/time-clock/page.tsx');
  assert.match(page, /time_clock_employee_id_for_user/);
  assert.match(page, /rpc\('clock_in'/);
  assert.match(page, /rpc\('clock_out'/);
  assert.match(page, /start_time_clock_break/);
  assert.match(page, /end_time_clock_break/);
  assert.match(page, /employee_attest_time_clock_punch/);
  assert.match(page, /set_time_clock_pin/);
  assert.match(page, /navigator\.geolocation/);
});

test('manager Time Clock supports approval, pay-period locking, punch and break corrections, wages and export', () => {
  const page = read('app/time-clock/manage/page.tsx');
  assert.match(page, /ensure_time_clock_pay_period/);
  assert.match(page, /manager_upsert_time_clock_punch/);
  assert.match(page, /manager_upsert_time_clock_break/);
  assert.match(page, /manager_remove_time_clock_break/);
  assert.match(page, /manager_approve_time_clock_punch/);
  assert.match(page, /manager_approve_all_time_clock_punches/);
  assert.match(page, /close_time_clock_pay_period/);
  assert.match(page, /reopen_time_clock_pay_period/);
  assert.match(page, /time_clock_worked_hours_wages/);
  assert.match(page, /time_clock_whos_working/);
  assert.match(page, /Export CSV/);
  assert.match(page, /Audit reason/);
});

test('Punch Pad authenticates each employee action through the kiosk RPC', () => {
  const page = read('app/time-clock/kiosk/page.tsx');
  assert.match(page, /kiosk_time_clock_action/);
  assert.match(page, /p_pin/);
  assert.match(page, /clock_in/);
  assert.match(page, /clock_out/);
  assert.match(page, /start_break/);
  assert.match(page, /end_break/);
});

test('Time Clock Settings exposes self-service, kiosk, geofence, pay-period and safe PIN management', () => {
  const page = read('app/time-clock/settings/page.tsx');
  assert.match(page, /time_clock_settings/);
  assert.match(page, /geofence_enabled/);
  assert.match(page, /auto_punch_out_hours/);
  assert.match(page, /pay_period_frequency/);
  assert.match(page, /workweek_starts_on/);
  assert.match(page, /time_clock_pin_status/);
  assert.match(page, /manager_set_time_clock_pin/);
  assert.match(page, /Use This Device’s Current Coordinates/);
});

test('Time Clock is exposed from the main Ops navigation', () => {
  const home = read('app/page.tsx');
  assert.match(home, /href="\/time-clock"/);
  assert.match(home, />Time Clock</);
});
