# El Molino Ops Cloudflare Deployment

## Purpose

Cloudflare production deployment must not depend on a ChatGPT connector being available in a particular conversation. The repository itself is the deployment control plane.

## Primary deployment path: Cloudflare Workers Builds

Cloudflare Workers supports a native GitHub integration that can build and deploy a Worker automatically whenever `main` changes. This is the preferred long-term path because it removes dependence on Vercel limits, a local Wrangler login, and ChatGPT connector/session availability.

Repository: `theitaliancouplellc-cpu/El-Molino-Ops`

Worker name: `el-molino-ops`

The Worker name in Cloudflare must match the `name` in `wrangler.jsonc`.

Recommended Cloudflare build configuration:

- Production branch: `main`
- Build command: `npm run cf:build`
- Deploy command: `npx wrangler deploy`
- Node: 22 or compatible current Cloudflare build image

The repository already contains the OpenNext build scripts and Wrangler configuration required for this path.

## Independent fallback: GitHub Actions

`.github/workflows/deploy-cloudflare.yml` performs the same production path from GitHub Actions.

Required GitHub Actions repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The API token should be scoped to the Cloudflare account and include the permissions required to deploy Workers, including Workers Scripts Write. Do not commit credentials to the repository.

The workflow intentionally fails when either credential is missing. A successful preflight is not a successful deployment.

## Release gates before publish

The deployment workflow performs:

1. locked dependency install;
2. TypeScript type check;
3. regression suite;
4. OpenNext Cloudflare build;
5. static asset size validation;
6. Wrangler dry-run and Worker compressed-size validation;
7. authenticated production deployment;
8. deployed `/api/health` verification;
9. production home-page smoke test.

A Cloudflare workflow is considered successful only when the actual authenticated publish and post-deploy smoke tests pass.

## Why two deployment paths exist

Cloudflare Workers Builds is the preferred production control plane. GitHub Actions is the independent fallback. Either can continue operating if ChatGPT cannot expose a Cloudflare connector. This avoids making application availability dependent on a chat session, plugin registry state, or Vercel deployment quota.

## Connector status is not deployment status

A Cloudflare ChatGPT connector can be useful for interactive management, but it is not a production dependency. If a connector is installed but not exposed to the current model/session, production deploys must continue through Workers Builds or GitHub Actions.
