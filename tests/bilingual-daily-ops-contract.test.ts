import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const myWork=readFileSync('app/my-work/page.tsx','utf8');
const tasks=readFileSync('app/tasks/page.tsx','utf8');

test('My Work and Task Center expose Spanish system UI with locale-aware dates',()=>{
 for(const source of [myWork,tasks])assert.match(source,/useI18n/);
 for(const phrase of ['Mi Trabajo','Listas de hoy','Agregar foto'])assert.match(myWork,new RegExp(phrase));
 for(const phrase of ['Centro de Tareas','Crear asignación','Agregar dependencia','Sin asignaciones coincidentes'])assert.match(tasks,new RegExp(phrase));
 assert.match(myWork,/toLocaleString\(localeCode\)/);
 assert.match(tasks,/toLocaleString\(localeCode\)/);
});

test('daily ops preserves authored task, checklist, comment, employee and role content',()=>{
 for(const raw of ['t.title','template?.title','i.checklist_template_items?.label'])assert.match(myWork,new RegExp(raw.replaceAll('.','\\.').replaceAll('?','\\?')));
 for(const raw of ['t.title','cm.body','x.full_name','x.name'])assert.match(tasks,new RegExp(raw.replaceAll('.','\\.')));
});

test('daily ops preserves authoritative raw statuses and recurrence/RPC values',()=>{
 for(const raw of ["'done'","'open'","'cancelled'"])assert.match(myWork+tasks,new RegExp(raw));
 for(const raw of ['FREQ=DAILY','FREQ=WEEKLY','FREQ=MONTHLY'])assert.match(tasks,new RegExp(raw));
 assert.match(tasks,/priority,assigned_employee_id/);
 assert.match(tasks,/entity_type:'task'/);
 assert.match(myWork,/kind:'photo'/);
});
