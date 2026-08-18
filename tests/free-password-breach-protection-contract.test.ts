import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const client=fs.readFileSync('lib/supabase.ts','utf8');
const edge=fs.readFileSync('supabase/functions/password-risk-check/index.ts','utf8');

test('all supported password entry points are fail-closed behind the free breach check',()=>{
  assert.match(client,/prop === 'signInWithPassword'/);
  assert.match(client,/prop === 'signUp'/);
  assert.match(client,/prop === 'updateUser'/);
  assert.match(client,/passwordSafetyError\(credentials\?\.password\)/);
  assert.match(client,/passwordSafetyError\(attributes\.password\)/);
  assert.match(client,/Password safety check is temporarily unavailable/);
  assert.match(client,/known breach data and cannot be used/);
});

test('breach check uses HIBP k-anonymity and never sends the plaintext or complete hash',()=>{
  assert.match(edge,/crypto\.subtle\.digest\('SHA-1'/);
  assert.match(edge,/const prefix = hash\.slice\(0, 5\)/);
  assert.match(edge,/const suffix = hash\.slice\(5\)/);
  assert.match(edge,/api\.pwnedpasswords\.com\/range\/\$\{prefix\}/);
  assert.match(edge,/'Add-Padding': 'true'/);
  assert.doesNotMatch(edge,/range\/\$\{hash\}/);
  assert.doesNotMatch(edge,/console\.(log|info|warn|error).*password/i);
});

test('breach checker is bounded and does not persist password material',()=>{
  assert.match(edge,/password\.length > 256/);
  assert.match(edge,/AbortSignal\.timeout\(5000\)/);
  assert.match(edge,/'cache-control': 'no-store'/);
  assert.doesNotMatch(edge,/insert\(|upsert\(|update\(|createClient\(/);
});
