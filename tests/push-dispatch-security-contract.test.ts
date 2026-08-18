import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const web=fs.readFileSync('supabase/functions/web-push-dispatch/index.ts','utf8');
const native=fs.readFileSync('supabase/functions/native-push-dispatch/index.ts','utf8');

for (const [name,source,header] of [
  ['web',web,'x-el-molino-push-secret'],
  ['native',native,'x-el-molino-native-push-secret'],
] as const) {
  test(`${name} push dispatcher bounds unauthenticated webhook requests`,()=>{
    assert.match(source,/req\.method !== 'POST'/);
    assert.match(source,/content-length/);
    assert.match(source,/declared > 4096/);
    assert.match(source,new RegExp(header));
    assert.match(source,/supplied\.length < 24/);
  });

  test(`${name} push dispatcher compares webhook secrets through fixed-size digests`,()=>{
    assert.match(source,/crypto\.subtle\.digest\('SHA-256'/);
    assert.match(source,/let diff = 0/);
    assert.match(source,/diff \|= av\[i\] \^ bv\[i\]/);
    assert.match(source,/return diff === 0/);
    assert.doesNotMatch(source,/suppliedSecret\s*!==\s*runtime\.webhook_secret/);
  });
}

test('web push provider calls have a bounded timeout',()=>{
  assert.match(web,/sendNotification\([\s\S]*timeout: 10000/);
});

test('native push external provider calls have bounded timeouts',()=>{
  const matches=native.match(/AbortSignal\.timeout\(10000\)/g) || [];
  assert.ok(matches.length >= 3,`expected FCM OAuth, APNs and FCM send timeouts; found ${matches.length}`);
});
