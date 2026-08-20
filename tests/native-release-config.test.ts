import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const canonicalOrigin = 'https://el-molino-ops.el-molino-ops-7537172ca8.workers.dev';

test('native release defaults to canonical production and fails closed outside explicit beta mode', async () => {
  const workflow = await readFile('.github/workflows/native-release.yml', 'utf8');

  assert.match(workflow, new RegExp(`default: ${canonicalOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.doesNotMatch(workflow, /el-molino-ops\.vercel\.app/);
  assert.match(workflow, /distribution_mode:/);
  assert.match(workflow, /- artifact-only/);
  assert.match(workflow, /- beta/);
  assert.match(workflow, /ref: \$\{\{ inputs\.release_sha \}\}/);
  assert.match(workflow, /Verify canonical production reports requested release/);
  assert.match(workflow, /GOOGLE_PLAY_SERVICE_ACCOUNT_JSON/);
  assert.match(workflow, /APP_STORE_CONNECT_API_PRIVATE_KEY/);
  assert.match(workflow, /npm run mobile:sync -- android/);
  assert.match(workflow, /npm run mobile:sync -- ios/);
  assert.doesNotMatch(workflow, /mobile:sync:android|mobile:sync:ios/);
});

test('Capacitor iOS sync fallback uses canonical Cloudflare production origin', async () => {
  const source = await readFile('scripts/capacitor-sync.mjs', 'utf8');

  assert.match(source, new RegExp(canonicalOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(source, /el-molino-ops\.vercel\.app/);
});
