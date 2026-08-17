import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const team=readFileSync('app/employee/team/page.tsx','utf8');
const notifications=readFileSync('app/employee/notifications/page.tsx','utf8');
const preferences=readFileSync('app/employee/notifications/preferences/page.tsx','utf8');
const training=readFileSync('app/employee/training/page.tsx','utf8');
const account=readFileSync('app/account/page.tsx','utf8');

test('secondary employee screens are locale-aware and contain Spanish system UI',()=>{
  for(const source of [team,notifications,preferences,training,account])assert.match(source,/useI18n/);
  assert.match(team,/Mantente conectado/);
  assert.match(notifications,/Centro de Notificaciones/);
  assert.match(preferences,/Cómo quieres recibir novedades/);
  assert.match(training,/Mi desarrollo/);
  assert.match(account,/Solicitud de cambio de puesto enviada a gerencia/);
});

test('Team Hub localizes chrome without translating authored operational content',()=>{
  for(const authored of ['a.title','a.body','ch.display_name','ch.last_message','m.author_name','m.body','manager.full_name'])assert.match(team,new RegExp(authored.replace('.','\\.')));
  assert.match(team,/toLocaleTimeString\(locale===/);
  assert.match(team,/toLocaleString\(locale===/);
  assert.match(team,/toLocaleDateString\(locale===/);
});

test('notification center preserves notification title and body exactly as stored',()=>{
  assert.match(notifications,/<b>\{n\.title\}<\/b>/);
  assert.match(notifications,/n\.body\|\|c\.details/);
  assert.match(notifications,/mark_my_notification_read/);
  assert.match(notifications,/mark_all_my_notifications_read/);
});

test('notification preferences preserve authoritative category keys and RPC arguments',()=>{
  assert.match(preferences,/set_my_notification_preference/);
  for(const arg of ['p_category:p.category','p_push:p.push','p_email:p.email','p_sms:p.sms','p_settings:p.settings'])assert.match(preferences,new RegExp(arg.replaceAll('.','\\.')));
  assert.match(preferences,/shift_reminder_minutes/);
});

test('training keeps authored course, lesson, quiz, review and task content unmodified',()=>{
  for(const authored of ['course.name','course.description','l?.title','payload.lesson.title','payload.lesson.content','q.prompt','option','pr?.review_note','taskComment.trim()'])assert.match(training,new RegExp(authored.replaceAll('.','\\.').replaceAll('?','\\?')));
  for(const rpc of ['training_lesson_payload','start_training_lesson','complete_training_lesson','submit_training_quiz','submit_training_task'])assert.match(training,new RegExp(rpc));
});

test('account localizes system controls without translating role names or manager notes',()=>{
  assert.match(account,/verifiedRoles\.map\(x=>x\.name\)/);
  assert.match(account,/\{r\.name\}/);
  assert.match(account,/roleProfile\.latest_request\.manager_note/);
  assert.match(account,/roleProfile\?\.latest_request\?\.employee_note/);
  assert.match(account,/submit_employee_role_change_request/);
  assert.match(account,/cancel_my_employee_role_change_request/);
});
