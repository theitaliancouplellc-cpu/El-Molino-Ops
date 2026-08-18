import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=fs.readFileSync('app/schedule/optimizer/page.tsx','utf8');

test('schedule optimizer is bilingual and locale-aware',()=>{
  assert.match(source,/useI18n/);
  for(const marker of ['Optimizador de Horarios','Estrategia de optimización','Pronóstico de ventas','Cobertura sensible a la demanda','Generar borrador optimizado'])assert.ok(source.includes(marker),`missing Spanish marker: ${marker}`);
  assert.match(source,/money\(totalForecast,localeCode\)/);
  assert.match(source,/const days=locale===\'es\'/);
});

test('optimizer localization preserves deterministic safety and persistence contracts',()=>{
  for(const fn of ['generateSchedule(input())','suggestForecastWeek(history,weekStart)','projectedLaborHours(b.projected_sales'])assert.ok(source.includes(fn),`missing optimizer contract: ${fn}`);
  for(const rpc of ['ensure_schedule_period','apply_schedule_generation','copy_schedule_period'])assert.ok(source.includes(`'${rpc}'`),`missing RPC: ${rpc}`);
  for(const value of ['p_expected_revision:period.revision','p_shifts:preview.shifts','p_client_issues:preview.issues','p_copy_assignments:copyAssignments'])assert.ok(source.includes(value),`missing safety contract: ${value}`);
  assert.doesNotMatch(source,/Math\.random/);
});
