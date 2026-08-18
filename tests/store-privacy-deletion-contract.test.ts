import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const privacy=fs.readFileSync('app/privacy/page.tsx','utf8');
const support=fs.readFileSync('app/support/page.tsx','utf8');
const deletion=fs.readFileSync('app/delete-account/page.tsx','utf8');
const sql=fs.readFileSync('docs/database/account_deletion_requests_v1.sql','utf8');

test('store-facing privacy, support, and external deletion routes are public build artifacts',()=>{
  for(const path of ['app/privacy/page.tsx','app/support/page.tsx','app/delete-account/page.tsx']) assert.ok(fs.existsSync(path),`missing public store route: ${path}`);
  assert.match(privacy,/Privacy Policy/);
  assert.match(privacy,/Política de Privacidad/);
  assert.match(support,/Support/);
  assert.match(support,/Soporte/);
  assert.match(deletion,/request_account_deletion_external/);
  assert.match(deletion,/does not reveal whether an email is registered/);
  assert.match(deletion,/no revela si un correo está registrado/);
});

test('privacy policy covers actual high-level processors and deletion/retention behavior',()=>{
  for(const provider of ['Supabase','Cloudflare','Apple','Google','PostHog','Toast','AI']) assert.ok(privacy.includes(provider),`privacy policy missing processor/data-flow disclosure: ${provider}`);
  assert.match(privacy,/Retention and deletion/);
  assert.match(privacy,/Conservación y eliminación/);
  assert.match(privacy,/theitaliancouplellc@gmail\.com/);
  assert.match(privacy,/\/delete-account/);
});

test('external deletion requests are anti-enumeration, rate-limited, and inaccessible as a table',()=>{
  assert.match(sql,/create table if not exists public\.account_deletion_requests/);
  assert.match(sql,/alter table public\.account_deletion_requests enable row level security/i);
  assert.match(sql,/revoke all on public\.account_deletion_requests from public, anon, authenticated/i);
  assert.match(sql,/private\.public_account_deletion_rate_limits/);
  assert.match(sql,/global_recent >= 100/);
  assert.match(sql,/ip_recent >= 5/);
  assert.match(sql,/from auth\.users u[\s\S]*lower\(u\.email\)=normalized_email/);
  assert.match(sql,/return jsonb_build_object\('ok',true\)/);
  assert.match(sql,/grant execute on function public\.request_account_deletion_external\(text,text,text\) to anon, authenticated/i);
  assert.doesNotMatch(sql,/return jsonb_build_object\([^;]*target_user_id/i);
});

test('existing in-app deletion requests and explicit authenticated RPC converge on the protected queue',()=>{
  assert.match(sql,/request_my_account_deletion/);
  assert.match(sql,/uid uuid := auth\.uid\(\)/);
  assert.match(sql,/grant execute on function public\.request_my_account_deletion\(text\) to authenticated/i);
  assert.match(sql,/capture_account_deletion_request_from_activity_log/);
  assert.match(sql,/new\.entity_id=new\.actor_user_id/);
  assert.match(sql,/activity_log_capture_account_deletion_request/);
  assert.match(sql,/values\(new\.actor_user_id,new\.location_id,'in_app'\)/);
});
