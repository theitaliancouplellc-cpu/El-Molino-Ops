import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const files=['app/calendar/page.tsx','app/import/page.tsx','app/tasks/page.tsx','app/safety/page.tsx','app/performance/page.tsx'];
const sources=Object.fromEntries(files.map(f=>[f,readFileSync(f,'utf8')]));

test('browser direct-write surfaces do not supply creator/updater audit identities',()=>{
  for(const [file,source] of Object.entries(sources)){
    assert.doesNotMatch(source,/created_by\s*:\s*u\.user/,file);
    assert.doesNotMatch(source,/updated_by\s*:\s*u\.user/,file);
  }
});

test('direct-write features remain wired after audit cleanup',()=>{
  assert.match(sources['app/calendar/page.tsx'],/from\('calendar_events'\)\.insert/);
  assert.match(sources['app/import/page.tsx'],/from\('import_jobs'\)\.insert/);
  assert.match(sources['app/tasks/page.tsx'],/from\('tasks'\)\.insert/);
  assert.match(sources['app/safety/page.tsx'],/from\('food_safety_temperature_points'\)\.insert/);
  assert.match(sources['app/performance/page.tsx'],/from\('restaurant_daily_performance'\)\.upsert/);
});
