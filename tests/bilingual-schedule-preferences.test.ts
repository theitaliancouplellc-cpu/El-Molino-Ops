import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../app/schedule/preferences/page.tsx',import.meta.url),'utf8');

test('scheduling preferences localization stays presentation-only',()=>{
  assert.match(page,/useI18n/);
  assert.match(page,/locale==='es'/);
  assert.match(page,/set_my_schedule_preferences/);
  assert.match(page,/p_preferred_days_off:days/);
  assert.match(page,/p_preferred_start:useWindow\?start:null/);
  assert.match(page,/p_preferred_end:useWindow\?end:null/);
  assert.match(page,/const DAYS=\[\{d:1,k:'monday'\}/);
  assert.match(page,/type="time" value=\{start\}/);
  assert.match(page,/type="time" value=\{end\}/);
});
