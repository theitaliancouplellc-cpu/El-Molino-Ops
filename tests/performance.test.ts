import test from 'node:test';
import assert from 'node:assert/strict';
import { averageCheck, laborPercent, mapPerformanceCsv, parseBusinessDate, parseCsv, percentChange, salesPerLaborHour } from '../lib/performance';

test('CSV parser handles quoted commas and escaped quotes',()=>{
  const rows=parseCsv('Date,Notes,Net Sales\n8/14/2026,"Busy, but smooth",$6,100\n'.replace('$6,100','"$6,100"'));
  assert.equal(rows[1][1],'Busy, but smooth');
  assert.equal(rows[1][2],'$6,100');
});

test('Toast-style sales export maps supported aliases',()=>{
  const csv='Business Date,Gross Sales,Net Sales,Food Sales,Beverage Sales,Discounts,Comps,Voids,Refunds,Guests\n08/13/2026,"$6,500.00","$6,100.00","$5,100.00","$1,000.00","$150.00","$100.00","$75.00","$25.00",220';
  const result=mapPerformanceCsv(csv);
  assert.equal(result.records.length,1);
  assert.equal(result.records[0].business_date,'2026-08-13');
  assert.equal(result.records[0].net_sales,6100);
  assert.equal(result.records[0].alcohol_sales,1000);
  assert.equal(result.records[0].guest_count,220);
});

test('labor export can be imported independently',()=>{
  const csv='Date,Total Labor Hours,Labor Dollars,OT Hours,OT Dollars\n2026-08-13,54.5,1280.25,3.5,122.50';
  const result=mapPerformanceCsv(csv);
  assert.deepEqual(result.recognized.sort(),['labor_cost','labor_hours','overtime_cost','overtime_hours'].sort());
  assert.equal(result.records[0].labor_hours,54.5);
});

test('invalid input reports useful warnings instead of inventing data',()=>{
  const result=mapPerformanceCsv('Something,Else\nabc,123');
  assert.equal(result.records.length,0);
  assert.ok(result.warnings.length>0);
});

test('date parsing supports common Toast formats',()=>{
  assert.equal(parseBusinessDate('8/4/2026'),'2026-08-04');
  assert.equal(parseBusinessDate('2026-08-04'),'2026-08-04');
});

test('restaurant KPI calculations are stable',()=>{
  assert.equal(laborPercent(6000,1500),25);
  assert.equal(salesPerLaborHour(6000,60),100);
  assert.equal(averageCheck(6000,200),30);
  assert.equal(percentChange(6600,6000),10);
  assert.equal(laborPercent(0,100),0);
});
