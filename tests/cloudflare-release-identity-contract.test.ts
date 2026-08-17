import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const deployWorkflow = fs.readFileSync('.github/workflows/deploy-cloudflare.yml', 'utf8');
const healthRoute = fs.readFileSync('app/api/health/route.ts', 'utf8');

test('Cloudflare production deploy injects the immutable GitHub release SHA', () => {
  assert.match(deployWorkflow, /command:\s*deploy --var GITHUB_SHA:\$\{\{ github\.sha \}\}/);
  assert.match(healthRoute, /process\.env\.GITHUB_SHA/);
});

test('Cloudflare production smoke test rejects release identity drift', () => {
  assert.match(deployWorkflow, /EXPECTED_RELEASE_SHA:\s*\$\{\{ github\.sha \}\}/);
  assert.match(deployWorkflow, /h\.release\?\.sha !== expected/);
  assert.match(deployWorkflow, /Release identity: PASS/);
});
