import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/rls_auth_initplan_optimization_v1.sql','utf8');

const expectedPolicies=[
  'comments_author_manager_update',
  'discussion_messages_author_update',
  'employee_availability_delete',
  'employee_availability_select',
  'employee_availability_update',
  'employee_availability_overrides_read',
  'employee_role_assignments_read',
  'employee_role_change_request_roles_read',
  'employee_role_change_read',
  'schedule_profiles_read',
  'employee_self_setup_claims_read',
  'employee_self_setup_roles_read',
  'employee_shift_reminder_read',
  'employees_location_read',
  'files_manager_update',
  'manager_contact_read',
  'notification_preferences_own_read',
  'onboarding_ack_self_read',
  'onboarding_assignments_self_read',
  'onboarding_comments_self_read',
  'onboarding_documents_assigned_read',
  'onboarding_item_progress_self_read',
  'onboarding_package_items_assigned_read',
  'onboarding_packages_assigned_read',
  'shift_claims_read',
  'team_announcement_recipients_self_read',
  'team_announcements_recipient_read',
  'time_clock_break_select',
  'time_clock_punch_select',
  'tip_distributions_select',
  'training_course_assignments_self_read',
  'training_lesson_progress_self_read',
  'training_course_lessons_assigned_read',
  'training_courses_assigned_read',
  'training_lesson_comments_self_read',
  'training_lessons_assigned_read',
  'training_quiz_attempts_self_read',
];

test('optimization alters the intended existing policies instead of replacing grants',()=>{
  for(const policy of expectedPolicies){
    assert.match(sql,new RegExp(`alter policy ${policy} on public\\.`,'i'),policy);
  }
  assert.doesNotMatch(sql,/drop policy/i);
  assert.doesNotMatch(sql,/create policy/i);
});

test('row identity lookups use initplan-cached auth uid',()=>{
  const cached=sql.match(/\(select auth\.uid\(\)\)/gi)??[];
  assert.ok(cached.length>=expectedPolicies.length,`expected at least ${expectedPolicies.length} cached auth uid uses, got ${cached.length}`);
  assert.doesNotMatch(sql,/=\s*auth\.uid\(\)/i);
  assert.doesNotMatch(sql,/time_clock_employee_id_for_user\(auth\.uid\(\)\)/i);
});

test('manager and location authorization predicates remain present',()=>{
  assert.match(sql,/public\.current_app_role\(\) in \('admin','manager'\)/i);
  assert.match(sql,/public\.current_location_id\(\)/i);
  assert.match(sql,/e\.deleted_at is null/i);
});
