import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const hardened=fs.readFileSync('docs/database/training_unlock_helper_surface_v1.sql','utf8');
const restore=fs.readFileSync('docs/database/restore_time_clock_identity_authenticated_exec_v1.sql','utf8');

test('training unlock primitive remains unavailable to direct clients',()=>{
  assert.match(hardened,/revoke all on function public\.training_lesson_is_unlocked\(uuid,uuid\) from public, anon, authenticated/i);
  assert.match(hardened,/grant execute on function public\.training_lesson_is_unlocked\(uuid,uuid\) to service_role/i);
});

test('time clock identity helper remains available to authenticated RLS evaluation',()=>{
  assert.match(restore,/grant execute on function public\.time_clock_employee_id_for_user\(uuid\) to authenticated/i);
});

test('time clock identity helper stays closed to anonymous callers',()=>{
  assert.match(restore,/revoke execute on function public\.time_clock_employee_id_for_user\(uuid\) from anon/i);
});
