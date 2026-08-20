import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const canonicalOrigin = 'https://el-molino-ops.el-molino-ops-7537172ca8.workers.dev';

test('native beta request dispatcher is exact-SHA, canonical, observable, and beta-only', async () => {
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
  assert.ok(workflow.includes('statuses: write'));
  assert.ok(workflow.includes('RELEASE_SHA: ${{ github.sha }}'));
  assert.ok(workflow.includes(`CANONICAL_PRODUCTION_ORIGIN: ${canonicalOrigin}`));
  assert.ok(workflow.includes('Wait for exact certified canonical production'));
  assert.ok(workflow.includes("x.context==='Cloudflare Production'"));
  assert.ok(workflow.includes('h.release?.sha'));
  assert.ok(workflow.includes('x-el-molino-release'));
  assert.ok(workflow.includes("distribution_mode: 'beta'"));
  assert.ok(workflow.includes('native-release.yml/dispatches'));
  assert.ok(workflow.includes("ref: 'main'"));
  assert.ok(workflow.includes('Resolve dispatched native release run'));
  assert.ok(workflow.includes('Wait for native beta build and store upload'));
  assert.ok(workflow.includes('Native Beta Distribution'));
  assert.ok(workflow.includes('/actions/workflows/native-release.yml/runs?event=workflow_dispatch&branch=main'));
  assert.ok(!workflow.includes('el-molino-ops.vercel.app'));
});

test('retry request uses a unique valid internal beta build number', async () => {
  const request = JSON.parse(await readFile('.github/native-beta-request.json', 'utf8')) as {
    build_number: string;
    google_play_track: string;
  };

  assert.equal(request.build_number, '2026082002');
  assert.equal(request.google_play_track, 'internal');
});
