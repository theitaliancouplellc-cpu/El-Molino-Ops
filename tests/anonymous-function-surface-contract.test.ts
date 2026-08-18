import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/anonymous_function_surface_allowlist_v1.sql','utf8');

test('anonymous database execution is reduced to the intentional public allowlist',()=>{
  assert.match(sql,/has_function_privilege\('anon',p\.oid,'EXECUTE'\)/);
  assert.match(sql,/p\.proname not in \([\s\S]*'enforce_el_molino_aal2_request'[\s\S]*'public_job_postings'[\s\S]*'submit_job_application'/);
  assert.match(sql,/revoke execute on function %I\.%I\(%s\) from public, anon/);
  assert.match(sql,/grant execute on function %I\.%I\(%s\) to authenticated, service_role/);
  assert.match(sql,/grant execute on function public\.enforce_el_molino_aal2_request\(\)[\s\S]*to anon, authenticated, service_role/);
  assert.match(sql,/grant execute on function public\.public_job_postings\(\)[\s\S]*to anon, authenticated, service_role/);
  assert.match(sql,/grant execute on function public\.submit_job_application[\s\S]*to anon/);
});
