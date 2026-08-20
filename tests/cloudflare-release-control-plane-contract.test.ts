import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const read=(path:string)=>{
  assert.ok(existsSync(path),`required Cloudflare release artifact missing: ${path}`);
  return readFileSync(path,'utf8');
};

const staging=read('.github/workflows/cloudflare-staging-certification.yml');
const production=read('.github/workflows/deploy-cloudflare.yml');
const wrangler=JSON.parse(read('wrangler.jsonc'));
const contract=read('docs/release/CLOUDFLARE_DEPLOYMENT.md');

test('pull-request Cloudflare certification is exact-SHA, isolated, and fail-closed',()=>{
  assert.match(staging,/github\.event\.pull_request\.head\.sha/);
  assert.match(staging,/pr\.head\?\.sha !== expected/);
  assert.match(staging,/pr\.base\?\.ref !== 'main'/);
  assert.match(staging,/STAGING_WORKER: el-molino-ops-certification/);
  assert.match(staging,/test "\$STAGING_WORKER" != 'el-molino-ops'/);
  assert.match(staging,/Built OpenNext artifact does not contain expected release SHA/);
  assert.match(staging,/x-el-molino-release/);
  assert.match(staging,/wrangler deploy --env certification --name "\$STAGING_WORKER" --dry-run/);
  assert.match(staging,/wrangler deploy --env certification --name "\$STAGING_WORKER" --keep-vars/);
  assert.match(staging,/wrangler tail "\$STAGING_WORKER" --format json --method GET/);
  assert.match(staging,/runtime tail contained failures/);
  assert.match(staging,/Production mutation: NONE/);
  assert.doesNotMatch(staging,/wrangler deploy --name "\$PRODUCTION_WORKER"/);
});

test('PR certification and production release use distinct queue lanes and distinct Workers',()=>{
  assert.match(staging,/group: cloudflare-release-control-plane/);
  assert.match(production,/group: cloudflare-production-release/);
  assert.doesNotMatch(production,/group: cloudflare-release-control-plane/);
  assert.match(staging,/STAGING_WORKER: el-molino-ops-certification/);
  assert.match(production,/STAGING_WORKER: el-molino-ops-release-gate/);
  assert.doesNotMatch(production,/STAGING_WORKER: el-molino-ops-certification/);
  assert.match(staging,/cancel-in-progress: false/);
  assert.match(production,/cancel-in-progress: false/);
});

test('Cloudflare non-production Workers self-reference their own isolated Worker',()=>{
  assert.equal(wrangler.name,'el-molino-ops');
  assert.deepEqual(wrangler.services,[{binding:'WORKER_SELF_REFERENCE',service:'el-molino-ops'}]);
  assert.deepEqual(wrangler.env?.certification?.services,[
    {binding:'WORKER_SELF_REFERENCE',service:'el-molino-ops-certification'},
  ]);
  assert.deepEqual(wrangler.env?.release_gate?.services,[
    {binding:'WORKER_SELF_REFERENCE',service:'el-molino-ops-release-gate'},
  ]);
  assert.notEqual(wrangler.env?.certification?.services?.[0]?.service,wrangler.services?.[0]?.service);
  assert.notEqual(wrangler.env?.release_gate?.services?.[0]?.service,wrangler.services?.[0]?.service);
  assert.notEqual(wrangler.env?.release_gate?.services?.[0]?.service,wrangler.env?.certification?.services?.[0]?.service);
});

test('manual certification cannot certify a SHA that is no longer the open PR head',()=>{
  assert.match(staging,/workflow_dispatch:/);
  assert.match(staging,/target_sha:/);
  assert.match(staging,/pr_number:/);
  assert.match(staging,/PR #\$\{pr\.number\} is not open/);
  assert.match(staging,/PR head mismatch/);
  assert.match(staging,/Fork PRs are not eligible/);
});

test('production Cloudflare release gates the exact main SHA on its dedicated Worker before production',()=>{
  assert.match(production,/test "\$GITHUB_REF" = 'refs\/heads\/main'/);
  assert.match(production,/TARGET_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(production,/EL_MOLINO_RELEASE_SHA="\$TARGET_SHA" RELEASE_SHA="\$TARGET_SHA" npm run cf:build/);
  assert.match(production,/wrangler deploy --env release_gate --name "\$STAGING_WORKER" --dry-run/);
  assert.match(production,/wrangler deploy --env release_gate --name "\$STAGING_WORKER" --keep-vars/);

  const stagingDeploy=production.indexOf('Deploy exact main SHA to release-gate Worker');
  const stagingGate=production.indexOf('Gate production on exact-main staging health and root runtime');
  const runtimeGate=production.indexOf('Capture exact-main staging runtime-tail evidence');
  const productionDeploy=production.indexOf('Deploy already-built exact SHA to production Worker');
  const productionVerify=production.indexOf('Verify exact production release identity');

  assert.ok(stagingDeploy>=0);
  assert.ok(stagingGate>stagingDeploy);
  assert.ok(runtimeGate>stagingGate);
  assert.ok(productionDeploy>runtimeGate);
  assert.ok(productionVerify>productionDeploy);
  assert.match(production,/production release mismatch/);
  assert.match(production,/production required health check failed/);
  assert.doesNotMatch(production,/wrangler deploy --env release_gate --name "\$PRODUCTION_WORKER"/);
});

test('production runtime-tail probes tolerate propagation delay but remain exact-identity and fail-closed',()=>{
  assert.match(production,/wrangler tail "\$STAGING_WORKER" --env release_gate --format json --method GET/);
  assert.match(production,/kill -0 "\$TAIL_PID"/);
  assert.match(production,/successful_probes=0/);
  assert.match(production,/for i in \{1\.\.8\}/);
  assert.match(production,/for attempt in \{1\.\.10\}/);
  assert.match(production,/audit=release-\$i-\$GITHUB_RUN_ID&release=\$TARGET_SHA&attempt=\$attempt/);
  assert.match(production,/\[ "\$CODE" = 200 \] && \[ "\$BODY_SHA" = "\$TARGET_SHA" \] && \[ "\$HEADER_SHA" = "\$TARGET_SHA" \]/);
  assert.match(production,/test "\$probe_ok" = true/);
  assert.match(production,/test "\$successful_probes" -eq 8/);
  assert.match(production,/runtime-tail gate failed/);
  assert.doesNotMatch(production,/for i in \{1\.\.8\}; do curl -fsS/);
});

test('canonical release documentation preserves single-writer and data-safety caveats',()=>{
  assert.match(contract,/Cloudflare Workers is the canonical web runtime/);
  assert.match(contract,/Only one system may be authoritative for production publication/);
  assert.match(contract,/duplicate-publisher status is an operational verification item/);
  assert.match(contract,/GET-only and non-mutating/);
  assert.match(contract,/fully isolated staging data environment/);
});
