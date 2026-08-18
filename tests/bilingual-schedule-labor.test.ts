import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=fs.readFileSync('app/schedule/labor/page.tsx','utf8');

test('labor budget is bilingual with locale-aware financial presentation',()=>{
 assert.match(source,/useI18n/);
 assert.match(source,/Presupuesto Laboral/);
 assert.match(source,/Objetivos semanales/);
 assert.match(source,/Resumen semanal/);
 assert.match(source,/Ventas y trabajo diarios/);
 assert.match(source,/Las horas recomendadas son deterministas/);
 assert.match(source,/toLocaleString\(localeCode/);
});

test('labor localization preserves financial report and forecast contracts',()=>{
 for(const rpc of ['ensure_schedule_period','schedule_labor_budget_report'])assert.ok(source.includes(`'${rpc}'`),`missing RPC: ${rpc}`);
 for(const value of ['labor_percent_target:lp','sales_per_labor_hour_target:splh','weekly_labor_cost_target:weekly','business_date:date','projected_sales:num(value)',"source:'manual'",'confidence:100','projected/splhTarget'])assert.ok(source.includes(value),`missing financial contract: ${value}`);
 for(const field of ['scheduled_paid_hours','base_labor_cost','overtime_hours','overtime_premium','scheduled_labor_cost','labor_percent','sales_per_labor_hour'])assert.ok(source.includes(field),`missing report field: ${field}`);
 assert.doesNotMatch(source,/Math\.random/);
});
