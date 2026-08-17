import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../app/performance/page.tsx',import.meta.url),'utf8');

test('performance localization preserves financial and import contracts',()=>{
  assert.match(page,/useI18n/);
  assert.match(page,/locale==='es'/);
  assert.match(page,/mapPerformanceCsv/);
  assert.match(page,/source:'manual'/);
  assert.match(page,/source:'toast_csv'/);
  assert.match(page,/onConflict:'location_id,business_date'/);
  assert.match(page,/restaurant_daily_performance/);
  assert.match(page,/restaurant_performance_targets/);
  assert.match(page,/daily_sales_target/);
  assert.match(page,/labor_pct_target/);
  assert.match(page,/sales_per_labor_hour_target/);
});
