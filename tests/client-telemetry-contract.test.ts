import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildClientErrorTelemetry,
  classifyClientError,
  sanitizeErrorDigest,
  sanitizeTelemetryRoute,
} from '../lib/client-telemetry';

test('classifies raw client errors without preserving their contents', () => {
  assert.equal(classifyClientError(new Error('JWT expired for secret token')), 'auth_session');
  assert.equal(classifyClientError(new Error('permission denied for relation')), 'authorization');
  assert.equal(classifyClientError(new Error('duplicate key violates unique constraint')), 'conflict');
  assert.equal(classifyClientError(new Error('foreign key constraint failed')), 'data_integrity');
  assert.equal(classifyClientError(new Error('invalid input syntax')), 'validation');
  assert.equal(classifyClientError(new Error('Failed to fetch')), 'network');
  assert.equal(classifyClientError(new Error('Unexpected rendering problem')), 'application');
});

test('sanitizes route identifiers, query strings, fragments, and length', () => {
  assert.equal(sanitizeTelemetryRoute('/employee/schedule?token=secret#frag'), '/employee/schedule');
  assert.equal(sanitizeTelemetryRoute('/ops-record/12345'), '/ops-record/:id');
  assert.equal(
    sanitizeTelemetryRoute('/ops-record/550e8400-e29b-41d4-a716-446655440000'),
    '/ops-record/:id',
  );
  assert.equal(
    sanitizeTelemetryRoute('/resource/anextremelylongidentifierthatshouldneverbeusedasrawtelemetry'),
    '/resource/:id',
  );
  assert.ok(sanitizeTelemetryRoute(`/${'a'.repeat(500)}`).length <= 160);
});

test('rejects unsafe error digests', () => {
  assert.equal(sanitizeErrorDigest('safe_digest-123'), 'safe_digest-123');
  assert.equal(sanitizeErrorDigest('contains email@example.com'), null);
  assert.equal(sanitizeErrorDigest('x'.repeat(81)), null);
});

test('client error payload is bounded and contains no raw error material', () => {
  const raw = 'JWT expired for david@example.com with token secret-token-value';
  const payload = buildClientErrorTelemetry(new Error(raw), '/employee/123?authorization=secret', {
    digest: 'digest_123',
    correlationId: '12345678-safe-correlation',
    online: true,
    visibilityState: 'visible',
  });
  const serialized = JSON.stringify(payload);

  assert.equal(payload.event_type, 'client_error');
  assert.equal(payload.route, '/employee/:id');
  assert.equal(payload.message, 'auth_session');
  assert.equal(payload.metadata.category, 'auth_session');
  assert.equal(payload.metadata.digest, 'digest_123');
  assert.equal(payload.metadata.correlation_id, '12345678-safe-correlation');
  assert.doesNotMatch(serialized, /david@example\.com|secret-token-value|authorization=secret|userAgent|stack/i);
  assert.doesNotMatch(serialized, new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('error boundary uses privacy-safe telemetry helper instead of raw browser/error fields', async () => {
  const source = await readFile(new URL('../app/error.tsx', import.meta.url), 'utf8');
  assert.match(source, /buildClientErrorTelemetry/);
  assert.doesNotMatch(source, /message:\s*error\.message/);
  assert.doesNotMatch(source, /navigator\.userAgent/);
  assert.doesNotMatch(source, /error\.stack/);
});
