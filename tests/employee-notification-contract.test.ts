import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {employeeNotificationHref,safeEmployeeNotificationHref} from '../lib/employee-notifications';

const center=readFileSync('app/employee/notifications/page.tsx','utf8');
const preferences=readFileSync('app/employee/notifications/preferences/page.tsx','utf8');
const schedule=readFileSync('app/employee/schedule/page.tsx','utf8');
const migration=readFileSync('docs/database/employee_parity_notifications_v1.sql','utf8');
const deepLinks=readFileSync('docs/database/employee_parity_staff_deep_links_v1.sql','utf8');
const backup=readFileSync('lib/backup-manifest.ts','utf8');

test('employee notification links are constrained to normalized staff-safe surfaces',()=>{
  for(const href of ['/employee','/employee/schedule?week=2026-08-17','/employee/time-clock','/employee/tips','/schedule/pool','/schedule/requests','/team','/training/courses','/account'])assert.equal(safeEmployeeNotificationHref(href),href);
  for(const href of ['/manager','/admin','/tools','/time-clock','/tips','/schedule','//evil.example/path','https://example.com','/employee/../manager','/employee/%2e%2e/admin','/team/../../cash'])assert.equal(safeEmployeeNotificationHref(href),'/employee');
  assert.equal(employeeNotificationHref('/employee/schedule?week=2026-08-17','abc'),'/employee/schedule?week=2026-08-17&notice=abc');
  assert.equal(employeeNotificationHref('/team','abc'),'/team');
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
  assert.match(schedule,/Updated in the latest publication/);
});

test('legacy staff notification deep links are migrated to dedicated employee surfaces',()=>{
  assert.match(deepLinks,/\/employee\/time-clock/);
  assert.match(deepLinks,/\/employee\/tips/);
  assert.match(deepLinks,/\/employee\/schedule/);
  assert.match(backup,/notification_preferences/);
});
