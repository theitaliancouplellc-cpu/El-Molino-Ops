import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/notification_dedupe_reliability_v1.sql','utf8');

test('legacy upcoming-shift function delegates to canonical deduped queue',()=>{
  assert.match(sql,/create or replace function public\.deliver_upcoming_shift_reminders\(\)[\s\S]*return public\.enqueue_due_employee_shift_reminders\(now\(\)\)/i);
  assert.doesNotMatch(sql,/schedule_shift_reminders_sent/);
});

test('duplicate legacy shift-reminder cron job is explicitly removed',()=>{
  assert.match(sql,/jobname='el_molino_shift_reminders'/i);
  assert.match(sql,/cron\.unschedule\('el_molino_shift_reminders'\)/i);
});

test('certification notification refresh serializes its rolling dedupe check',()=>{
  assert.match(sql,/create or replace function public\.refresh_certification_expiry_notifications\(\)/i);
  assert.match(sql,/pg_advisory_xact_lock/i);
  assert.match(sql,/hashtextextended\('el-molino:certification-expiry-notifications',0\)/i);
  assert.match(sql,/n\.created_at>=now\(\)-interval '7 days'/i);
});

test('certification notifications carry structured category and event key',()=>{
  assert.match(sql,/location_id,user_id,type,category,event_key,title,body,href,data/i);
  assert.match(sql,/'training','training','training\.certification_expiry'/i);
});

test('scheduler-only functions stay inaccessible to normal clients',()=>{
  for(const name of ['deliver_upcoming_shift_reminders','refresh_certification_expiry_notifications']){
    assert.match(sql,new RegExp(`revoke all on function public\\.${name}\\(\\) from public,anon,authenticated`,'i'));
    assert.match(sql,new RegExp(`grant execute on function public\\.${name}\\(\\) to service_role`,'i'));
  }
});
