import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const employee=readFileSync('app/employee/training/page.tsx','utf8');
const legacy=readFileSync('app/training/courses/layout.tsx','utf8');

test('employee training is separated from course administration',()=>{
 assert.match(employee,/training_course_assignments/);
 assert.match(employee,/training_lesson_payload/);
 assert.match(employee,/start_training_lesson/);
 assert.match(employee,/complete_training_lesson/);
 assert.match(employee,/submit_training_quiz/);
 assert.match(employee,/submit_training_task/);
 assert.doesNotMatch(employee,/createCourse/);
 assert.doesNotMatch(employee,/createLesson/);
 assert.doesNotMatch(employee,/assign_training_course/);
 assert.doesNotMatch(employee,/training_quiz_questions/);
 assert.doesNotMatch(employee,/correct_option/);
 assert.match(legacy,/app_role==='employee'/);
 assert.match(legacy,/employee\/training/);
});

test('employee training is own-assignment scoped and urgency-aware',()=>{
 assert.match(employee,/\.eq\('employee_id',setup\.employee_id\)/);
 assert.match(employee,/overdue/);
 assert.match(employee,/due_at/);
 assert.match(employee,/waiting_review/);
 assert.match(employee,/href="\/employee\/team"/);
 assert.match(employee,/href="\/employee\/requests"/);
});
