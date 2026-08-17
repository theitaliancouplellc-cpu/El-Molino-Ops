import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { POSTHOG_FLAGS, readPosthogBooleanFlag } from '../lib/posthog-public';

test('PostHog flag parser handles v2, object-map, and legacy response shapes', () => {
  assert.equal(readPosthogBooleanFlag({ flags: [{ key: 'ops-ai-enabled', enabled: true }] }, 'ops-ai-enabled'), true);
  assert.equal(readPosthogBooleanFlag({ flags: { 'ops-ai-enabled': { enabled: false } } }, 'ops-ai-enabled'), false);
  assert.equal(readPosthogBooleanFlag({ flags: { 'ops-ai-enabled': 'variant-a' } }, 'ops-ai-enabled'), true);
  assert.equal(readPosthogBooleanFlag({ featureFlags: { 'ops-ai-enabled': true } }, 'ops-ai-enabled'), true);
  assert.equal(readPosthogBooleanFlag({ flags: {} }, 'ops-ai-enabled'), null);
});

test('production PostHog integration is dependency-free and privacy bounded', async () => {
  const source = await readFile(new URL('../lib/posthog-public.ts', import.meta.url), 'utf8');
  const packageJson = await readFile(new URL('../package.json', import.meta.url), 'utf8');

  assert.match(source, /\/flags\?v=2/);
  assert.match(source, /\/i\/v0\/e\//);
  assert.match(source, /\$process_person_profile:\s*false/);
  assert.doesNotMatch(source, /error\.message|error\.stack|userAgent|document\.cookie|localStorage/);
  assert.doesNotMatch(packageJson, /posthog-js|@posthog\/react|@posthog\/next/);
});

test('error telemetry and optional AI are independently kill-switchable', async () => {
  assert.equal(POSTHOG_FLAGS.errorTelemetry, 'posthog-error-telemetry-enabled');
  assert.equal(POSTHOG_FLAGS.opsAI, 'ops-ai-enabled');

  const errorBoundary = await readFile(new URL('../app/error.tsx', import.meta.url), 'utf8');
  const aiBridge = await readFile(new URL('../app/ask-agent-bridge.tsx', import.meta.url), 'utf8');
  assert.match(errorBoundary, /capturePosthogClientError/);
  assert.match(errorBoundary, /buildClientErrorTelemetry/);
  assert.match(aiBridge, /POSTHOG_FLAGS\.opsAI/);
  assert.match(aiBridge, /Core El Molino operations remain available/);
});
