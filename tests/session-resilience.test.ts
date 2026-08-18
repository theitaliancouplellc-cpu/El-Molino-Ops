import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { refreshSessionSingleFlight, sessionRefreshDelay, shouldRefreshSession } from '../lib/session-resilience';

test('near-expiry sessions refresh while healthy sessions are scheduled', () => {
  const now = 1_700_000_000_000;
  assert.equal(shouldRefreshSession((now + 60_000) / 1000, now), true);
  assert.equal(shouldRefreshSession((now + 10 * 60_000) / 1000, now), false);
  assert.equal(sessionRefreshDelay((now + 10 * 60_000) / 1000, now), 5 * 60_000);
  assert.equal(sessionRefreshDelay(null, now), null);
});

test('concurrent recovery requests share one refresh operation', async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const refresh = async () => { calls += 1; await gate; return { ok: true }; };
  const first = refreshSessionSingleFlight(refresh);
  const second = refreshSessionSingleFlight(refresh);
  assert.equal(first, second);
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await first, { ok: true });
});

test('global session controller covers wakeups, offline state, expiry, and bilingual recovery', async () => {
  const source = await readFile(new URL('../app/session-resilience.tsx', import.meta.url), 'utf8');
  const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  const sanitizer = await readFile(new URL('../app/error-sanitizer.tsx', import.meta.url), 'utf8');
  assert.match(source, /visibilitychange/);
  assert.match(source, /addEventListener\('online'/);
  assert.match(source, /addEventListener\('offline'/);
  assert.match(source, /SIGNED_OUT/);
  assert.match(source, /Volver a intentar/);
  assert.match(source, /Try again/);
  assert.match(layout, /<SessionResilience/);
  assert.match(sanitizer, /SESSION_REFRESH_REQUEST_EVENT/);
  assert.doesNotMatch(sanitizer, /auth\.refreshSession/);
});
