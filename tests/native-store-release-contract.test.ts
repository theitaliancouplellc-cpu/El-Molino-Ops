import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const info=fs.readFileSync('ios/App/App/Info.plist','utf8');
const entitlements=fs.readFileSync('ios/App/App/App.entitlements','utf8');
const sync=fs.readFileSync('scripts/capacitor-sync.mjs','utf8');
const gradle=fs.readFileSync('android/app/build.gradle','utf8');
const gitignore=fs.readFileSync('.gitignore','utf8');

test('iOS release configuration keeps push capability and targets modern 64-bit devices',()=>{
  assert.match(entitlements,/<key>aps-environment<\/key>/);
  assert.match(sync,/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements/);
  assert.match(sync,/com\.apple\.Push/);
  assert.match(sync,/refusing unsafe project rewrite/);
  assert.match(info,/<string>arm64<\/string>/);
  assert.doesNotMatch(info,/<string>armv7<\/string>/);
  assert.match(info,/<string>com\.elmolino\.ops<\/string>/);
});

test('Android release signing is optional in ordinary CI and secret-driven for production',()=>{
  assert.match(gradle,/EL_MOLINO_ANDROID_KEYSTORE/);
  assert.match(gradle,/EL_MOLINO_ANDROID_STORE_PASSWORD/);
  assert.match(gradle,/EL_MOLINO_ANDROID_KEY_ALIAS/);
  assert.match(gradle,/EL_MOLINO_ANDROID_KEY_PASSWORD/);
  assert.match(gradle,/releaseSigningConfigured/);
  assert.match(gradle,/signingConfig signingConfigs\.release/);
  assert.match(gradle,/applicationId "com\.elmolino\.ops"/);
  assert.doesNotMatch(gradle,/BEGIN PRIVATE KEY|storePassword\s+["'][^"']+["']|keyPassword\s+["'][^"']+["']/);
});

test('native provider and signing credential files cannot be committed accidentally',()=>{
  for(const expected of [
    'android/app/google-services.json',
    'android/app/*.jks',
    'android/app/*.keystore',
    '*.p12',
    '*.mobileprovision',
  ]) assert.ok(gitignore.includes(expected),`missing native credential ignore: ${expected}`);
});
