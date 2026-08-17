import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sw=fs.readFileSync('public/sw.js','utf8');
const client=fs.readFileSync('lib/employee-push.ts','utf8');
const preferences=fs.readFileSync('app/employee/notifications/preferences/page.tsx','utf8');
const migration=fs.readFileSync('docs/database/web_push_delivery_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/web-push-dispatch/index.ts','utf8');
const tsconfig=fs.readFileSync('tsconfig.json','utf8');

test('device push enrollment is explicit user-gesture flow and RPC-only',()=>{
  assert.match(client,/Notification\.requestPermission\(\)/);
  assert.match(client,/userVisibleOnly:\s*true/);
  assert.match(client,/applicationServerKey/);
  assert.match(client,/register_my_push_subscription/);
  assert.match(client,/remove_my_push_subscription/);
  assert.doesNotMatch(client,/\.from\(['"]push_subscriptions['"]\)/);
  assert.match(preferences,/Enable alerts on this device/);
  assert.match(preferences,/onClick=\{enableDevicePush\}/);
  assert.match(preferences,/add El Molino to your Home Screen/);
});

test('service worker displays privacy-safe pushes and constrains notification navigation',()=>{
  assert.match(sw,/addEventListener\(['"]push['"]/);
  assert.match(sw,/addEventListener\(['"]notificationclick['"]/);
  assert.match(sw,/showNotification\(['"]El Molino['"]/);
  assert.match(sw,/body:pushBody\(category\)/);
  assert.doesNotMatch(sw,/payload\.title/);
  assert.doesNotMatch(sw,/payload\.body/);
  assert.match(sw,/fallback=['"]\/employee\/notifications['"]/);
  assert.match(sw,/path===['"]\/employee['"]\|\|path\.startsWith\(['"]\/employee\/['"]\)/);
});

test('push subscription evidence is server-authoritative and delivery is durable',()=>{
  assert.match(migration,/revoke all on public\.push_subscriptions from anon, authenticated/i);
  assert.match(migration,/register_my_push_subscription/);
  assert.match(migration,/employee_self_setup_status/);
  assert.match(migration,/user_id=excluded\.user_id/);
  assert.match(migration,/unique\(notification_id,push_subscription_id\)/i);
  assert.match(migration,/for update of a skip locked/i);
  assert.match(migration,/status='retry'/);
  assert.match(migration,/p_status_code in \(404,410\)/);
  assert.match(migration,/web-push-retry-v1/);
  assert.match(migration,/net\.http_post/);
  assert.match(migration,/web_push_vapid_private_key/);
  assert.match(migration,/grant execute on function public\.get_web_push_runtime_config\(\) to service_role/i);
});

test('push dispatcher is secret-authenticated and never sends raw notification copy',()=>{
  assert.match(edge,/npm:web-push@3\.6\.7/);
  assert.match(edge,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edge,/x-el-molino-push-secret/);
  assert.match(edge,/get_web_push_runtime_config/);
  assert.match(edge,/claim_web_push_deliveries/);
  assert.match(edge,/complete_web_push_delivery/);
  assert.match(edge,/statusCode === 404 \|\| statusCode === 410/);
  assert.match(edge,/statusCode === 429/);
  assert.match(edge,/genericBody\(attempt\.category\)/);
  assert.doesNotMatch(edge,/attempt\.title/);
  assert.doesNotMatch(edge,/attempt\.body/);
});

test('Deno edge runtime remains isolated from the Next TypeScript compiler',()=>{
  const parsed=JSON.parse(tsconfig) as {exclude?:string[]};
  assert.ok(parsed.exclude?.includes('supabase/functions'));
});
