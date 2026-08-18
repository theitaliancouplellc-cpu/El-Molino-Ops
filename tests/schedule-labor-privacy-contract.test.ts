import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/schedule_labor_privacy_hardening_v1.sql','utf8');
const page=fs.readFileSync('app/schedule/labor/page.tsx','utf8');

test('labor budget RPC enforces manager authorization inside the SECURITY DEFINER boundary',()=>{
  assert.match(sql,/create or replace function public\.schedule_labor_budget_report\(p_period_id uuid\)[\s\S]*security definer/i);
  assert.match(sql,/auth\.uid\(\) is null or public\.current_app_role\(\) not in \('admin','manager'\)/i);
  assert.match(sql,/raise exception 'manager access required'/i);
  assert.match(sql,/revoke all on function public\.schedule_labor_budget_report\(uuid\) from public, anon/i);
  assert.match(sql,/grant execute on function public\.schedule_labor_budget_report\(uuid\) to authenticated/i);
});

test('labor planning tables are not directly readable by employee-role clients',()=>{
  for(const table of ['schedule_settings','schedule_daily_forecasts']){
    const block=new RegExp(`create policy ${table}_read[\\s\\S]*?on public\\.${table}[\\s\\S]*?for select[\\s\\S]*?to authenticated[\\s\\S]*?current_app_role\\(\\) in \\('admin','manager'\\)`,'i');
    assert.match(sql,block);
  }
});

test('labor UI treats wage and labor-budget data as manager-only',()=>{
  assert.match(page,/const canManage=profile\?\.app_role==='admin'\|\|profile\?\.app_role==='manager'/);
  assert.match(page,/Manager access is required for wage and labor-budget data/);
});
