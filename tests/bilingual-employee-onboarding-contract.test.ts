import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const access=readFileSync('app/employee/access/page.tsx','utf8');
const setup=readFileSync('app/employee/setup/page.tsx','utf8');

test('employee onboarding and access screens are bilingual',()=>{
 for(const source of [access,setup])assert.match(source,/useI18n/);
 for(const phrase of ['Acceso a la Cuenta','Qué significa esto'])assert.match(access,new RegExp(phrase));
 for(const phrase of ['Configura tu perfil de personal','Cuéntanos quién eres','Qué sucede después'])assert.match(setup,new RegExp(phrase));
 assert.match(access,/toLocaleString\(localeCode\)/);
});

test('employee access preserves authoritative employment status checks',()=>{
 for(const raw of ["'approved'","'active'","'suspended'"])assert.match(access,new RegExp(raw));
 assert.match(access,/employee_self_setup_status/);
 assert.match(access,/setup\?\.status_reason/);
});

test('employee setup preserves raw identity role data and RPC arguments',()=>{
 assert.match(setup,/submit_employee_self_setup/);
 for(const arg of ['p_first_name:firstName.trim\(\)','p_last_name:lastName.trim\(\)','p_phone:phone.trim\(\)','p_role_ids:selected'])assert.match(setup,new RegExp(arg));
 for(const authored of ['setup.manager_note','r.name'])assert.match(setup,new RegExp(authored.replaceAll('.','\\.')));
 for(const raw of ["'pending'","'changes_requested'","'rejected'","'approved'"])assert.match(setup,new RegExp(raw));
});
