import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const tasks=readFileSync(new URL('../app/tasks/page.tsx',import.meta.url),'utf8');
const shift=readFileSync(new URL('../app/shift/page.tsx',import.meta.url),'utf8');
const myWork=readFileSync(new URL('../app/my-work/page.tsx',import.meta.url),'utf8');
const ops=readFileSync(new URL('../app/ops/page.tsx',import.meta.url),'utf8');
const discussions=readFileSync(new URL('../app/discussions/page.tsx',import.meta.url),'utf8');
const imports=readFileSync(new URL('../app/import/page.tsx',import.meta.url),'utf8');
const actions=readFileSync(new URL('../app/global-actions.tsx',import.meta.url),'utf8');
const admin=readFileSync(new URL('../app/admin/page.tsx',import.meta.url),'utf8');
const diagnostics=readFileSync(new URL('../app/admin/diagnostics/page.tsx',import.meta.url),'utf8');
const restore=readFileSync(new URL('../app/admin/restore/page.tsx',import.meta.url),'utf8');
const capture=readFileSync(new URL('../app/capture/page.tsx',import.meta.url),'utf8');
const root=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const pwa=readFileSync(new URL('../app/pwa-register.tsx',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');

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

test('My Work supports required checklist photos with rollback and stale-write protection',()=>{
  assert.match(myWork,/photo_path,checklist_template_items\(label,item_number,requires_photo\)/);
  assert.match(myWork,/Add photo/);
  assert.match(myWork,/await supabase\.storage\.from\('el-molino-files'\)\.remove\(\[path\]\)/);
  assert.match(myWork,/\.eq\('completed',false\)\.select\('id'\)\.maybeSingle\(\)/);
  assert.match(myWork,/\.eq\('status',t\.status\)\.select\('id'\)\.maybeSingle\(\)/);
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

test('restore remains dry-run only until a transactional restore exists',()=>{
  assert.match(restore,/Nothing has been written to the database/);
  assert.match(restore,/No restore button is exposed/);
  assert.doesNotMatch(restore,/\.insert\(/);
  assert.doesNotMatch(restore,/\.upsert\(/);
});

test('root shell uses exact unread counts, protected task writes, rollback-safe uploads, and internal links',()=>{
  assert.match(root,/select\('id',\{count:'exact',head:true\}\)\.is\('read_at',null\)/);
  assert.match(root,/\.eq\('status',task\.status\)\.select\('id'\)\.maybeSingle\(\)/);
  assert.match(root,/File metadata could not be saved, so the upload was rolled back/);
  assert.match(root,/safeInternalHref\(n\.href,'\/'\)/);
  assert.match(root,/strongEnoughPassword\(password\)/);
  assert.match(root,/New accounts require a current invitation/);
});

test('capture cannot upload a stopped recording after the page is unmounted',()=>{
  assert.match(capture,/mounted\.current=false/);
  assert.match(capture,/if\(!mounted\.current\)\{chunks\.current=\[\];return\}/);
  assert.match(capture,/if\(!mounted\.current\)\{await supabase\.from\('files'\)\.delete\(\)\.eq\('id',f\.id\)/);
});

test('diagnostic restore detects concurrent restore and blocks duplicate actions',()=>{
  assert.match(diagnostics,/if\(busy\)return/);
  assert.match(diagnostics,/\.not\('deleted_at','is',null\)\.select\('id'\)\.maybeSingle\(\)/);
});

test('PWA update adoption waits for genuinely unsaved form state',()=>{
  assert.match(pwa,/function hasUnsavedFormState\(\)/);
  assert.match(pwa,/el\.value!==el\.defaultValue/);
  assert.match(pwa,/el\.checked!==el\.defaultChecked/);
  assert.match(pwa,/option\.selected!==option\.defaultSelected/);
  assert.match(pwa,/dirty:dirty\(\)/);
});

test('service worker never caches authenticated document responses or non-GET mutations',()=>{
  assert.match(sw,/if\(req\.method!==['"]GET['"]\)return/);
  assert.match(sw,/if\(req\.mode==='navigate'\|\|req\.destination==='document'\)\{event\.respondWith\(fetch\(req,\{cache:'no-store'\}\)/);
  assert.match(sw,/new Response\(OFFLINE_HTML/);
  assert.match(sw,/if\(cacheable\)\{const cache=await caches\.open\(CACHE\);await cache\.put\(req,res\.clone\(\)\)\}/);
});
