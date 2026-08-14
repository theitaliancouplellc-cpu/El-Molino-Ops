import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mapPerformanceCsv,parseBusinessDate} from '../lib/performance';
import {businessDateInZone} from '../lib/intermediate-hardening';

test('restaurant business date does not roll to UTC tomorrow during evening service',()=>{
  assert.equal(businessDateInZone(new Date('2026-08-15T00:30:00.000Z')),'2026-08-14');
});
test('Toast compact business dates are accepted and impossible dates are rejected',()=>{
  assert.equal(parseBusinessDate('20260814'),'2026-08-14');
  assert.equal(parseBusinessDate('2026-02-30'),null);
  assert.equal(parseBusinessDate('13/40/2026'),null);
});
test('duplicate business dates are excluded instead of silently overwritten',()=>{
  const r=mapPerformanceCsv('Business Date,Net Sales,Labor Cost\n2026-08-14,1000,200\n2026-08-14,400,90\n');
  assert.equal(r.records.length,0);
  assert.match(r.warnings.join(' '),/duplicate business date/i);
});
test('refund-style magnitude columns preserve a negative export as a positive magnitude',()=>{
  const r=mapPerformanceCsv('Business Date,Net Sales,Refunds\n2026-08-14,1000,-25\n');
  assert.equal(r.records[0]?.refunds,25);
});
test('inventory reorder math never treats uncounted items as zero',()=>{
  const src=fs.readFileSync('app/inventory/page.tsx','utf8');
  assert.match(src,/items\.filter\(i=>qtyMap\.has\(i\.id\)\)/);
  assert.match(src,/create_suggested_purchase_orders/);
});
test('temperature capture uses manager-configured points and atomic checklist RPCs',()=>{
  const src=fs.readFileSync('app/safety/page.tsx','utf8');
  assert.match(src,/food_safety_temperature_points/);
  assert.match(src,/create_checklist_template_with_items/);
  assert.match(src,/start_today_checklist/);
  assert.match(src,/set_checklist_item_completed/);
  assert.doesNotMatch(src,/Minimum acceptable °F[\s\S]*tempForm\.min_f/);
});
test('new restaurant modules use restaurant business dates instead of UTC date slicing',()=>{
  for(const p of ['app/performance/page.tsx','app/inventory/page.tsx','app/safety/page.tsx','app/logbook/page.tsx','app/training/page.tsx','app/cash/page.tsx']){
    const src=fs.readFileSync(p,'utf8');
    assert.match(src,/businessDateInZone/);
    assert.doesNotMatch(src,/const today=\(\)=>new Date\(\)\.toISOString\(\)\.slice\(0,10\)/);
  }
});
test('generic employee operations UI does not advertise manager mutation controls',()=>{
  const src=fs.readFileSync('app/ops/page.tsx','utf8');
  assert.match(src,/<div className="row-actions">\{canManage&&<>/);
});
