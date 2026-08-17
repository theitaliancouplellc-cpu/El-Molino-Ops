import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const deployWorkflow = fs.readFileSync('.github/workflows/deploy-cloudflare.yml', 'utf8');
const healthRoute = fs.readFileSync('app/api/health/route.ts', 'utf8');
const nextConfig = fs.readFileSync('next.config.ts', 'utf8');

test('Cloudflare production build bakes the immutable GitHub release SHA into the Next bundle', () => {
  assert.match(deployWorkflow, /EL_MOLINO_RELEASE_SHA:\s*\$\{\{ github\.sha \}\}/);
  assert.doesNotMatch(deployWorkflow, /deploy --var GITHUB_SHA/);
  assert.match(nextConfig, /env:\s*\{[\s\S]*EL_MOLINO_RELEASE_SHA:\s*releaseSha/);
  assert.match(nextConfig, /process\.env\.GITHUB_SHA/);
  assert.match(healthRoute, /process\.env\.EL_MOLINO_RELEASE_SHA/);
});

test('Cloudflare production smoke test rejects release identity drift', () => {
  assert.match(deployWorkflow, /EXPECTED_RELEASE_SHA:\s*\$\{\{ github\.sha \}\}/);
  assert.match(deployWorkflow, /h\.release\?\.sha !== expected/);
  assert.match(deployWorkflow, /Release identity: PASS/);
});
