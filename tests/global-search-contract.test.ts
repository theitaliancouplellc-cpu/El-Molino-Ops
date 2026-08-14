import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync('app/global-actions.tsx','utf8');

test('global command palette calls global_search with deployed function argument names',()=>{
  assert.match(source,/supabase\.rpc\('global_search',\{search_text:query,result_limit:20\}\)/);
  assert.doesNotMatch(source,/supabase\.rpc\('global_search',\{q:query\}\)/);
});
