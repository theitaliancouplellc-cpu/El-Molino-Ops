import test from 'node:test';
import assert from 'node:assert/strict';
import {projectedLaborHours,robustSameWeekdayForecast,suggestForecastWeek} from '../lib/schedule-forecast';

test('same-weekday forecast ignores other weekdays',()=>{
  const history=[
    {business_date:'2026-08-10',net_sales:6000},
    {business_date:'2026-08-03',net_sales:6200},
    {business_date:'2026-08-11',net_sales:99000},
  ];
  const x=robustSameWeekdayForecast(history,'2026-08-17');
  assert.ok(x);assert.ok(x!.projected_sales>5900&&x!.projected_sales<6300);assert.equal(x!.sample_count,2);
});

test('forecast resists a severe same-weekday outlier when enough history exists',()=>{
  const history=[6000,6100,6050,6150,5900,50000].map((sales,i)=>({business_date:['2026-08-10','2026-08-03','2026-07-27','2026-07-20','2026-07-13','2026-07-06'][i],net_sales:sales}));
  const x=robustSameWeekdayForecast(history,'2026-08-17');
  assert.ok(x);assert.ok(x!.projected_sales<7000);
});

test('no history yields no invented forecast',()=>{assert.equal(robustSameWeekdayForecast([],'2026-08-17'),null)});
test('week suggestions never invent days without matching history',()=>{const xs=suggestForecastWeek([{business_date:'2026-08-10',net_sales:6000}],'2026-08-17');assert.equal(xs.length,1);assert.equal(xs[0].business_date,'2026-08-17')});
test('projected labor hours converts sales target safely',()=>{assert.equal(projectedLaborHours(6000,100),60);assert.equal(projectedLaborHours(6000,null),null);assert.equal(projectedLaborHours(-1,100),null)});
