import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const team=readFileSync('app/team/page.tsx','utf8');
const training=readFileSync('app/training/courses/page.tsx','utf8');
const tools=readFileSync('app/tools/page.tsx','utf8');

test('Team Hub keeps announcement and recognition mutations behind RPCs',()=>{
  for(const rpc of ['send_team_announcement','mark_team_announcement_read','remind_unread_team_announcement','archive_team_announcement','create_team_shoutout','react_to_team_shoutout','remove_team_shoutout_reaction','hide_team_shoutout']){
    assert.match(team,new RegExp(`['"]${rpc}['"]`),rpc);
  }
  for(const table of ['team_announcements','team_announcement_recipients','team_shoutouts','team_shoutout_reactions']){
    assert.doesNotMatch(team,new RegExp(`from\\(['"]${table}['"]\\)\\.(insert|update|delete)`),table);
  }
});

test('structured training learner evidence stays server-authoritative',()=>{
  for(const rpc of ['assign_training_course','cancel_training_course_assignment','training_lesson_payload','start_training_lesson','complete_training_lesson','submit_training_quiz','submit_training_task','add_training_lesson_comment','review_training_task']){
    assert.match(training,new RegExp(`['"]${rpc}['"]`),rpc);
  }
  for(const table of ['training_course_assignments','training_course_lesson_progress','training_quiz_attempts','training_lesson_comments']){
    assert.doesNotMatch(training,new RegExp(`from\\(['"]${table}['"]\\)\\.(insert|update|delete)`),table);
  }
  assert.match(training,/training_lesson_payload/);
  assert.match(training,/Once a course is assigned, its lesson structure and quiz answers lock/);
});

test('manager-authored training definitions use only definition tables',()=>{
  assert.match(training,/from\('training_courses'\)\.insert/);
  assert.match(training,/from\('training_lessons'\)\.insert/);
  assert.match(training,/from\('training_course_lessons'\)\.insert/);
  assert.match(training,/from\('training_quiz_questions'\)\.insert/);
});

test('new workspaces are reachable from Tools',()=>{
  assert.match(tools,/href:'\/team'/);
  assert.match(tools,/href:'\/training\/courses'/);
});
