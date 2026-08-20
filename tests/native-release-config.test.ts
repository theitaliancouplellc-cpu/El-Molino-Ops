import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const canonicalOrigin = 'https://el-molino-ops.el-molino-ops-7537172ca8.workers.dev';

test('native release defaults to canonical production and gates beta distribution on exact release evidence', async () => {
  const workflow = await readFile('.github/workflows/native-release.yml', 'utf8');

  assert.ok(workflow.includes(`default: ${canonicalOrigin}`));
  assert.ok(!workflow.includes('el-molino-ops.vercel.app'));
  assert.ok(workflow.includes('distribution_mode:'));
  assert.ok(workflow.includes('- artifact-only'));
  assert.ok(workflow.includes('- beta'));
  assert.ok(workflow.includes('ref: ${{ inputs.release_sha }}'));
  assert.ok(workflow.includes('Verify canonical production reports requested release'));
  assert.ok(workflow.includes('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'));
  assert.ok(workflow.includes('APP_STORE_CONNECT_API_PRIVATE_KEY'));
  assert.ok(workflow.includes('npm run mobile:sync -- android'));
  assert.ok(workflow.includes('npm run mobile:sync -- ios'));
  assert.ok(!workflow.includes('mobile:sync:android'));
  assert.ok(!workflow.includes('mobile:sync:ios'));
});

test('Capacitor iOS sync fallback uses canonical Cloudflare production origin', async () => {
  const source = await readFile('scripts/capacitor-sync.mjs', 'utf8');

  assert.ok(source.includes(canonicalOrigin));
  assert.ok(!source.includes('el-molino-ops.vercel.app'));
});

test('Google Play uploader is syntactically valid and refuses to commit a mismatched versionCode', async () => {
  const source = await readFile('scripts/release/upload-google-play.mjs', 'utf8');
  const syntax = spawnSync(process.execPath, ['--check', 'scripts/release/upload-google-play.mjs'], { encoding: 'utf8' });

  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
  assert.ok(source.includes("if (versionCode !== expectedBuildNumber)"));
  assert.ok(source.includes('edit will not be committed'));
  assert.ok(source.includes("scope: 'https://www.googleapis.com/auth/androidpublisher'"));
  assert.ok(!source.includes('console.log(rawServiceAccount)'));
});
