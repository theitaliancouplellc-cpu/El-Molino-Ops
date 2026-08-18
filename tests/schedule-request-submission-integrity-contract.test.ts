import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/schedule_request_submission_integrity_v1.sql','utf8');

test('employee time-off inserts cannot manufacture approval or manager review evidence',()=>{
  assert.match(sql,/tg_table_name='time_off_requests'/i);
  assert.match(sql,/tg_op='INSERT'/i);
  assert.match(sql,/new\.status is distinct from 'pending'/i);
  assert.match(sql,/new\.reviewed_by is not null/i);
  assert.match(sql,/new\.reviewed_at is not null/i);
  assert.match(sql,/new\.manager_note is not null/i);
  assert.match(sql,/new\.employee_cancelled_at is not null/i);
  assert.match(sql,/create policy time_off_requests_insert[\s\S]*status='pending'[\s\S]*manager_note is null/i);
});

test('employee shift requests start pending and only expose coverage or reciprocal swap',()=>{
  assert.match(sql,/new\.request_type not in \('coverage','swap'\)/i);
  assert.match(sql,/new\.status is distinct from 'pending'/i);
  assert.match(sql,/coverage request cannot contain swap consent fields/i);
  assert.match(sql,/new\.target_response is distinct from 'not_required'/i);
  assert.match(sql,/swap must wait for the target employee response/i);
  assert.match(sql,/new\.target_response is distinct from 'pending'/i);
  assert.match(sql,/create policy shift_change_requests_insert[\s\S]*request_type in \('coverage','swap'\)[\s\S]*status='pending'/i);
});

test('requester cannot forge coworker swap consent',()=>{
  assert.match(sql,/new\.target_response is distinct from old\.target_response/i);
  assert.match(sql,/new\.target_responded_at is distinct from old\.target_responded_at/i);
  assert.match(sql,/new\.target_responded_by is distinct from old\.target_responded_by/i);
  assert.match(sql,/requester may not change coworker response fields/i);
});

test('target employee response is narrowly constrained and decline can reach denied',()=>{
  assert.match(sql,/old\.target_employee_id=actor_employee/i);
  assert.match(sql,/old\.target_response='pending'/i);
  assert.match(sql,/new\.target_response not in \('accepted','declined'\)/i);
  assert.match(sql,/new\.target_responded_by is distinct from uid_now/i);
  assert.match(sql,/new\.target_response='accepted' and new\.status<>'pending'/i);
  assert.match(sql,/new\.target_response='declined' and new\.status<>'denied'/i);
});

test('employee cannot rewrite ownership or manager evidence during request updates',()=>{
  assert.match(sql,/time-off request ownership\/review fields cannot be changed/i);
  assert.match(sql,/shift-change request identity\/review fields cannot be changed/i);
  assert.match(sql,/new\.manager_note is distinct from old\.manager_note/i);
  assert.match(sql,/new\.reviewed_by is distinct from old\.reviewed_by/i);
  assert.match(sql,/new\.reviewed_at is distinct from old\.reviewed_at/i);
});

test('employee cancellation is stamped by the database',()=>{
  assert.match(sql,/new\.employee_cancelled_at := now\(\)/i);
  assert.match(sql,/old\.status<>'pending' or new\.status not in \('pending','cancelled'\)/i);
});
