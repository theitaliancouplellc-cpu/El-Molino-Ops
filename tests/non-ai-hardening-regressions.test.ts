import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const tasks=readFileSync(new URL('../app/tasks/page.tsx',import.meta.url),'utf8');
const shift=readFileSync(new URL('../app/shift/page.tsx',import.meta.url),'utf8');
const ops=readFileSync(new URL('../app/ops/page.tsx',import.meta.url),'utf8');
const discussions=readFileSync(new URL('../app/discussions/page.tsx',import.meta.url),'utf8');
const imports=readFileSync(new URL('../app/import/page.tsx',import.meta.url),'utf8');
const actions=readFileSync(new URL('../app/global-actions.tsx',import.meta.url),'utf8');
const admin=readFileSync(new URL('../app/admin/page.tsx',import.meta.url),'utf8');

 test('task mutations use stale-write protection and newest bounded comments',()=>{
  assert.match(tasks,/\.eq\('status',t\.status\)\.select\('id'\)\.maybeSingle\(\)/);
  assert.match(tasks,/order\('created_at',\{ascending:false\}\)\.limit\(5000\)/);
  assert.match(tasks,/setComments\(\[\.\.\.\(c\.data\?\?\[\]\) as Comment\[\]\]\.reverse\(\)\)/);
});

test('shift checklist mutations detect concurrent changes',()=>{
  assert.match(shift,/\.eq\('completed',item\.completed\)\.select\('id'\)\.maybeSingle\(\)/);
  assert.match(shift,/error\.code==='23505'/);
  assert.match(shift,/\.is\('completed_at',null\)\.select\('id'\)\.maybeSingle\(\)/);
});

test('operations records use updated_at as optimistic version token including undo',()=>{
  assert.match(ops,/\.eq\('updated_at',editing\.updated_at\)/);
  assert.match(ops,/expectedUpdatedAt:data\.updated_at/);
  assert.match(ops,/\.eq\('updated_at',current\.expectedUpdatedAt\)/);
});

test('discussion history keeps newest bounded messages while rendering chronologically',()=>{
  assert.match(discussions,/order\('created_at',\{ascending:false\}\)\.limit\(500\)/);
  assert.match(discussions,/setMessages\(\[\.\.\.\(data\?\?\[\]\) as Msg\[\]\]\.reverse\(\)\)/);
});

test('CSV parser rejects rows wider than the header and reads each file once',()=>{
  assert.match(imports,/matrix\.some\(r=>r\.length>raw\.length\)/);
  assert.match(imports,/more columns than the header row/);
  assert.equal((imports.match(/await file\.text\(\)/g)||[]).length,1);
});

test('command palette restores focus captured before opening',()=>{
  assert.match(actions,/if\(!v\)previousFocus\.current=document\.activeElement/);
  assert.match(actions,/const target=previousFocus\.current;previousFocus\.current=null;target\?\.focus\?\.\(\)/);
});

test('admin backup covers non-AI operational domains without invalid location_id filtering',()=>{
  for(const table of ['calendar_events','discussion_rooms','discussion_messages','import_jobs','import_rows','mentions','saved_views','dashboard_widgets','push_subscriptions'])assert.match(admin,new RegExp(`'${table}'`));
  assert.doesNotMatch(admin,/q=q\.eq\('location_id'/);
  assert.match(admin,/Do not use it for restore/);
});
