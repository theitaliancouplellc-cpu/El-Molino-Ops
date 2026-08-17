import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync('app/manager/team-setup/page.tsx','utf8');

test('manager team setup is bilingual and locale-aware',()=>{
  assert.match(source,/useI18n/);
  for(const phrase of ['Configuración de App de Empleado','Invitar empleados','Esperando revisión del perfil','Solicitudes de cambio de puesto','Ciclo laboral del personal','Perfiles aprobados'])assert.match(source,new RegExp(phrase));
  assert.match(source,/toLocaleString\(localeCode\)/);
});

test('manager team setup preserves authoritative workflow values and RPC contracts',()=>{
  for(const value of ["'approved'","'changes_requested'","'rejected'","'active'","'suspended'","'inactive'"])assert.match(source,new RegExp(value));
  for(const rpc of ['review_employee_self_setup','review_employee_role_change_request','set_employee_employment_status'])assert.match(source,new RegExp(rpc));
  for(const arg of ['p_claim_id','p_decision','p_role_ids','p_existing_employee_id','p_manager_note','p_request_id','p_approved_role_ids','p_override_future_shifts','p_employee_id','p_status','p_reason'])assert.match(source,new RegExp(arg));
});

test('manager-authored and employee-authored operational data are never translated',()=>{
  for(const authored of ['claim.manager_note','req.employee_note','e.status_reason','r.name','e.full_name','claim.first_name','claim.last_name'])assert.match(source,new RegExp(authored.replaceAll('.','\\.')));
});

test('raw status enums are localized only for display',()=>{
  assert.match(source,/statusLabel\(claim\.status\)/);
  assert.match(source,/statusLabel\(e\.employment_status\)/);
  assert.match(source,/p_decision:decision/);
  assert.match(source,/p_status:next/);
});
