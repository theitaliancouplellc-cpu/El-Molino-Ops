import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProviderFailure, configuredFreeProviders } from '../lib/free-ai-router.ts';

test('429 becomes short quota cooldown', () => {
  const r = classifyProviderFailure(429, 'rate limit exceeded', 2500);
  assert.equal(r.reason, 'quota_or_rate_limit');
  assert.equal(r.cooldownMs, 2500);
});

test('billing and exhausted credit are treated as free-quota exhaustion', () => {
  assert.equal(classifyProviderFailure(402, 'payment required').reason, 'free_quota_exhausted');
  assert.equal(classifyProviderFailure(400, 'insufficient credit').reason, 'free_quota_exhausted');
});

test('bad credentials receive a long cooldown so router moves on', () => {
  const r = classifyProviderFailure(401, 'invalid api key');
  assert.equal(r.reason, 'invalid_credentials');
  assert.ok(r.cooldownMs >= 30 * 60_000);
});

test('server failures are retryable through another lane', () => {
  const r = classifyProviderFailure(503, 'upstream unavailable');
  assert.equal(r.reason, 'provider_error');
  assert.ok(r.cooldownMs <= 60_000);
});

test('provider config never exposes secret values', () => {
  const result = configuredFreeProviders();
  for (const value of Object.values(result)) assert.equal(typeof value, 'boolean');
});
