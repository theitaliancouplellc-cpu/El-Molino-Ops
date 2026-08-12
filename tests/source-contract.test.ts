import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read=(p:string)=>readFileSync(p,'utf8');

test('critical production routes exist',()=>{
  for(const p of ['app/ops/page.tsx','app/ops-record/[id]/page.tsx','app/shift/page.tsx','app/tasks/page.tsx','app/procedures/page.tsx','app/manager/page.tsx','app/my-work/page.tsx','app/capture/page.tsx','app/files/page.tsx','app/saved/page.tsx','app/admin/page.tsx','app/admin/diagnostics/page.tsx','app/api/health/route.ts'])assert.equal(existsSync(p),true,p);
});

test('iPhone viewport and safe-area protection cannot regress',()=>{
  const layout=read('app/layout.tsx'),css=read('app/extra.css');
  assert.match(layout,/viewportFit:\s*'cover'/);
  assert.match(css,/safe-area-inset-top/);
  assert.match(css,/\.topbar\{/);
});

test('task filter remains visible while AI source routing remains hidden',()=>{
  const css=read('app/extra.css');
  assert.match(css,/\.source-switch,.source-label\{display:none!important\}/);
  assert.match(css,/\.task-toolbar \.source-switch\{display:grid!important/);
});

test('global command palette and safe retry layer are mounted',()=>{
  const layout=read('app/layout.tsx');
  assert.match(layout,/GlobalActions/);assert.match(layout,/NetworkResilience/);
});

test('build script runs full tests before next build',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.build,'npm test && next build');
});

test('uploads enforce a finite size limit and rollback failed attachment links',()=>{
  const capture=read('app/capture/page.tsx');
  assert.match(capture,/MAX_FILE_BYTES/);assert.match(capture,/50\*1024\*1024/);assert.match(capture,/remove\(\[path\]\)/);
});

test('AI actions remain confirmation-gated',()=>{
  const pwa=read('app/pwa-register.tsx');
  assert.match(pwa,/Confirm AI action/);assert.match(pwa,/Manager access is required/);
});

test('operational record detail preserves attachment favorite and recent workflows',()=>{
  const detail=read('app/ops-record/[id]/page.tsx');
  assert.match(detail,/entity_file_links/);
  assert.match(detail,/createSignedUrl/);
  assert.match(detail,/favorites/);
  assert.match(detail,/recent_views/);
  assert.match(detail,/entityType=ops_record/);
});

test('saved workspace resolves operational records to stable detail routes',()=>{
  const saved=read('app/saved/page.tsx');
  assert.match(saved,/\/ops-record\/\$\{id\}/);
  assert.match(saved,/favorites/);
  assert.match(saved,/recent_views/);
});

test('admin backup includes post-launch operational domains',()=>{
  const admin=read('app/admin/page.tsx');
  for(const table of ['ops_records','task_dependencies','entity_file_links','notifications','favorites','recent_views','client_events'])assert.match(admin,new RegExp(`'${table}'`));
});
