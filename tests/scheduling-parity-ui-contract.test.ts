import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const s=readFileSync('app/schedule/page.tsx','utf8'),settings=readFileSync('app/schedule/settings/page.tsx','utf8');
test('schedule links all parity workspaces',()=>{for(const path of ['/schedule/pool','/schedule/requests','/schedule/views','/schedule/feedback','/schedule/warnings','/schedule/breaks','/schedule/publish','/schedule/settings'])assert.ok(s.includes(path),path)});
test('schedule exposes skill levels partial offers and scheduled breaks',()=>{assert.match(s,/set_employee_role_skill/);assert.match(s,/Offer Part/);assert.match(s,/scheduledBreaks/);assert.match(settings,/shift_pool_allow_partial/)});
