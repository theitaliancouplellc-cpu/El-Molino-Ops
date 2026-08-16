import test from 'node:test';
import assert from 'node:assert/strict';
import {BACKUP_EXCLUDED_TABLES,BACKUP_FORMAT,BACKUP_TABLES} from '../lib/backup-manifest';

const SERVER_RECOVERY_TABLE_COUNT=127;
const mustCover=[
  'schedule_shifts','shift_pool_offers','time_off_requests',
  'time_clock_punches','time_clock_breaks','time_clock_pay_periods',
  'toast_sync_state','toast_employee_map','toast_time_entries','toast_order_payments','toast_cash_entries','toast_deposits',
  'tip_pools','tip_pool_runs','tip_distributions',
  'team_announcements','team_shoutouts',
  'training_courses','training_course_assignments','training_quiz_attempts',
  'hiring_applicants','hiring_offers',
  'onboarding_packages','onboarding_assignments',
  'restaurant_daily_performance','cash_control_sessions','inventory_counts','purchase_orders',
] as const;

test('v4 backup manifest covers modern operational modules',()=>{
  assert.equal(BACKUP_FORMAT,'el-molino-ops-backup-v4');
  assert.equal(BACKUP_TABLES.length,SERVER_RECOVERY_TABLE_COUNT,'browser manifest drifted from server recovery allow-list');
  for(const table of mustCover)assert.ok(BACKUP_TABLES.includes(table as any),`missing ${table}`);
});

test('portable backup excludes credentials, permission internals and runtime-only state',()=>{
  for(const table of ['employee_time_clock_credentials','permissions','role_permissions','api_rate_limits','push_subscriptions','client_events']){
    assert.ok(BACKUP_EXCLUDED_TABLES.includes(table));
    assert.ok(!BACKUP_TABLES.includes(table as any));
  }
});

test('backup manifest has no duplicate tables',()=>{
  assert.equal(new Set(BACKUP_TABLES).size,BACKUP_TABLES.length);
});
