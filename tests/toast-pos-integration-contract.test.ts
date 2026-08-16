import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const toastClient=readFileSync('lib/toast.ts','utf8');
const syncRoute=readFileSync('app/api/toast/sync/route.ts','utf8');
const statusRoute=readFileSync('app/api/toast/status/route.ts','utf8');
const toastPage=readFileSync('app/toast/page.tsx','utf8');
const toolsPage=readFileSync('app/tools/page.tsx','utf8');

test('Toast credentials stay server-only and are never hardcoded',()=>{
  for(const name of ['TOAST_API_HOST','TOAST_CLIENT_ID','TOAST_CLIENT_SECRET','TOAST_RESTAURANT_GUID'])assert.match(toastClient,new RegExp(`process\\.env\\.${name}`));
  assert.doesNotMatch(toastClient,/NEXT_PUBLIC_TOAST/);
  assert.doesNotMatch(toastClient,/clientSecret\s*:\s*['"][^'"]+['"]/);
  assert.doesNotMatch(statusRoute,/TOAST_CLIENT_SECRET\s*[:=]/);
});

test('Toast sync is authenticated, manager-gated and server-ingested',()=>{
  assert.match(syncRoute,/authorization/);
  assert.match(syncRoute,/Manager access required/);
  assert.match(syncRoute,/fetchToastSnapshot/);
  assert.match(syncRoute,/ingest_toast_snapshot/);
  assert.match(syncRoute,/toast_record_sync_result/);
  assert.doesNotMatch(syncRoute,/service_role/i);
});

test('Toast client imports labor, orders, cash entries and deposits',()=>{
  assert.match(toastClient,/\/labor\/v1\/employees/);
  assert.match(toastClient,/\/labor\/v1\/timeEntries\?businessDate=/);
  assert.match(toastClient,/\/orders\/v2\/ordersBulk\?businessDate=/);
  assert.match(toastClient,/\/cashmgmt\/v1\/entries\?businessDate=/);
  assert.match(toastClient,/\/cashmgmt\/v1\/deposits\?businessDate=/);
  assert.match(toastClient,/for\(let page=1;/,'ordersBulk pagination must begin with Toast page 1');
});

test('manager workspace exposes mapping, authority, payroll and cash reports',()=>{
  for(const rpc of ['map_toast_employee','set_time_clock_authoritative_source','toast_payroll_summary','toast_cash_summary'])assert.match(toastPage,new RegExp(rpc));
  assert.match(toastPage,/\/api\/toast\/sync/);
  assert.match(toolsPage,/href="\/toast"/);
  assert.match(toolsPage,/Toast POS Integration/);
});

test('browser UI never writes directly to protected Toast evidence tables',()=>{
  for(const table of ['toast_time_entries','toast_order_payments','toast_cash_entries','toast_deposits']){
    assert.doesNotMatch(toastPage,new RegExp(`from\\(['\"]${table}['\"]\\)\\.(insert|update|upsert|delete)`));
  }
});
