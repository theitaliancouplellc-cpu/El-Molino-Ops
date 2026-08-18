import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const info=fs.readFileSync('ios/App/App/Info.plist','utf8');
const entitlements=fs.readFileSync('ios/App/App/App.entitlements','utf8');
const sync=fs.readFileSync('scripts/capacitor-sync.mjs','utf8');
const gradle=fs.readFileSync('android/app/build.gradle','utf8');
const gitignore=fs.readFileSync('.gitignore','utf8');
const releaseWorkflow=fs.readFileSync('.github/workflows/native-release.yml','utf8');

test('iOS release configuration keeps push capability and targets modern 64-bit devices',()=>{
  assert.match(entitlements,/<key>aps-environment<\/key>/);
  assert.match(sync,/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements/);
  assert.match(sync,/com\.apple\.Push/);
  assert.match(sync,/refusing unsafe project rewrite/);
  assert.match(info,/<string>arm64<\/string>/);
  assert.doesNotMatch(info,/<string>armv7<\/string>/);
  assert.match(info,/<string>com\.elmolino\.ops<\/string>/);
});

test('iOS app-bound domain follows the HTTPS origin selected for the native release',()=>{
  assert.match(sync,/CAPACITOR_SERVER_URL/);
  assert.match(sync,/serverUrl\.protocol !== 'https:'/);
  assert.match(sync,/WKAppBoundDomains/);
  assert.match(sync,/serverUrl\.hostname/);
  assert.match(sync,/refusing unsafe plist rewrite/);
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

test('native store release is manual, fail-closed, signed, and produces store artifacts',()=>{
  assert.match(releaseWorkflow,/workflow_dispatch:/);
  assert.doesNotMatch(releaseWorkflow,/\n\s+push:/);
  assert.match(releaseWorkflow,/CAPACITOR_SERVER_URL: \$\{\{ inputs\.server_url \}\}/);

  for(const secret of [
    'ANDROID_KEYSTORE_BASE64',
    'ANDROID_GOOGLE_SERVICES_JSON_BASE64',
    'ANDROID_STORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
    'APPLE_TEAM_ID',
    'IOS_DISTRIBUTION_CERTIFICATE_P12_BASE64',
    'IOS_DISTRIBUTION_CERTIFICATE_PASSWORD',
    'IOS_PROVISIONING_PROFILE_BASE64',
  ]) assert.ok(releaseWorkflow.includes(`secrets.${secret}`),`missing release secret gate: ${secret}`);

  assert.match(releaseWorkflow,/bundleRelease/);
  assert.match(releaseWorkflow,/jarsigner -verify -strict/);
  assert.match(releaseWorkflow,/\.aab/);
  assert.match(releaseWorkflow,/xcodebuild[\s\S]*archive/);
  assert.match(releaseWorkflow,/xcodebuild -exportArchive/);
  assert.match(releaseWorkflow,/app-store-connect/);
  assert.match(releaseWorkflow,/aps-environment/);
  assert.match(releaseWorkflow,/test "\$APS_ENV" = 'production'/);
  assert.match(releaseWorkflow,/actions\/upload-artifact@v4/);
});

test('signed iOS release fails closed when privacy manifests are absent or malformed',()=>{
  assert.match(releaseWorkflow,/find "\$APP" -name PrivacyInfo\.xcprivacy -type f -print/);
  assert.match(releaseWorkflow,/test -s "\$PRIVACY_MANIFESTS"/);
  assert.match(releaseWorkflow,/Signed iOS app contains no PrivacyInfo\.xcprivacy manifest/);
  assert.match(releaseWorkflow,/while IFS= read -r manifest/);
  assert.match(releaseWorkflow,/plutil -lint "\$manifest"/);
});
