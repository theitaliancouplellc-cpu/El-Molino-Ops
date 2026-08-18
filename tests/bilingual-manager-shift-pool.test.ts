import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=fs.readFileSync('app/schedule/pool/page.tsx','utf8');

test('manager Shift Pool is bilingual and locale-aware',()=>{
  assert.match(source,/useI18n/);
  for(const marker of ['Banco de Turnos','Disponibles','Solicitudes gerenciales','Mi Banco de Turnos','Solicitudes de Intercambio'])assert.ok(source.includes(marker),`missing Spanish marker: ${marker}`);
  assert.match(source,/toLocaleString\(localeCode/);
  assert.match(source,/statusLabel/);
});

test('manager Shift Pool localization preserves authoritative workflow contracts',()=>{
  for(const rpc of ['staff_shift_pool_shifts','bid_on_shift_pool_offer','withdraw_my_shift_pool_offer','withdraw_my_shift_pool_bid','review_shift_pool_bid','claim_open_shift','review_shift_claim','review_shift_change_request','shift_pool_candidate_warnings'])assert.ok(source.includes(`'${rpc}'`),`missing RPC: ${rpc}`);
  for(const value of ["decision:'approved'|'denied'",'p_decision:decision','p_offer_id:row.offer_id','p_employee_id:row.employee_id',"x.request_type==='swap'", "row.target_response==='accepted'"])assert.ok(source.includes(value),`missing state contract: ${value}`);
  assert.match(source,/\{o\.comment\?` · \$\{o\.comment\}`/);
  assert.match(source,/row\.reason\|\|t\(/);
  assert.match(source,/<span>\{w\.message\}<\/span>/);
});
