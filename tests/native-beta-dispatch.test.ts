import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const canonicalOrigin = 'https://el-molino-ops.el-molino-ops-7537172ca8.workers.dev';

function extractRunBlocks(workflow: string): string[] {
  const lines = workflow.split('\n');
  const blocks: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)run:\s*\|\s*$/);
    if (!match) continue;

    const yamlIndent = match[1].length;
    const scriptIndent = yamlIndent + 2;
    const script: string[] = [];

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line.trim() === '') {
        script.push('');
        continue;
      }

      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      if (indent <= yamlIndent) break;
      script.push(line.slice(scriptIndent));
    }

    blocks.push(script.join('\n'));
  }

  return blocks;
}

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
  assert.ok(workflow.includes('Publish failed native beta orchestration status'));
  assert.ok(workflow.includes('Native Beta Distribution'));
  assert.ok(workflow.includes('/actions/workflows/native-release.yml/runs?event=workflow_dispatch&branch=main'));
  assert.ok(!workflow.includes('el-molino-ops.vercel.app'));
});

test('every native beta dispatcher shell run block parses with bash -n', async () => {
  const workflow = await readFile('.github/workflows/native-beta-request.yml', 'utf8');
  const blocks = extractRunBlocks(workflow);

  assert.ok(blocks.length >= 7, 'expected the dispatcher to contain all shell execution gates');

  for (const [index, script] of blocks.entries()) {
    const syntax = spawnSync('bash', ['-n'], { input: script, encoding: 'utf8' });
    assert.equal(syntax.status, 0, `shell block ${index + 1} failed bash -n:\n${syntax.stderr || syntax.stdout}`);
  }
});

test('retry request uses a unique valid internal beta build number', async () => {
  const request = JSON.parse(await readFile('.github/native-beta-request.json', 'utf8')) as {
    build_number: string;
    google_play_track: string;
  };

  assert.equal(request.build_number, '2026082003');
  assert.equal(request.google_play_track, 'internal');
});
