import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('production responses carry baseline browser security headers', () => {
  const config = read('next.config.ts');
  for (const required of [
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Strict-Transport-Security",
    "Permissions-Policy",
    "poweredByHeader: false",
  ]) {
    assert.match(config, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('health endpoint exposes release identity and latency without caching', () => {
  const health = read('app/api/health/route.ts');
  assert.match(health, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(health, /GITHUB_SHA/);
  assert.match(health, /release,/);
  assert.match(health, /latency_ms/);
  assert.match(health, /x-el-molino-release/);
  assert.match(health, /cache-control': 'no-store/);
});

test('catastrophic application failures have a recovery boundary', () => {
  const boundary = read('app/global-error.tsx');
  assert.match(boundary, /'use client'/);
  assert.match(boundary, /Reload application/);
  assert.match(boundary, /onClick=\{reset\}/);
});
