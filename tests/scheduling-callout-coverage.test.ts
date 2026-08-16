import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('callouts never count as working coverage or labor',()=>{
  const engine=readFileSync('lib/scheduling-engine.ts','utf8');
  const page=readFileSync('app/schedule/page.tsx','utf8');
  assert.match(engine,/ACTIVE_STATUSES=new Set\(\['scheduled','covered'\]\)/);
  assert.doesNotMatch(engine,/ACTIVE_STATUSES=new Set\(\[[^\]]*'callout'/);
  assert.match(page,/\['scheduled','covered'\]\.includes\(s\)/);
});
