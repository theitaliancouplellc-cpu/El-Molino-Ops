import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('Training Courses supports reusable lessons, ordered courses and targeted assignment', () => {
  const page = read('app/training/courses/page.tsx');
  assert.match(page, /training_lessons/);
  assert.match(page, /training_courses/);
  assert.match(page, /training_course_lessons/);
  assert.match(page, /training_quiz_questions/);
  assert.match(page, /assign_training_course/);
  assert.match(page, /p_role_ids/);
  assert.match(page, /p_departments/);
  assert.match(page, /p_employee_ids/);
});

test('employee course runner uses safe lesson payload and dedicated completion workflows', () => {
  const page = read('app/training/courses/page.tsx');
  assert.match(page, /training_lesson_payload/);
  assert.match(page, /start_training_lesson/);
  assert.match(page, /complete_training_lesson/);
  assert.match(page, /submit_training_quiz/);
  assert.match(page, /submit_training_task/);
  assert.match(page, /add_training_lesson_comment/);
  assert.doesNotMatch(page, /correct_option[^\n]*payload/);
});

test('manager course workflow includes task approval, retry and assignment cancellation', () => {
  const page = read('app/training/courses/page.tsx');
  assert.match(page, /review_training_task/);
  assert.match(page, /Approve Task/);
  assert.match(page, /Return for Retry/);
  assert.match(page, /cancel_training_course_assignment/);
  assert.match(page, /WAITING REVIEW/);
});

test('Courses are exposed from the existing Training workspace', () => {
  const training = read('app/training/page.tsx');
  assert.match(training, /href="\/training\/courses"/);
  assert.match(training, />Courses</);
});
