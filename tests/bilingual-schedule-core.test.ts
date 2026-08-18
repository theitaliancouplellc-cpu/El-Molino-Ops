import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=fs.readFileSync('app/schedule/page.tsx','utf8');

test('primary schedule shell and core feedback are bilingual',()=>{
 assert.match(source,/useI18n/);
 assert.match(source,/Cargando motor de programación/);
 assert.match(source,/Programación según cobertura/);
 assert.match(source,/No se pudo validar el horario/);
 assert.match(source,/Horario publicado/);
 assert.match(source,/Herramientas del horario/);
 assert.match(source,/Vista previa automática/);
 assert.match(source,/Horario semanal/);
 assert.match(source,/Mi disponibilidad recurrente/);
 assert.match(source,/Requisitos de cobertura/);
 assert.match(source,/Perfiles y calificaciones de programación/);
 assert.match(source,/Cola de aprobación gerencial/);
 assert.match(source,/toLocaleDateString\(localeCode/);
 assert.match(source,/toLocaleString\(localeCode\)/);
});

test('primary schedule localization preserves engine, RPC, and authored-data contracts',()=>{
 for(const rpc of ['apply_schedule_generation','schedule_period_validation','publish_schedule_period','reopen_schedule_period','submit_my_time_off_request','review_time_off_request','submit_my_shift_change_request','offer_my_shift_to_pool','claim_open_shift','review_shift_claim','set_my_weekly_availability','set_employee_role_skill','apply_standard_foh_staffing_template'])assert.ok(source.includes(`'${rpc}'`),`missing RPC: ${rpc}`);
 for(const value of ['generateSchedule(engineInput())','p_shifts:preview.shifts','p_client_issues:preview.issues','p_metrics:preview.metrics','p_override_reason:override','notes:shiftForm.notes.trim().slice(0,2000)||null','p_reason:offForm.reason.trim().slice(0,2000)||null','p_comment:comment.trim().slice(0,2000)||null',"p_reason:'Employee requested reciprocal shift trade'"])assert.ok(source.includes(value),`missing engine/authored contract: ${value}`);
 assert.match(source,/<h3>\{empName\(s\.employee_id\)\} · \{roleName\(s\.role_id\)\}<\/h3>/);
 assert.match(source,/detail\(t\('Notes','Notas'\),s\.notes\)/);
 assert.match(source,/detail\(t\('Reason','Motivo'\),x\.reason\)/);
 assert.match(source,/\{r\.name\}<\/b>/);
 assert.match(source,/\{e\.full_name\}<\/h3>/);
 assert.match(source,/\{x\.reason&&/);
});
