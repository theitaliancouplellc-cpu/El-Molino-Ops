import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=fs.readFileSync('app/schedule/breaks/page.tsx','utf8');

test('scheduled-break workspace is bilingual',()=>{
  assert.match(source,/useI18n/);
  for(const marker of ['Descansos Programados','Regla de descanso','Programar descansos en un turno','Aplicar Horario de Descansos'])assert.ok(source.includes(marker),`missing Spanish marker: ${marker}`);
});

test('break localization preserves rule and shift-break contracts',()=>{
  for(const rpc of ['upsert_schedule_break_rule','suggest_shift_breaks','replace_shift_breaks'])assert.ok(source.includes(`'${rpc}'`),`missing RPC: ${rpc}`);
  for(const value of ['p_duration_minutes','p_minimum_shift_hours','p_enforced','p_role_ids','p_shift_id:selectedShift','p_breaks:payload'])assert.ok(source.includes(value),`missing contract: ${value}`);
  for(const field of ['break_rule_id:x.break_rule_id','starts_at:new Date(x.starts_at).toISOString()','duration_minutes:x.duration_minutes','paid:x.paid'])assert.ok(source.includes(field),`missing payload field: ${field}`);
});
