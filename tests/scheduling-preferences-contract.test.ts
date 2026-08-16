import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('employee preferences use the narrow server RPC and stay discoverable',()=>{
  const page=readFileSync('app/schedule/preferences/page.tsx','utf8');
  const tools=readFileSync('app/tools/page.tsx','utf8');
  assert.match(page,/rpc\('set_my_schedule_preferences'/);
  assert.doesNotMatch(page,/employee_schedule_profiles'\)\.update/);
  assert.match(page,/soft preferences/i);
  assert.match(tools,/\/schedule\/preferences/);
});
