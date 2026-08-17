import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/pilot_scorecard_completion_v1.sql','utf8');
const fix=fs.readFileSync('docs/database/pilot_scorecard_completion_v1_fix.sql','utf8');
const ui=fs.readFileSync('app/manager/pilot/page.tsx','utf8');
const manager=fs.readFileSync('app/manager/page.tsx','utf8');
const recorder=fs.readFileSync('app/pilot-use-recorder.tsx','utf8');
const layout=fs.readFileSync('app/layout.tsx','utf8');

test('pilot evidence tables are durable and not directly writable by browser roles',()=>{
 for(const table of ['pilot_participants','pilot_task_catalog','pilot_daily_use','pilot_task_results','pilot_defects','pilot_rollout_stages']){
  assert.match(sql,new RegExp(`create table if not exists public\\.${table}`,'i'));
  assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`,'i'));
  assert.match(sql,new RegExp(`revoke all on public\\.${table} from public,anon,authenticated`,'i'));
 }
});

test('catalog carries every documented staff and manager critical task',()=>{
 const staff=[...sql.matchAll(/\('staff_[a-z0-9_]+','staff',/g)].length;
 const managerTasks=[...sql.matchAll(/\('manager_[a-z0-9_]+','manager',/g)].length;
 assert.equal(staff,21);
 assert.equal(managerTasks,10);
});

test('task completion denominator includes unobserved required tasks instead of counting only submitted results',()=>{
 assert.match(fix,/expected_tasks-na_tasks/i);
 assert.match(fix,/100\.0\*passed_tasks\/\(expected_tasks-na_tasks\)/i);
 assert.doesNotMatch(fix,/passed_tasks\s*\/\s*\w*recorded/i);
});

test('pilot enrollment requires a real linked signed-in employee',()=>{
 assert.match(fix,/join public\.profiles p on p\.id=e\.user_id/i);
 assert.match(fix,/e\.user_id is not null/i);
 assert.match(fix,/eligible signed-in employee not found/i);
});

test('daily use is server-recorded only for enrolled authenticated employees',()=>{
 assert.match(sql,/create or replace function public\.record_pilot_daily_use/i);
 assert.match(sql,/e\.user_id=actor/i);
 assert.match(sql,/on conflict do nothing/i);
 assert.match(recorder,/supabase\.rpc\('record_pilot_daily_use'/i);
 assert.match(layout,/<PilotUseRecorder\s*\/>/i);
});

test('scorecard preserves all three rollout stage identities before evidence exists',()=>{
 assert.match(fix,/from \(values\(25\),\(50\),\(100\)\) v\(stage_percent\)/i);
 assert.match(fix,/'stage_percent',v\.stage_percent/i);
 assert.match(sql,/25 percent stage must complete first/i);
 assert.match(sql,/50 percent stage must complete first/i);
});

test('manager scorecard exposes authoritative gates and never substitutes pageviews for task evidence',()=>{
 assert.match(ui,/pilot_scorecard_snapshot/i);
 assert.match(ui,/No mutation evidence yet/i);
 assert.match(ui,/Not observed/i);
 assert.match(ui,/task_completion_rate/i);
 assert.match(ui,/success_rate/i);
 assert.match(ui,/open_p0_p1_defects/i);
 assert.match(ui,/privacy_incidents/i);
 assert.match(ui,/data_integrity_incidents/i);
 assert.match(ui,/rollout_stages_completed/i);
 assert.match(ui,/Missing evidence stays missing; it is never inferred from pageviews/i);
 assert.match(manager,/href="\/manager\/pilot"/i);
});

test('defect and rollout certification are bounded server-authoritative actions',()=>{
 assert.match(sql,/severity in\('P0','P1','P2','P3'\)/i);
 assert.match(sql,/category in\('privacy','data_integrity','workflow','notification','usability','other'\)/i);
 assert.match(sql,/public\.current_app_role\(\)<>'admin'/i);
 assert.match(sql,/completed rollout stage requires a verified schedule cycle and no stop trigger/i);
 assert.match(ui,/Certify that the .* rollout survived a real schedule publication\/change cycle with no stop condition/i);
});
