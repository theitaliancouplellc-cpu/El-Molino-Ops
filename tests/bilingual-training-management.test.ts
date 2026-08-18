import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=fs.readFileSync('app/training/page.tsx','utf8');
const courses=fs.readFileSync('app/training/courses/page.tsx','utf8');

test('manager training overview is bilingual and locale-aware',()=>{
 assert.match(source,/useI18n/);
 assert.match(source,/Capacitación y Certificaciones/);
 assert.match(source,/Módulos de capacitación/);
 assert.match(source,/Notas recientes de seguimiento/);
 assert.match(source,/toLocaleDateString\(localeCode\)/);
 assert.match(source,/toLocaleString\(localeCode\)/);
});

test('training localization preserves authored records and authoritative values',()=>{
 for(const value of [
  'title:moduleForm.title.trim().slice(0,200)',
  'data:{content:moduleForm.content.trim().slice(0,12000)}',
  'title:mod.title',
  'module_title:mod.title',
  'title:certForm.name.trim().slice(0,200)',
  'notes:certForm.notes.trim().slice(0,3000)',
  'note:coachForm.note.trim().slice(0,6000)',
  'topic:coachForm.category',
  'priority:coachForm.severity',
 ])assert.ok(source.includes(value),`missing authoritative contract: ${value}`);
 for(const value of ["kind:'training_module'","kind:'training_progress'","kind:'certification'","kind:'system_note'","status:'active'","status:'assigned'","status:'completed'","sensitivity:'private'","sensitivity:'manager'"])assert.ok(source.includes(value),`missing raw state: ${value}`);
 assert.match(source,/<h3>\{r\.title\}<\/h3>/);
 assert.match(source,/<h3>\{c\.title\}<\/h3>/);
 assert.match(source,/<h3>\{c\.title\}<\/h3>/);
 assert.match(source,/detail\(t\('Note','Nota'\),c\.data\?\.note\)/);
});

test('structured training is bilingual without changing learning evidence contracts',()=>{
 assert.match(courses,/useI18n/);
 assert.match(courses,/Capacitación Estructurada/);
 assert.match(courses,/Revisión de tareas/);
 assert.match(courses,/toLocaleDateString\(localeCode\)/);
 assert.match(courses,/toLocaleString\(localeCode\)/);
 for(const rpc of ['assign_training_course','cancel_training_course_assignment','training_lesson_payload','start_training_lesson','complete_training_lesson','submit_training_quiz','submit_training_task','add_training_lesson_comment','review_training_task'])assert.ok(courses.includes(`'${rpc}'`),`missing RPC: ${rpc}`);
 for(const value of ['name:courseForm.name.trim().slice(0,160)','description:courseForm.description.trim().slice(0,5000)||null','title:lessonForm.title.trim().slice(0,160)','content:lessonForm.content.trim().slice(0,20000)||null','prompt:questionForm.prompt.trim().slice(0,5000)','options,correct_option:correct','p_answers:out','p_comment:taskComment.trim()||null','p_body:lessonComment.trim()','p_note:note.trim()||null'])assert.ok(courses.includes(value),`missing authored/evidence contract: ${value}`);
 for(const display of ['payload.lesson.title','payload.lesson.content','q.prompt','String(o)','c.body','activeCourse.description'])assert.ok(courses.includes(display),`authored display missing: ${display}`);
});
