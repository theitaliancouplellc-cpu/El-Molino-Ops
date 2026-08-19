import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const deployWorkflow = fs.readFileSync('.github/workflows/deploy-cloudflare.yml', 'utf8');
const stagingWorkflow = fs.readFileSync('.github/workflows/cloudflare-staging-certification.yml', 'utf8');
const healthRoute = fs.readFileSync('app/api/health/route.ts', 'utf8');
const nextConfig = fs.readFileSync('next.config.ts', 'utf8');

function assertBoundedExactIdentityPropagation(workflow: string, label: string) {
  assert.match(workflow, /for i in \{1\.\.60\}/, `${label} must bound release propagation polling`);
  assert.match(workflow, /release=\$TARGET_SHA&attempt=\$i/, `${label} must probe the exact target release`);
  assert.match(workflow, /IDENTITY_MATCHED=false/, `${label} must track exact identity convergence`);
  assert.match(workflow, /BODY_SHA=.*h\.release\?\.sha/, `${label} must inspect the response release SHA during polling`);
  assert.match(workflow, /HEADER_SHA=.*x-el-molino-release/, `${label} must inspect the release header during polling`);
  assert.match(
    workflow,
    /if \[ "\$CODE" = 200 \] && \[ "\$BODY_SHA" = "\$TARGET_SHA" \] && \[ "\$HEADER_SHA" = "\$TARGET_SHA" \]; then/,
    `${label} must not accept HTTP 200 until both release identities match`,
  );
  assert.doesNotMatch(
    workflow,
    /if \[ "\$CODE" = 200 \]; then break; fi/,
    `${label} must not stop propagation polling merely because an older Worker version is healthy`,
  );
  assert.match(workflow, /test "\$IDENTITY_MATCHED" = true/, `${label} must fail closed if identity never converges`);
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

test('Cloudflare staging certification waits through version propagation without relaxing exact identity', () => {
  assertBoundedExactIdentityPropagation(stagingWorkflow, 'staging certification');
  assert.match(stagingWorkflow, /h\.release\?\.sha!==expected/);
  assert.match(stagingWorkflow, /Exact release identity: PASS/);
});

test('Cloudflare production smoke test rejects release identity drift after bounded propagation', () => {
  assert.match(deployWorkflow, /TARGET_SHA:\s*\$\{\{ github\.sha \}\}/);
  assertBoundedExactIdentityPropagation(deployWorkflow, 'production release');
  assert.match(deployWorkflow, /h\.release\?\.sha!==expected/);
  assert.match(deployWorkflow, /Exact production release identity and required health: PASS/);
});
