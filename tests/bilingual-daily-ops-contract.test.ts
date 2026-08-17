import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const myWork=readFileSync('app/my-work/page.tsx','utf8');
const tasks=readFileSync('app/tasks/page.tsx','utf8');
const cash=readFileSync('app/cash/page.tsx','utf8');

test('daily operations expose Spanish system UI with locale-aware presentation',()=>{
 for(const source of [myWork,tasks,cash])assert.match(source,/useI18n/);
 for(const phrase of ['Mi Trabajo','Listas de hoy','Agregar foto'])assert.match(myWork,new RegExp(phrase));
 for(const phrase of ['Centro de Tareas','Crear asignación','Agregar dependencia','Sin asignaciones coincidentes'])assert.match(tasks,new RegExp(phrase));
 for(const phrase of ['Controles de Efectivo','Conciliar turno','Esperando verificación'])assert.match(cash,new RegExp(phrase));
 assert.match(myWork,/toLocaleString\(localeCode\)/);
 assert.match(tasks,/toLocaleString\(localeCode\)/);
 assert.match(cash,/Intl\.NumberFormat\(localeCode/);
});

test('daily ops preserves authored task, checklist, comment, employee, role and manager-note content',()=>{
 for(const raw of ['t.title','template?.title','i.checklist_template_items?.label'])assert.match(myWork,new RegExp(raw.replaceAll('.','\\.').replaceAll('?','\\?')));
 for(const raw of ['t.title','cm.body','x.full_name','x.name'])assert.match(tasks,new RegExp(raw.replaceAll('.','\\.')));
 assert.match(cash,/p_notes:form\.notes\.trim\(\)/);
});

test('daily ops preserves authoritative raw statuses recurrence and RPC values',()=>{
 for(const raw of ["'done'","'open'","'cancelled'"])assert.match(myWork+tasks,new RegExp(raw));
 for(const raw of ['FREQ=DAILY','FREQ=WEEKLY','FREQ=MONTHLY'])assert.match(tasks,new RegExp(raw));
 for(const raw of ["shift:'closing'","value=\"opening\"","value=\"mid\"","value=\"closing\"","r.status==='submitted'"])assert.match(cash,new RegExp(raw));
 for(const rpc of ['submit_cash_control_session','verify_cash_control_session'])assert.match(cash,new RegExp(rpc));
 assert.match(tasks,/priority,assigned_employee_id/);
 assert.match(tasks,/entity_type:'task'/);
 assert.match(myWork,/kind:'photo'/);
});