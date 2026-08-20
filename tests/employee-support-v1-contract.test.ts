import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const schema=readFileSync('docs/database/employee_support_reports_v1.sql','utf8');
const recovery=readFileSync('docs/database/backup_recovery_employee_support_v1.sql','utf8');
const ask=readFileSync('app/api/ask/route.ts','utf8');
const backup=readFileSync('lib/backup-manifest.ts','utf8');
const page=readFileSync('app/employee/support/page.tsx','utf8');
const managerPage=readFileSync('app/admin/support/page.tsx','utf8');
const admin=readFileSync('app/admin/page.tsx','utf8');
const more=readFileSync('app/employee/more/page.tsx','utf8');
const features=readFileSync('lib/staff-features.ts','utf8');

test('management Ask authorization is derived server-side from the authenticated database role',()=>{
  assert.match(ask,/client\.rpc\('current_app_role'\)/);
  assert.match(ask,/identity\.role!==['"]admin['"]&&identity\.role!==['"]manager['"]/);
  assert.match(ask,/Ask El Molino is currently available to management only/);
  assert.match(ask,/status:403/);
  assert.doesNotMatch(ask,/user_metadata/);
  assert.doesNotMatch(ask,/body\.(?:role|app_role)/);
});

test('support reports are durable, RLS-protected, and direct Staff mutations are revoked',()=>{
  assert.match(schema,/create table if not exists public\.employee_support_reports/);
  assert.match(schema,/alter table public\.employee_support_reports enable row level security/);
  assert.match(schema,/revoke all on table public\.employee_support_reports from public,anon,authenticated/);
  assert.match(schema,/grant select on table public\.employee_support_reports to authenticated/);
  assert.match(schema,/employee_support_reports_manager_read/);
  assert.match(schema,/location_id=public\.current_location_id\(\)/);
  assert.match(schema,/public\.current_app_role\(\) in \('admin','manager'\)/);
});

test('Staff support submission derives identity and employment state from authoritative server context',()=>{
  assert.match(schema,/submit_employee_support_report/);
  assert.match(schema,/loc uuid:=public\.current_location_id\(\)/);
  assert.match(schema,/uid uuid:=auth\.uid\(\)/);
  assert.match(schema,/public\.current_app_role\(\)<>'employee'/);
  assert.match(schema,/location_id=loc and user_id=uid and active and deleted_at is null and employment_status='active'/);
  assert.match(schema,/category_value not in \('account','schedule','requests','messages','notifications','app_error','other'\)/);
  assert.match(schema,/char_length\(summary_value\)<5/);
  assert.match(schema,/char_length\(description_value\)<10/);
  assert.match(schema,/route_value !~ '\^\/\[A-Za-z0-9\/_-\]\*\$'/);
});

test('support submission retries are content-aware and cannot reuse an id for changed semantics',()=>{
  assert.match(schema,/client_request_id uuid not null/);
  assert.match(schema,/constraint employee_support_reports_user_request_unique unique\(user_id,client_request_id\)/);
  assert.match(schema,/request_fingerprint/);
  assert.match(schema,/md5\(concat_ws/);
  assert.match(schema,/existing\.request_fingerprint<>fingerprint/);
  assert.match(schema,/request id already used for different report/);
  assert.match(schema,/'deduplicated',true/);
  assert.match(page,/pending\.current\?\?\{id:crypto\.randomUUID\(\),diagnostics:diagnosticSnapshot\(\)\}/);
  assert.match(page,/pending\.current=attempt/);
  assert.match(page,/function invalidateAttempt\(\)\{pending\.current=null\}/);
  assert.match(page,/setCategory\(e\.target\.value as Category\);invalidateAttempt\(\)/);
  assert.match(page,/setSummary\(e\.target\.value\);invalidateAttempt\(\)/);
  assert.match(page,/setDescription\(e\.target\.value\);invalidateAttempt\(\)/);
});

test('Staff support UI stays deterministic, privacy-bounded, and does not call Ask AI',()=>{
  assert.match(page,/submit_employee_support_report/);
  assert.match(page,/my_employee_support_reports/);
  assert.match(page,/employee_self_setup_status/);
  assert.match(page,/window\.location\.pathname/);
  assert.match(page,/fetch\('\/api\/health'/);
  assert.match(page,/Do not include passwords, verification codes, API keys, push tokens, payroll\/HR information/);
  assert.match(page,/URL parameters and credentials are not sent/);
  assert.doesNotMatch(page,/\/api\/ask/);
  assert.doesNotMatch(page,/window\.location\.(?:search|href)/);
  assert.doesNotMatch(page,/navigator\.clipboard|localStorage|sessionStorage/);
});

test('manager review and listing remain same-location and role-gated',()=>{
  assert.match(schema,/employee_support_reports_for_manager/);
  assert.match(schema,/review_employee_support_report/);
  assert.match(schema,/role_value not in \('admin','manager'\)/);
  assert.match(schema,/where r\.location_id=loc/);
  assert.match(schema,/where id=p_report_id and location_id=loc/);
  assert.match(schema,/status_value not in \('open','acknowledged','resolved','closed'\)/);
  assert.match(managerPage,/employee_support_reports_for_manager/);
  assert.match(managerPage,/review_employee_support_report/);
  assert.match(managerPage,/\['admin','manager'\]\.includes\(appRole\)/);
  assert.match(admin,/href="\/admin\/support"/);
});

test('support RPCs revoke PUBLIC and anon execution and grant only authenticated callers',()=>{
  for(const fn of ['submit_employee_support_report','my_employee_support_reports','employee_support_reports_for_manager','review_employee_support_report']){
    assert.match(schema,new RegExp(`revoke all on function public\\.${fn}\\([\\s\\S]*?from public,anon,authenticated`));
    assert.match(schema,new RegExp(`grant execute on function public\\.${fn}\\([\\s\\S]*?to authenticated`));
  }
});

test('support reports are included in a coherent browser and server recovery v5 contract',()=>{
  assert.match(backup,/BACKUP_FORMAT='el-molino-ops-backup-v5'/);
  assert.match(backup,/BACKUP_SCHEMA_VERSION=5/);
  assert.match(backup,/employee_support_reports/);
  assert.match(recovery,/employee_support_reports/);
  assert.match(recovery,/p_format<>'el-molino-ops-backup-v5' or p_schema_version<>5/);
  assert.doesNotMatch(recovery,/el-molino-ops-backup-v4|p_schema_version<>4/);
});

test('Staff support is released only as one exact route and is discoverable from More',()=>{
  assert.match(features,/support:\s*true/);
  assert.match(features,/\{path: '\/employee\/support', feature: 'support'\}/);
  assert.match(more,/staffFeatureEnabled\('support'\)/);
  assert.match(more,/href="\/employee\/support"/);
});
