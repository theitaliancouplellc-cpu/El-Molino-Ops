import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../docs/database/client_event_privacy_hardening_v2.sql', import.meta.url);

test('client event telemetry is append-only and inaccessible to anonymous clients', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all privileges on table public\.client_events from anon/i);
  assert.match(sql, /revoke update, delete on table public\.client_events from authenticated/i);
  assert.match(sql, /grant insert, select on table public\.client_events to authenticated/i);
});

test('database rejects raw sensitive telemetry shapes', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const forbidden of [
    'password',
    'token',
    'authorization',
    'cookie',
    'stack',
    'error_message',
    'user_agent',
    'email',
    'phone',
    'message_body',
    'wage',
    'tip',
  ]) {
    assert.match(sql, new RegExp(forbidden, 'i'));
  }
  assert.match(sql, /char_length\(route\) <= 160/i);
  assert.match(sql, /position\('\?' in route\) = 0/i);
  assert.match(sql, /position\('#' in route\) = 0/i);
  assert.match(sql, /octet_length\(metadata::text\) <= 4096/i);
});

test('client_error database contract only accepts categorized correlation-safe events', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const category of [
    'auth_session',
    'authorization',
    'conflict',
    'data_integrity',
    'validation',
    'network',
    'application',
  ]) {
    assert.match(sql, new RegExp(category));
  }
  assert.match(sql, /metadata ->> 'category' = message/);
  assert.match(sql, /metadata \? 'correlation_id'/);
  assert.match(sql, /char_length\(metadata ->> 'correlation_id'\) between 8 and 80/);
});
