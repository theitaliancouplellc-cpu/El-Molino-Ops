import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=fs.readFileSync('app/schedule/requests/page.tsx','utf8');

test('availability and time-off workspace is bilingual and locale-aware',()=>{
 assert.match(source,/useI18n/);
 assert.match(source,/Disponibilidad y Tiempo Libre/);
 assert.match(source,/Cambiar disponibilidad recurrente/);
 assert.match(source,/Solicitar tiempo libre/);
 assert.match(source,/Cola de aprobación gerencial/);
 assert.match(source,/Fechas bloqueadas para tiempo libre/);
 assert.match(source,/toLocaleDateString\(localeCode/);
 assert.match(source,/toLocaleTimeString\(localeCode/);
});

test('request localization preserves authoritative workflow values and authored notes',()=>{
 for(const rpc of ['submit_availability_request','cancel_my_availability_request','review_availability_request','review_time_off_request'])assert.ok(source.includes(`'${rpc}'`),`missing RPC: ${rpc}`);
 for(const value of ['p_rows:rows','p_effective_from:availabilityKind===\'temporary\'?effectiveFrom:null','p_effective_to:availabilityKind===\'temporary\'?effectiveTo:null','p_reason:availReason.trim()||null','p_manager_note:note','reason:off.reason.trim()||null','category:off.category','starts_at_time:off.full_day?null:off.starts_at_time','ends_at_time:off.full_day?null:off.ends_at_time','reason:block.reason.trim()||null'])assert.ok(source.includes(value),`missing workflow value: ${value}`);
 for(const authored of ['x.reason||','x.reason?` · ${x.reason}`','x.role_ids.map(roleName)','employeeName(x.employee_id)','r.name'])assert.ok(source.includes(authored),`missing authored display: ${authored}`);
 for(const raw of ["status:'pending'","update({status:'cancelled'})","decision:'approved'|'denied'","category:'unpaid' as 'unpaid'|'paid'|'paid_sick'"])assert.ok(source.includes(raw),`missing raw state: ${raw}`);
});
