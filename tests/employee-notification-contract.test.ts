import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {employeeNotificationHref,safeEmployeeNotificationHref} from '../lib/employee-notifications';

const center=readFileSync('app/employee/notifications/page.tsx','utf8');
const preferences=readFileSync('app/employee/notifications/preferences/page.tsx','utf8');
const schedule=readFileSync('app/employee/schedule/page.tsx','utf8');
const scheduleI18n=readFileSync('lib/i18n-schedule.ts','utf8');
const migration=readFileSync('docs/database/employee_parity_notifications_v1.sql','utf8');
const deepLinks=readFileSync('docs/database/employee_parity_staff_deep_links_v1.sql','utf8');
const engagement=readFileSync('docs/database/employee_engagement_shift_pool_v5.sql','utf8');
const backup=readFileSync('lib/backup-manifest.ts','utf8');

test('employee notification links are constrained and canonicalized to dedicated staff surfaces',()=>{
  for(const href of ['/employee','/employee/schedule?week=2026-08-17','/employee/time-clock','/employee/tips','/employee/shift-pool','/employee/requests','/employee/team','/employee/training','/account'])assert.equal(safeEmployeeNotificationHref(href),href);
  assert.equal(safeEmployeeNotificationHref('/schedule/pool?tab=mine'),'/employee/shift-pool?tab=mine');
  assert.equal(safeEmployeeNotificationHref('/schedule/requests'),'/employee/requests');
  assert.equal(safeEmployeeNotificationHref('/team?announcement=abc'),'/employee/team?announcement=abc');
  assert.equal(safeEmployeeNotificationHref('/training/courses'),'/employee/training');
  for(const href of ['/manager','/admin','/tools','/time-clock','/tips','/schedule','//evil.example/path','https://example.com','/employee/../manager','/employee/%2e%2e/admin','/team/../../cash'])assert.equal(safeEmployeeNotificationHref(href),'/employee');
  assert.equal(employeeNotificationHref('/employee/schedule?week=2026-08-17','abc'),'/employee/schedule?week=2026-08-17&notice=abc');
  assert.equal(employeeNotificationHref('/team','abc'),'/employee/team');
});

test('notification center uses server-authoritative read state and contextual schedule links',()=>{
  assert.match(center,/mark_my_notification_read/);
  assert.match(center,/mark_all_my_notifications_read/);
  assert.match(center,/employeeNotificationHref\(n\.href,n\.id\)/);
  assert.match(center,/Notification Center/);
  assert.match(center,/Preferences/);
});

test('notification preferences are RPC controlled and in-app history remains mandatory',()=>{
  assert.match(preferences,/get_my_notification_preferences/);
  assert.match(preferences,/set_my_notification_preference/);
  assert.match(preferences,/In-app always on/);
  assert.match(migration,/notification_preferences_in_app_required check\(in_app=true\)/);
  assert.match(migration,/revoke insert,update,delete on public\.notification_preferences from authenticated/);
});

test('notification identity is normalized, deduplicated and immutable',()=>{
  for(const field of ['category','event_key','dedupe_key','priority'])assert.match(migration,new RegExp(`new\\.${field} is distinct from old\\.${field}`));
  assert.match(migration,/notifications_user_dedupe_uidx/);
  assert.match(migration,/notification content is immutable/);
  assert.match(migration,/normalize_notification_event/);
});

test('published schedule notifications are revision-aware and changed-only is evidence based',()=>{
  assert.match(migration,/p_notification_mode not in \('everyone','changed_only','none'\)/);
  assert.match(migration,/changed-only notifications require a prior publication/);
  assert.match(migration,/schedule_shift_change_log/);
  assert.match(migration,/changed_shift_ids/);
  assert.match(migration,/schedule\.shift_changed/);
  assert.match(migration,/\/employee\/schedule\?week=/);
  assert.match(schedule,/changed_shift_ids/);
  assert.match(schedule,/\{tx\.updated\}/);
  assert.match(scheduleI18n,/updated:'Updated in the latest publication'/);
});

test('legacy staff notification deep links migrate to dedicated employee surfaces including Shift Pool',()=>{
  assert.match(deepLinks,/\/employee\/time-clock/);
  assert.match(deepLinks,/\/employee\/tips/);
  assert.match(deepLinks,/\/employee\/schedule/);
  assert.match(engagement,/new\.href:='\/employee\/shift-pool'/);
  assert.match(engagement,/new\.href:='\/employee\/requests'/);
  assert.match(engagement,/new\.href:='\/employee\/team'/);
  assert.match(engagement,/new\.href:='\/employee\/training'/);
  assert.match(backup,/notification_preferences/);
});
