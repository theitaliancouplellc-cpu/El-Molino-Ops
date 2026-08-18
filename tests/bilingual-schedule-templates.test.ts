import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=fs.readFileSync('app/schedule/templates/page.tsx','utf8');

test('copy and templates workspace is bilingual',()=>{
  assert.match(source,/useI18n/);
  for(const marker of ['Copiar y Plantillas','Copiar otra semana','Guardar esta semana como plantilla','Aplicar plantilla guardada','Repetir \/ duplicar un turno','Plantillas guardadas'])assert.ok(source.includes(marker),`missing Spanish marker: ${marker}`);
});

test('template localization preserves copy save apply and repeat contracts',()=>{
  for(const rpc of ['ensure_schedule_period','copy_schedule_period','save_schedule_period_as_template','apply_schedule_template','duplicate_schedule_shift'])assert.ok(source.includes(`'${rpc}'`),`missing RPC: ${rpc}`);
  for(const value of ['p_source_period_id: sourcePeriod','p_target_period_id: period.id','p_expected_revision: period.revision','p_include_assignments: templateForm.include_assignments','p_mode: applyMode','p_target_dates: repeatDates','p_copy_assignment: repeatAssignment'])assert.ok(source.includes(value),`missing workflow contract: ${value}`);
  assert.match(source,/applyMode === 'replace'/);
});
