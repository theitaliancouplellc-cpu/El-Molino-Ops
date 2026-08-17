import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('app/employee/shift-pool/page.tsx','utf8');

test('Shift Pool is locale aware with Spanish system UI',()=>{
 assert.match(source,/useI18n/);
 for(const phrase of ['Bolsa de Turnos','Flexibilidad de horario','Mi Actividad','Mis Intercambios','Verificación de elegibilidad aprobada'])assert.match(source,new RegExp(phrase));
 assert.match(source,/toLocaleString\(localeCode/);
 assert.match(source,/toLocaleTimeString\(localeCode/);
 assert.match(source,/locale==='es'\?'Navegación del personal':'Staff navigation'/);
});

test('Shift Pool keeps authoritative RPC contracts and raw state values',()=>{
 for(const rpc of ['employee_shift_pool_snapshot','bid_on_shift_pool_offer','claim_open_shift','withdraw_my_shift_pool_offer','withdraw_my_shift_pool_bid','respond_to_my_shift_trade','cancel_my_shift_change_request'])assert.match(source,new RegExp(rpc));
 for(const raw of ["'pending'","'open'","'accepted'","'declined'"])assert.match(source,new RegExp(raw));
 assert.match(source,/p_accept:accept/);
});

test('Shift Pool does not translate authored or backend-provided operational content',()=>{
 for(const authored of ['o.offered_by_name','o.role_name','o.comment','x.role_name','t.requested_by_name','t.target_employee_name','t.reason','w.message'])assert.match(source,new RegExp(authored.replaceAll('.','\\.')));
});

test('raw statuses use display-only localized labels',()=>{
 assert.match(source,/statusLabel\(o\.status\)/);
 assert.match(source,/statusLabel\(b\.status\)/);
 assert.match(source,/statusLabel\(q\.status\)/);
 assert.match(source,/tradeState\(t,s\?\.employee_id\)/);
});