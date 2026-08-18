import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const client=fs.readFileSync('lib/native-push.ts','utf8');
const runtime=fs.readFileSync('app/native-runtime.tsx','utf8');
const migration=fs.readFileSync('docs/database/native_push_devices_v1.sql','utf8');
const appDelegate=fs.readFileSync('ios/App/App/AppDelegate.swift','utf8');
const manifest=fs.readFileSync('android/app/src/main/AndroidManifest.xml','utf8');

test('native push enrollment is explicit, authenticated, and revocable per device',()=>{
  assert.match(client,/PushNotifications\.requestPermissions\(\)/);
  assert.match(client,/PushNotifications\.register\(\)/);
  assert.match(client,/register_my_native_push_device/);
  assert.match(client,/remove_my_native_push_device/);
  assert.match(client,/Preferences\.(get|set|remove)/);
  assert.doesNotMatch(client,/\.from\(['"]native_push_devices['"]\)/);
});

test('native notification taps reuse the employee route sanitizer and preserve notification identity',()=>{
  assert.match(runtime,/pushNotificationActionPerformed/);
  assert.match(runtime,/employeeNotificationHref/);
  assert.match(runtime,/notification_id/);
});

test('native device records are server-authoritative, multi-device safe, and secret from clients',()=>{
  assert.match(migration,/unique\(user_id,device_id\)/i);
  assert.match(migration,/revoke all on public\.native_push_devices from anon,authenticated/i);
  assert.match(migration,/employee_self_setup_status/);
  assert.match(migration,/token_ciphertext/);
  assert.match(migration,/native_push_token_encryption_key/);
  assert.match(migration,/pgp_sym_encrypt/);
  assert.match(migration,/remove_my_native_push_device/);
  assert.match(migration,/grant execute on function public\.register_my_native_push_device/i);
});

test('platform notification plumbing is declared without committing provider credentials',()=>{
  assert.match(appDelegate,/didRegisterForRemoteNotificationsWithDeviceToken/);
  assert.match(appDelegate,/NotificationCenter\.default\.post/);
  assert.match(manifest,/android\.permission\.POST_NOTIFICATIONS/);
  assert.doesNotMatch(appDelegate,/BEGIN PRIVATE KEY|service[_-]?role/i);
});
