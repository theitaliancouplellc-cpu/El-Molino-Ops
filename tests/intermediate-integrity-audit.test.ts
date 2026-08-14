import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const account=readFileSync(new URL('../app/account/page.tsx',import.meta.url),'utf8');
const myWork=readFileSync(new URL('../app/my-work/page.tsx',import.meta.url),'utf8');

test('account deletion request does not depend on activity-log read permission',()=>{
  assert.doesNotMatch(account,/from\('activity_log'\)\.select\('id'\).*account_deletion_requested/);
  assert.match(account,/error\?\.code==='23505'/);
  assert.match(account,/A deletion request is already recorded/);
});

test('My Work explicitly expects a single active employee link',()=>{
  assert.match(myWork,/from\('employees'\)\.select\('id,full_name'\)\.eq\('user_id',u\.user\.id\)\.is\('deleted_at',null\)\.maybeSingle\(\)/);
});
