import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const evidence = fs.readFileSync('.github/workflows/cloudflare-production-evidence.yml', 'utf8');
const publisher = fs.readFileSync('.github/workflows/deploy-cloudflare.yml', 'utf8');

test('production evidence verifier is downstream of the canonical publisher and cannot deploy', () => {
  assert.match(evidence, /workflow_run:/);
  assert.match(evidence, /workflows: \["Deploy El Molino Ops to Cloudflare"\]/);
  assert.match(evidence, /types: \[completed\]/);
  assert.match(evidence, /statuses: write/);
  assert.doesNotMatch(evidence, /wrangler deploy/);
  assert.doesNotMatch(evidence, /curl[^\n]*-X PUT[^\n]*workers\/subdomain/);
  assert.match(publisher, /name: Deploy El Molino Ops to Cloudflare/);
  assert.match(publisher, /Deploy already-built exact SHA to production Worker/);
});

test('workflow-run and manual evidence both bind to an immutable current-main SHA', () => {
  assert.match(evidence, /WORKFLOW_HEAD_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(evidence, /WORKFLOW_HEAD_BRANCH: \$\{\{ github\.event\.workflow_run\.head_branch \}\}/);
  assert.match(evidence, /test "\$WORKFLOW_HEAD_BRANCH" = 'main'/);
  assert.match(evidence, /MANUAL_TARGET_SHA: \$\{\{ inputs\.target_sha \}\}/);
  assert.match(evidence, /repos\/\$\{GITHUB_REPOSITORY\}\/branches\/main/);
  assert.match(evidence, /test "\$target_sha" = "\$current_main_sha"/);
  assert.match(evidence, /\^\[0-9a-f\]\{40\}\$/);
});

test('exact production evidence requires body SHA, header SHA, required health, and root smoke', () => {
  assert.match(evidence, /for i in \{1\.\.30\}/);
  assert.match(evidence, /release=\$TARGET_SHA&evidence_attempt=\$i/);
  assert.match(evidence, /x-el-molino-release/);
  assert.match(evidence, /body_sha=.*h\.release\?\.sha/);
  assert.match(
    evidence,
    /if \[ "\$code" = '200' \] && \[ "\$body_sha" = "\$TARGET_SHA" \] && \[ "\$header_sha" = "\$TARGET_SHA" \]; then/,
  );
  assert.match(evidence, /h\.checks\?\.filter\(c=>c\.required\)\.every\(c=>c\.ok\)/);
  assert.match(evidence, /grep -q 'El Molino Ops'/);
  assert.match(evidence, /test "\$identity_matched" = true/);
  assert.match(evidence, /test "\$required_checks_ok" = true/);
  assert.match(evidence, /test "\$root_smoke_ok" = true/);
});

test('verifier publishes a stable commit status and sanitized exact-SHA artifact', () => {
  assert.match(evidence, /context:'Cloudflare Production'/);
  assert.match(evidence, /cloudflare-production-evidence-\$\{\{ steps\.subject\.outputs\.target_sha \}\}/);
  assert.match(evidence, /\/tmp\/cloudflare-production-evidence\.json/);
  assert.match(evidence, /retention-days: 90/);
  assert.match(evidence, /release_body_sha/);
  assert.match(evidence, /release_header_sha/);
  assert.match(evidence, /required_health_checks_ok/);
  assert.match(evidence, /root_smoke_ok/);
  assert.doesNotMatch(evidence, /fs\.writeFileSync\([^\n]*CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(evidence, /fs\.writeFileSync\([^\n]*CLOUDFLARE_ACCOUNT_ID/);
});

test('failed canonical publisher cannot be upgraded into a successful production status', () => {
  assert.match(evidence, /source_conclusion" != 'success'/);
  assert.match(evidence, /should_probe=false/);
  assert.match(evidence, /state='failure'/);
  assert.match(evidence, /\[ "\$SHOULD_PROBE" = 'true' \] && \[ "\$VERIFY_OUTCOME" = 'success' \]/);
  assert.match(evidence, /failure_reason:'canonical production publisher did not complete successfully'/);
  assert.match(evidence, /Fail closed when production evidence is not successful/);
});
