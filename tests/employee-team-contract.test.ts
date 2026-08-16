import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const team=readFileSync('app/employee/team/page.tsx','utf8');
const legacy=readFileSync('app/team/layout.tsx','utf8');
const migration=readFileSync('docs/database/employee_team_communications_v4.sql','utf8');
const events=readFileSync('docs/database/employee_team_communications_v4_1.sql','utf8');
const backup=readFileSync('lib/backup-manifest.ts','utf8');

test('employee Team Hub is a dedicated employee-only surface',()=>{
 assert.match(team,/staff_manager_on_duty/);
 assert.match(team,/start_manager_on_duty_channel/);
 assert.match(team,/my_team_channels/);
 assert.match(team,/team_channel_messages_for_me/);
 assert.match(team,/send_team_channel_message/);
 assert.match(team,/acknowledge_team_announcement/);
 assert.match(team,/href="\/employee\/requests"/);
 assert.match(team,/href="\/employee\/team"/);
 assert.doesNotMatch(team,/send_team_announcement/);
 assert.doesNotMatch(team,/archive_team_announcement/);
 assert.doesNotMatch(team,/remind_unread_team_announcement/);
 assert.doesNotMatch(team,/from\('team_channel_messages'\)/);
 assert.doesNotMatch(team,/from\('team_channel_members'\)/);
 assert.match(legacy,/app_role==='employee'/);
 assert.match(legacy,/employee\/team/);
});

test('staff conversations are membership-gated RPC data, not location-wide table reads',()=>{
 for(const table of ['team_channels','team_channel_members','team_channel_messages'])assert.match(migration,new RegExp(`revoke all[\\s\\S]*${table}`));
 assert.match(migration,/current_schedule_employee_id/);
 assert.match(migration,/conversation not available/);
 assert.match(migration,/m\.employee_id=me/);
 assert.match(migration,/m\.employee_id<>me/);
 assert.match(migration,/team\.message/);
});

test('manager-on-duty routing prefers active scheduled managers and has a fallback',()=>{
 assert.match(migration,/s\.starts_at<=now\(\) and s\.ends_at>now\(\)/);
 assert.match(migration,/p\.app_role in\('admin','manager'\)/);
 assert.match(migration,/next_manager/);
 assert.match(migration,/fallback/);
});

test('announcement events deep-link into employee Team Hub and urgent notices require acknowledgment',()=>{
 assert.match(events,/p_priority='urgent'/);
 assert.match(events,/team\.announcement/);
 assert.match(events,/\/employee\/team\?announcement=/);
 assert.match(events,/new\.href:='\/employee\/team'/);
 assert.match(migration,/acknowledged_at/);
});

test('Team Hub conversation evidence is included in portable recovery',()=>{
 for(const table of ['team_channels','team_channel_members','team_channel_messages'])assert.match(backup,new RegExp(table));
});
