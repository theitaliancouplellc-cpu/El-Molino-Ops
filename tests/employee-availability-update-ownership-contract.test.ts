import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/employee_availability_update_hardening_v1.sql','utf8');

test('availability update checks ownership before and after mutation',()=>{
  assert.match(sql,/create policy employee_availability_update[\s\S]*?for update[\s\S]*?using \([\s\S]*?e\.id = employee_availability\.employee_id[\s\S]*?e\.user_id = auth\.uid\(\)[\s\S]*?with check \([\s\S]*?e\.id = employee_availability\.employee_id[\s\S]*?e\.user_id = auth\.uid\(\)/i);
});

test('management keeps same-location update authority',()=>{
  assert.equal((sql.match(/current_app_role\(\) in \('admin','manager'\)/g)||[]).length,2);
  assert.equal((sql.match(/location_id = public\.current_location_id\(\)/g)||[]).length,2);
});
