# El Molino Ops Cloudflare Release Contract

## Canonical runtime

Cloudflare Workers is the canonical web runtime for El Molino Ops. The repository and GitHub Actions are the release control plane. Vercel may remain useful for compatibility or fallback work, but Vercel preview availability is not a certification requirement once this contract is merged and proven on `main`.

Production Worker: `el-molino-ops`

Pull-request certification Worker: `el-molino-ops-certification`

Production release-gate Worker: `el-molino-ops-release-gate`

Repository: `theitaliancouplellc-cpu/El-Molino-Ops`

## Pull-request certification

`.github/workflows/cloudflare-staging-certification.yml` certifies one immutable pull-request head SHA at a time.

The workflow:

1. verifies the PR is open, targets `main`, is from this repository, and still has the exact requested head SHA;
2. checks out that SHA directly rather than relying on a mutable branch name;
3. installs locked dependencies, type-checks, runs the regression suite through the OpenNext build, and confirms the SHA is baked into the artifact;
4. enforces the Cloudflare Free compressed Worker limit and the static-asset size limit used by production;
5. deploys only to `el-molino-ops-certification`;
6. requires `/api/health` HTTP 200, exact body SHA, exact `x-el-molino-release` header, and all required health checks green;
7. requires the root application runtime smoke test;
8. captures real Cloudflare runtime-tail evidence from synthetic GET probes and fails on runtime exceptions or non-success outcomes;
9. preserves only sanitized certification evidence as a GitHub artifact.

The workflow also supports `workflow_dispatch` with `target_sha` and `pr_number`. Manual dispatch still verifies that the open PR head equals the supplied SHA, so an old pull request can be certified without rebasing or changing its product commit.

Fork pull requests are intentionally not eligible for the repository-secret staging deployment lane.

## Exact-main production release

`.github/workflows/deploy-cloudflare.yml` is the canonical production publisher.

A production release is permitted only from `main`. For the exact `github.sha` it:

1. checks out the immutable main SHA;
2. installs locked dependencies, type-checks, runs the regression suite, and builds OpenNext with the release SHA baked into the artifact;
3. validates package limits using the dedicated `release_gate` Wrangler environment;
4. deploys that exact already-built artifact to `el-molino-ops-release-gate`;
5. requires exact-main release-gate health, release identity, root runtime, and Cloudflare runtime-tail evidence;
6. only after the release gate passes, deploys the same built SHA to `el-molino-ops`;
7. requires production `/api/health` HTTP 200, exact body/header release identity, all required health checks green, and the production root smoke test;
8. records the final release-gate and production deployment identities.

The release-gate Worker has its own `WORKER_SELF_REFERENCE` binding and is not the pull-request certification Worker. A successful build without an authenticated publish is not a successful release. A successful release-gate deploy does not permit production if any exact-SHA or runtime gate fails.

## Durable production evidence

`.github/workflows/cloudflare-production-evidence.yml` is an observational verifier downstream of the canonical production publisher. It is not permitted to deploy or mutate a Worker.

When the canonical `Deploy El Molino Ops to Cloudflare` workflow completes, the evidence workflow binds to that workflow run's immutable `head_sha` and requires its `head_branch` to be `main`. A failed canonical publisher is recorded as a failed production status and cannot be promoted to success by the downstream workflow-run path.

For a successful canonical publisher, the evidence workflow independently re-probes the public production Worker and requires all of the following for the exact SHA:

- HTTP 200 from `/api/health`;
- response `release.sha` equal to the target SHA;
- `x-el-molino-release` header equal to the target SHA;
- every required health check green;
- root application runtime smoke success.

The result is written back to the exact commit under the stable GitHub commit-status context `Cloudflare Production`. The workflow also uploads a sanitized artifact named `cloudflare-production-evidence-<sha>` containing the observed release identity and health result without Cloudflare credentials or account secrets. If verifier infrastructure fails after a valid release subject is established, the workflow still creates sanitized failure evidence and fails closed.

Manual re-verification is allowed only for the exact current `main` SHA. It is a verification path, not a publication path, and cannot be used to certify an arbitrary historical or non-main commit.

This durable evidence surface exists so later audits can distinguish “the code merged” from “the exact merged SHA was observed healthy in canonical production” without relying on Cloudflare dashboard access or a transient Actions screen.

## Credentials

Required GitHub Actions repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The API token must be scoped to the Cloudflare account with only the permissions required to deploy and inspect/tail these Workers. Credentials must never be committed to the repository.

## Serialization and queue isolation

Pull-request certification and production publication intentionally do **not** share one GitHub Actions concurrency group.

PR certification retains its certification lane and writes only to `el-molino-ops-certification`. The canonical production publisher uses `cloudflare-production-release` and writes its pre-production proof only to `el-molino-ops-release-gate` before publishing `el-molino-ops`. The two non-production Workers have distinct self-reference bindings.

This separation is required because GitHub concurrency permits at most one running and one pending member per group; a newer queued run can replace an older pending run even when `cancel-in-progress: false`. A shared PR/production queue therefore allowed a pull-request certification run to displace a pending main release before any production job started. Dedicated Workers and queue lanes remove both the pending-run cancellation failure mode and the shared-Worker race.

The downstream production-evidence verifier has a separate per-SHA concurrency key because it never publishes a Worker. It may observe the finished canonical release, but it cannot race the publisher as a second writer.

## Rollback

Rollback is an explicit operational action, not an automatic response to an ambiguous deployment result. The repository rollback runbook remains authoritative for production incidents.

The replacement audit on 2026-08-19 proved the Cloudflare control plane can build, deploy, identify, tail, roll back, and restore an exact release SHA on an isolated Worker. That audit was intentionally separate from product work. The permanent workflows keep the ordinary PR and release path smaller: every release proves exact-SHA release-gate and production identity; rollback drills remain deliberate exercises rather than destructive actions on every change.

## Duplicate publisher rule

Only one system may be authoritative for production publication. If Cloudflare Workers Builds or another external Git integration is configured to auto-deploy `main` directly to `el-molino-ops`, it must not be treated as a second independent production publisher. Disable that automatic production publication, or configure it so it cannot race the canonical GitHub Actions release workflow, before claiming the release control plane is fully single-writer.

This repository cannot prove a Cloudflare dashboard setting by source code alone, so duplicate-publisher status is an operational verification item.

## Data safety of certification probes

The certification and release-gate Workers currently use the production Supabase public configuration because that is the runtime configuration already proven by the application. Automated Cloudflare certification probes are intentionally GET-only and non-mutating. They do not perform authenticated staff actions, payroll/financial mutations, scheduling changes, or database migrations.

Authenticated product behavior remains covered by the application's CI/browser/database security gates until a fully isolated staging data environment is deliberately provisioned.
