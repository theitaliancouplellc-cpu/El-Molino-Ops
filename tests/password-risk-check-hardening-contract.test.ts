import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('supabase/functions/password-risk-check/index.ts','utf8');

test('password risk checker is bounded and fail-closed',()=>{
  assert.match(source,/content-length/);
  assert.match(source,/declared > 2048/);
  assert.match(source,/p_bucket: 'password-risk-check'/);
  assert.match(source,/p_limit: 20/);
  assert.match(source,/p_window_seconds: 60/);
  assert.match(source,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source,/rate_limited/);
  assert.match(source,/password_safety_temporarily_unavailable/);
});

test('HIBP lookup preserves k-anonymity and never returns breach counts',()=>{
  assert.match(source,/hash\.slice\(0, 5\)/);
  assert.match(source,/hash\.slice\(5\)/);
  assert.match(source,/api\.pwnedpasswords\.com\/range\/\$\{prefix\}/);
  assert.match(source,/'Add-Padding': 'true'/);
  assert.match(source,/return json\(200, \{ ok: true, compromised \}\)/);
  assert.doesNotMatch(source,/compromised_count/);
  assert.doesNotMatch(source,/console\.(log|info|warn|error)\s*\(/);
});
