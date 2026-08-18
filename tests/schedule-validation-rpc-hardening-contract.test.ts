import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/schedule_validation_rpc_hardening_v1.sql','utf8');

test('period and department validation require management authority',()=>{
  assert.equal((sql.match(/auth\.uid\(\) is null or public\.current_app_role\(\) not in \('admin','manager'\)/g)||[]).length,2);
});

test('validation still scopes periods to the current location',()=>{
  assert.equal((sql.match(/p\.location_id<>public\.current_location_id\(\)/g)||[]).length,2);
});

test('low-level coverage arithmetic is not directly callable by staff',()=>{
  assert.match(sql,/revoke all on function public\.schedule_minimum_assigned_coverage\(uuid,uuid,timestamptz,timestamptz\) from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.schedule_minimum_assigned_coverage\(uuid,uuid,timestamptz,timestamptz\) to service_role/i);
});

test('staffing coverage configuration is manager-only at the table boundary',()=>{
  assert.match(sql,/create policy schedule_coverage_read[\s\S]*?location_id = public\.current_location_id\(\)[\s\S]*?public\.current_app_role\(\) in \('admin','manager'\)/i);
});
