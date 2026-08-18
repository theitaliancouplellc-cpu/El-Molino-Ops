import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/training_unlock_helper_surface_v1.sql','utf8');

test('training unlock primitive is not directly callable by clients',()=>{
  assert.match(sql,/revoke all on function public\.training_lesson_is_unlocked\(uuid,uuid\) from public, anon, authenticated/i);
});

test('user-to-employee identity primitive is not directly callable by clients',()=>{
  assert.match(sql,/revoke all on function public\.time_clock_employee_id_for_user\(uuid\) from public, anon, authenticated/i);
});

test('service role retains internal helper execution',()=>{
  assert.match(sql,/grant execute on function public\.training_lesson_is_unlocked\(uuid,uuid\) to service_role/i);
  assert.match(sql,/grant execute on function public\.time_clock_employee_id_for_user\(uuid\) to service_role/i);
});
