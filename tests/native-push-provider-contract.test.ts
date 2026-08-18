import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/native_push_delivery_v1.sql','utf8');
const dispatcher=fs.readFileSync('supabase/functions/native-push-dispatch/index.ts','utf8');

test('native provider delivery is durable, retryable, and inaccessible to app clients',()=>{
  assert.match(sql,/native_push_delivery_attempts/);
  assert.match(sql,/status in \('pending','sending','retry','sent','expired','permanent_failure','skipped'\)/i);
  assert.match(sql,/for update of a skip locked/i);
  assert.match(sql,/recovered_stale_lock/);
  assert.match(sql,/attempt_count<5/i);
  assert.match(sql,/revoke all on public\.native_push_delivery_attempts from public,anon,authenticated/i);
  assert.match(sql,/grant execute on function public\.claim_native_push_deliveries\(uuid,integer\) to service_role/i);
  assert.doesNotMatch(sql,/grant execute on function public\.claim_native_push_deliveries[^;]+authenticated/i);
});

test('native tokens are decrypted only inside the service delivery claim',()=>{
  assert.match(sql,/native_push_token_encryption_key/);
  assert.match(sql,/pgp_sym_decrypt\(decode\(d\.token_ciphertext,'base64'\),encryption_key\)/i);
  assert.match(sql,/token_ciphertext=''/);
  assert.doesNotMatch(dispatcher,/native_push_token_encryption_key/);
});

test('notification insert queues eligible active devices and invokes only a secret-authenticated dispatcher',()=>{
  assert.match(sql,/after insert on public\.notifications/i);
  assert.match(sql,/exists\(select 1 from public\.employees/i);
  assert.match(sql,/notification_preferences/);
  assert.match(sql,/native_push_webhook_secret/);
  assert.match(sql,/x-el-molino-native-push-secret/);
  assert.match(dispatcher,/x-el-molino-native-push-secret/);
  assert.match(dispatcher,/suppliedSecret\.length < 24/);
});

test('APNs and FCM provider paths use short-lived signed credentials with no committed secret material',()=>{
  assert.match(dispatcher,/api\.push\.apple\.com/);
  assert.match(dispatcher,/api\.sandbox\.push\.apple\.com/);
  assert.match(dispatcher,/new SignJWT\(\{ iss: teamId \}\)/);
  assert.match(dispatcher,/fcm\.googleapis\.com\/v1\/projects/);
  assert.match(dispatcher,/oauth2\.googleapis\.com\/token/);
  assert.match(dispatcher,/firebase\.messaging/);
  assert.doesNotMatch(dispatcher,/BEGIN (EC |RSA )?PRIVATE KEY/);
  assert.doesNotMatch(dispatcher,/AIza[0-9A-Za-z_-]{20,}/);
});

test('provider failures classify retries and expired tokens without leaking notification-authored content',()=>{
  assert.match(dispatcher,/UNREGISTERED/);
  assert.match(dispatcher,/BadDeviceToken/);
  assert.match(dispatcher,/Unregistered/);
  assert.match(dispatcher,/res\.status === 429 \|\| res\.status >= 500/);
  assert.match(dispatcher,/genericBody\(attempt\.category\)/);
  assert.match(dispatcher,/safeEmployeeHref\(attempt\.href\)/);
  assert.doesNotMatch(dispatcher,/notification\.title|notification\.body|authored/i);
});
