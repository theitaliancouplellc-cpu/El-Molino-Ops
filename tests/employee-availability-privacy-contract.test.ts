import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/employee_availability_privacy_hardening_v1.sql','utf8');

test('recurring availability is visible only to management or the owning employee',()=>{
  assert.match(sql,/create policy employee_availability_select[\s\S]*?current_app_role\(\) in \('admin','manager'\)[\s\S]*?e\.id = employee_availability\.employee_id[\s\S]*?e\.user_id = auth\.uid\(\)/i);
});

test('temporary availability overrides are visible only to management or the owning employee',()=>{
  assert.match(sql,/create policy employee_availability_overrides_read[\s\S]*?current_app_role\(\) in \('admin','manager'\)[\s\S]*?e\.id = employee_availability_overrides\.employee_id[\s\S]*?e\.user_id = auth\.uid\(\)/i);
});

test('both policies remain location-scoped and exclude deleted employee links',()=>{
  assert.equal((sql.match(/location_id = public\.current_location_id\(\)/g)||[]).length,2);
  assert.equal((sql.match(/e\.deleted_at is null/g)||[]).length,2);
});
