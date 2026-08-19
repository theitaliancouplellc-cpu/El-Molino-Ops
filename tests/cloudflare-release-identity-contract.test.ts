import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const deployWorkflow = fs.readFileSync('.github/workflows/deploy-cloudflare.yml', 'utf8');
const stagingWorkflow = fs.readFileSync('.github/workflows/cloudflare-staging-certification.yml', 'utf8');
const healthRoute = fs.readFileSync('app/api/health/route.ts', 'utf8');
const nextConfig = fs.readFileSync('next.config.ts', 'utf8');

function workflowStep(workflow: string, name: string, nextName?: string) {
  const startMarker = `- name: ${name}`;
  const start = workflow.indexOf(startMarker);
  assert.notEqual(start, -1, `workflow step not found: ${name}`);
  if (!nextName) return workflow.slice(start);
  const end = workflow.indexOf(`- name: ${nextName}`, start + startMarker.length);
  assert.notEqual(end, -1, `next workflow step not found: ${nextName}`);
  return workflow.slice(start, end);
}

function assertBoundedExactIdentityPropagation(step: string, label: string) {
  assert.match(step, /for i in \{1\.\.60\}/, `${label} must bound release propagation polling`);
  assert.match(step, /release=\$TARGET_SHA&attempt=\$i/, `${label} must probe the exact target release`);
  assert.match(step, /IDENTITY_MATCHED=false/, `${label} must track exact identity convergence`);
  assert.match(step, /BODY_SHA=.*h\.release\?\.sha/, `${label} must inspect the response release SHA during polling`);
  assert.match(step, /HEADER_SHA=.*x-el-molino-release/, `${label} must inspect the release header during polling`);
  assert.match(
    step,
    /if \[ "\$CODE" = 200 \] && \[ "\$BODY_SHA" = "\$TARGET_SHA" \] && \[ "\$HEADER_SHA" = "\$TARGET_SHA" \]; then/,
    `${label} must not accept HTTP 200 until both release identities match`,
  );
  assert.doesNotMatch(
    step,
    /if \[ "\$CODE" = 200 \]; then break; fi/,
    `${label} must not stop propagation polling merely because an older Worker version is healthy`,
  );
  assert.match(step, /test "\$IDENTITY_MATCHED" = true/, `${label} must fail closed if identity never converges`);
}

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

test('PR Cloudflare staging certification waits through version propagation without relaxing exact identity', () => {
  const step = workflowStep(
    stagingWorkflow,
    'Verify staging health, root runtime, and exact release identity',
    'Record deployed Cloudflare version identity',
  );
  assertBoundedExactIdentityPropagation(step, 'PR staging certification');
  assert.match(step, /h\.release\?\.sha!==expected/);
});

test('main release staging gate waits for exact release identity before production', () => {
  const step = workflowStep(
    deployWorkflow,
    'Gate production on exact-main staging health and root runtime',
    'Capture exact-main staging runtime-tail evidence',
  );
  assertBoundedExactIdentityPropagation(step, 'main release staging gate');
  assert.match(step, /h\.release\?\.sha!==expected/);
});

test('Cloudflare production smoke test rejects release identity drift after bounded propagation', () => {
  assert.match(deployWorkflow, /TARGET_SHA:\s*\$\{\{ github\.sha \}\}/);
  const step = workflowStep(
    deployWorkflow,
    'Verify exact production release identity',
    'Record final staging and production version identities',
  );
  assertBoundedExactIdentityPropagation(step, 'production release');
  assert.match(step, /h\.release\?\.sha!==expected/);
  assert.match(deployWorkflow, /Exact production release identity and required health: PASS/);
});
