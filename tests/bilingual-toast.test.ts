import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../app/toast/page.tsx',import.meta.url),'utf8');

test('Toast localization preserves provider and payroll contracts',()=>{
  assert.match(page,/useI18n/);
  assert.match(page,/locale==='es'/);
  assert.match(page,/fetch\('\/api\/toast\/status'/);
  assert.match(page,/fetch\('\/api\/toast\/sync'/);
  assert.match(page,/map_toast_employee/);
  assert.match(page,/set_time_clock_authoritative_source/);
  assert.match(page,/toast_payroll_summary/);
  assert.match(page,/toast_cash_summary/);
  assert.match(page,/p_source:next/);
  assert.match(page,/businessDate:syncDate/);
});
