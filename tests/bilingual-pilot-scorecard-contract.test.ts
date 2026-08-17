import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync('app/manager/pilot/page.tsx','utf8');

test('pilot scorecard localizes system UI and dates',()=>{
 assert.match(source,/useI18n/);
 for(const phrase of ['Puertas autoritativas del piloto','Integridad de mutaciones','Participantes y tareas críticas','Defectos del piloto','Disponibilidad general por etapas'])assert.match(source,new RegExp(phrase));
 assert.match(source,/toLocaleDateString\(localeCode\)/);
});

test('pilot scorecard preserves authoritative outcome and rollout values',()=>{
 for(const raw of ["'pass'","'fail'","'confusing'","'not_applicable'","'planned'","'active'","'completed'"])assert.match(source,new RegExp(raw));
 for(const rpc of ['pilot_scorecard_snapshot','pilot_enroll_employee','pilot_record_task_result','pilot_set_participant_active','pilot_report_defect','pilot_resolve_defect','pilot_set_rollout_stage'])assert.match(source,new RegExp(rpc));
 assert.match(source,/p_outcome:outcome/);
 assert.match(source,/p_status:status/);
});

test('authored and authoritative evidence stays untranslated',()=>{
 for(const expression of ['p.employee_name','t.label','d.summary','o.operation','deviceLabel.trim()','summary.trim()'])assert.match(source,new RegExp(expression.replaceAll('.','\\.').replaceAll('()','\\(\\)')));
});

test('display helpers translate labels without rewriting stored values',()=>{
 assert.match(source,/outcomeLabel\[p\.results\[t\.task_key\]\]/);
 assert.match(source,/statusLabel\(d\.status\)/);
 assert.match(source,/categoryLabel\(d\.category\)/);
 assert.match(source,/roleLabel\(p\.cohort_role\)/);
});
