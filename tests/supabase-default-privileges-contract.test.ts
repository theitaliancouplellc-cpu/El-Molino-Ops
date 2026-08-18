import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/api_default_privileges_fail_closed_v1.sql','utf8');

test('future public-schema objects do not auto-expose through Supabase API roles',()=>{
  assert.match(sql,/alter default privileges for role postgres in schema public/);
  assert.match(sql,/revoke select, insert, update, delete on tables from anon, authenticated, service_role/);
  assert.match(sql,/revoke execute on functions from anon, authenticated, service_role/);
  assert.match(sql,/revoke usage, select on sequences from anon, authenticated, service_role/);
  assert.match(sql,/revoke execute on functions from public/);
});
