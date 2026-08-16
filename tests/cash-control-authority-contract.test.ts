import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const cash=readFileSync('app/cash/page.tsx','utf8');

test('cash controls submit and verify only through server-authoritative RPCs',()=>{
  assert.match(cash,/submit_cash_control_session/);
  assert.match(cash,/verify_cash_control_session/);
  assert.doesNotMatch(cash,/from\('cash_control_sessions'\)\.upsert/);
  assert.doesNotMatch(cash,/from\('cash_control_sessions'\)\.update\(\{status:'verified'\}\)/);
});

test('cash control UI blocks impossible negative expected cash before submit',()=>{
  assert.match(cash,/expected<0/);
  assert.match(cash,/Cash outflows cannot exceed opening cash plus cash sales/);
});
