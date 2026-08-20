import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const read=(path:string)=>{
  assert.ok(existsSync(path),`required release-provenance artifact missing: ${path}`);
  return readFileSync(path,'utf8');
};

const workflow=read('.github/workflows/deploy-cloudflare.yml');
const verifier=read('scripts/verify-main-release-provenance.mjs');

test('production release has read-only GitHub evidence permissions and verifies provenance before executable release work',()=>{
  assert.match(workflow,/permissions:\s*[\s\S]*?contents: read/);
  assert.match(workflow,/permissions:\s*[\s\S]*?actions: read/);
  assert.match(workflow,/permissions:\s*[\s\S]*?pull-requests: read/);
  assert.match(workflow,/Require merged-PR release provenance/);
  assert.match(workflow,/GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(workflow,/node scripts\/verify-main-release-provenance\.mjs/);

  const checkout=workflow.indexOf('Checkout exact main SHA');
  const provenance=workflow.indexOf('Require merged-PR release provenance');
  const immutable=workflow.indexOf('Prove immutable main source');
  const build=workflow.indexOf('Build and test exact main SHA');
  const credentials=workflow.indexOf('Require authenticated Cloudflare credentials');
  const staging=workflow.indexOf('Deploy exact main SHA to release-gate Worker');
  const production=workflow.indexOf('Deploy already-built exact SHA to production Worker');
  assert.ok(checkout>=0);
  assert.ok(provenance>checkout);
  assert.ok(immutable>provenance);
  assert.ok(build>immutable);
  assert.ok(credentials>build);
  assert.ok(staging>credentials);
  assert.ok(production>staging);
});

test('release provenance rejects direct, unsigned, non-merge, fork and mismatched-head main commits',()=>{
  assert.match(verifier,/ref !== 'refs\/heads\/main'/);
  assert.match(verifier,/verification\?\.verified/);
  assert.match(verifier,/committer\?\.login !== 'web-flow'/);
  assert.match(verifier,/commit\.parents\.length !== 2/);
  assert.match(verifier,/const certifiedHead = commit\.parents\[1\]\?\.sha/);
  assert.match(verifier,/commits\/\$\{target\}\/pulls/);
  assert.match(verifier,/pr\?\.merge_commit_sha === target/);
  assert.match(verifier,/pr\?\.base\?\.ref === 'main'/);
  assert.match(verifier,/pr\?\.head\?\.sha === certifiedHead/);
  assert.match(verifier,/pr\?\.head\?\.repo\?\.full_name === repo/);
  assert.match(verifier,/eligible\.length !== 1/);
});

test('release provenance requires latest exact-head success from all three certified PR gates',()=>{
  assert.match(verifier,/file: 'ci\.yml', name: 'El Molino Ops CI'/);
  assert.match(verifier,/file: 'mobile-ci\.yml', name: 'El Molino Ops Mobile CI'/);
  assert.match(verifier,/file: 'cloudflare-staging-certification\.yml', name: 'Cloudflare Staging Certification'/);
  assert.match(verifier,/head_sha: certifiedHead/);
  assert.match(verifier,/event: 'pull_request'/);
  assert.match(verifier,/run\?\.head_sha === certifiedHead/);
  assert.match(verifier,/run\?\.event === 'pull_request'/);
  assert.match(verifier,/run\?\.name === requirement\.name/);
  assert.match(verifier,/item\?\.number === pr\.number/);
  assert.match(verifier,/sort\(\(a, b\) => Number\(b\.id \|\| 0\) - Number\(a\.id \|\| 0\)\)/);
  assert.match(verifier,/latest\.status !== 'completed' \|\| latest\.conclusion !== 'success'/);
  assert.match(verifier,/has no exact-head pull-request run/);
  assert.match(verifier,/latest exact-head run is not successful/);
});

test('missing or indeterminate GitHub evidence fails closed rather than becoming a release approval',()=>{
  assert.match(verifier,/if \(!response\.ok\) fail/);
  assert.match(verifier,/if \(!token\) fail/);
  assert.match(verifier,/if \(!latest\) fail/);
  assert.doesNotMatch(verifier,/conclusion === 'neutral'/);
  assert.doesNotMatch(verifier,/conclusion === 'skipped'/);
  assert.doesNotMatch(verifier,/continue-on-error/);
});
