import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const manager=readFileSync('app/manager/page.tsx','utf8');

test('manager overview is locale-aware with Spanish command chrome',()=>{
  assert.match(manager,/useI18n/);
  for(const phrase of ['Resumen de gerencia','Personal y pagos','Ejecución del turno','Requiere atención','Centro de mando del restaurante','Gestión rápida','Sin excepciones urgentes'])assert.match(manager,new RegExp(phrase));
  assert.match(manager,/toLocaleTimeString\(localeCode/);
});

test('manager localization preserves authored operational records exactly as stored',()=>{
  assert.match(manager,/\{x\.template\.title\}/);
  assert.match(manager,/\{t\.title\}/);
  assert.match(manager,/\{o\.title\}/);
  assert.match(manager,/safeKindQuery\(o\.kind\)/);
  assert.match(manager,/validPriority\(t\.priority\)/);
  assert.match(manager,/validPriority\(o\.priority\)/);
});

test('manager overview retains authoritative data and navigation contracts',()=>{
  for(const source of ['time_clock_whos_working','time_clock_punches','tip_pool_runs','employee_self_setup_claims','checklist_runs','checklist_templates'])assert.match(manager,new RegExp(source));
  for(const href of ['/manager/team-setup','/time-clock','/tips','/team','/training','/performance','/logbook','/schedule','/inventory','/safety','/maintenance','/incidents','/cash','/vendors','/manager/pilot'])assert.match(manager,new RegExp(href.replaceAll('/','\\/')));
});
