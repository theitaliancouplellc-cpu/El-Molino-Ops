import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const canonicalOrigin = 'https://el-molino-ops.el-molino-ops-7537172ca8.workers.dev';

test('native beta request dispatcher is one-shot, exact-SHA, canonical, and beta-only', async () => {
  const workflow = await readFile('.github/workflows/native-beta-request.yml', 'utf8');
  const request = JSON.parse(await readFile('.github/native-beta-request.json', 'utf8')) as {
    enabled: boolean;
    version_name: string;
    build_number: string;
    google_play_track: string;
    tracking_issue: number;
  };

  assert.equal(request.enabled, true);
  assert.match(request.version_name, /^\d+(\.\d+){1,2}$/);
  assert.match(request.build_number, /^[1-9]\d*$/);
  assert.ok(Number(request.build_number) <= 2_100_000_000);
  assert.equal(request.google_play_track, 'internal');
  assert.equal(request.tracking_issue, 142);

  assert.ok(workflow.includes('paths:'));
  assert.ok(workflow.includes('.github/native-beta-request.json'));
  assert.ok(workflow.includes('actions: write'));
  assert.ok(workflow.includes('RELEASE_SHA: ${{ github.sha }}'));
  assert.ok(workflow.includes(`CANONICAL_PRODUCTION_ORIGIN: ${canonicalOrigin}`));
  assert.ok(workflow.includes("distribution_mode: 'beta'"));
  assert.ok(workflow.includes('native-release.yml/dispatches'));
  assert.ok(workflow.includes("ref: 'main'"));
  assert.ok(!workflow.includes('el-molino-ops.vercel.app'));
});
