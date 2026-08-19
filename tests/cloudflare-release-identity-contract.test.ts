import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const deployWorkflow = fs.readFileSync('.github/workflows/deploy-cloudflare.yml', 'utf8');
const healthRoute = fs.readFileSync('app/api/health/route.ts', 'utf8');
const nextConfig = fs.readFileSync('next.config.ts', 'utf8');

test('Cloudflare production build bakes the immutable GitHub release SHA into the Next bundle', () => {
  assert.match(deployWorkflow, /TARGET_SHA:\s*\$\{\{ github\.sha \}\}/);
  assert.match(deployWorkflow, /EL_MOLINO_RELEASE_SHA="\$TARGET_SHA" RELEASE_SHA="\$TARGET_SHA" npm run cf:build/);
  assert.doesNotMatch(deployWorkflow, /deploy --var GITHUB_SHA/);
  assert.match(nextConfig, /env:\s*\{[\s\S]*EL_MOLINO_RELEASE_SHA:\s*releaseSha/);
  assert.match(nextConfig, /process\.env\.GITHUB_SHA/);
  assert.match(healthRoute, /process\.env\.EL_MOLINO_RELEASE_SHA/);
  assert.match(deployWorkflow, /Built Cloudflare artifact does not contain expected release SHA/);
  assert.match(deployWorkflow, /grep -R -F -q/);
});

test('Cloudflare production smoke test rejects release identity drift after bounded propagation', () => {
  assert.match(deployWorkflow, /TARGET_SHA:\s*\$\{\{ github\.sha \}\}/);
  assert.match(deployWorkflow, /for i in \{1\.\.60\}/);
  assert.match(deployWorkflow, /release=\$TARGET_SHA&attempt=\$i/);
  assert.match(deployWorkflow, /h\.release\?\.sha!==expected/);
  assert.match(deployWorkflow, /test "\$HEADER_SHA" = "\$TARGET_SHA"/);
  assert.match(deployWorkflow, /Exact production release identity and required health: PASS/);
});