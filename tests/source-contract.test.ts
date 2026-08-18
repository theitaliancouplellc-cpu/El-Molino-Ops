import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {BACKUP_EXCLUDED_TABLES,BACKUP_TABLES} from '../lib/backup-manifest.ts';

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

test('global command palette resilient transport and error sanitizer are mounted once',()=>{
  const layout=read('app/layout.tsx'),pwa=read('app/pwa-register.tsx');
  assert.match(layout,/GlobalActions/);assert.match(layout,/ErrorSanitizer/);assert.doesNotMatch(layout,/NetworkResilience/);
  assert.match(pwa,/safeFetchWithRetry/);assert.match(pwa,/refreshSession/);assert.match(pwa,/response\.status===401/);
});

test('build script runs full tests before next build',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.build,'npm test && next build');
});

test('uploads enforce a finite size limit and rollback failed attachment links',()=>{
  const capture=read('app/capture/page.tsx');
  assert.match(capture,/MAX_FILE_BYTES/);assert.match(capture,/50\*1024\*1024/);assert.match(capture,/remove\(\[path\]\)/);
});

test('AI actions remain confirmation-gated and stale proposals are cleared',()=>{
  const pwa=read('app/pwa-register.tsx');
  assert.match(pwa,/Confirm AI action/);assert.match(pwa,/Manager access is required/);assert.match(pwa,/if\(isAsk\)setPendingAction\(null\)/);assert.match(pwa,/actionLock\.current/);
});

test('Ask AI is model-first and keeps retrieval private',()=>{
  const ask=read('app/api/ask/route.ts');
  assert.match(ask,/full conversational AI assistant/);
  assert.match(ask,/rather than phrase matching/);
  assert.match(ask,/Do not expose raw retrieval blocks/);
  assert.match(ask,/const result=await runFreeAI\(messages\)/);
  assert.doesNotMatch(ask,/basicConversationAnswer/);
  assert.doesNotMatch(ask,/clearlyUnrelated/);
  assert.doesNotMatch(ask,/From approved internal El Molino knowledge I found/);
});

test('Ask AI is pinned to zero-cost gateway models',()=>{
  const ask=read('app/api/ask/route.ts');
  assert.match(ask,/zai\/glm-4\.6v-flash/);
  assert.match(ask,/poolside\/laguna-s-2\.1-free/);
  assert.match(ask,/inclusionai\/ling-3\.0-tiny-free/);
  assert.match(ask,/EL_MOLINO_AGENT_MODEL=FREE_MODELS\[0\]/);
  assert.match(ask,/EL_MOLINO_AGENT_FALLBACK_MODELS=FREE_MODELS\.slice\(1\)\.join/);
});

test('raw JWT and database internals are sanitized before reaching users',()=>{
  const sanitizer=read('app/error-sanitizer.tsx'),session=read('app/session-resilience.tsx'),layout=read('app/layout.tsx'),pwa=read('app/pwa-register.tsx');
  assert.match(sanitizer,/jwt issued at future/i);assert.match(sanitizer,/friendlyErrorText/);assert.match(sanitizer,/SESSION_REFRESH_REQUEST_EVENT/);
  assert.match(session,/refreshSession/);assert.match(layout,/ErrorSanitizer/);assert.match(layout,/SessionResilience/);assert.match(pwa,/friendlyErrorText/);
});

test('operational record detail preserves attachment favorite and recent workflows',()=>{
  const detail=read('app/ops-record/[id]/page.tsx');
  assert.match(detail,/entity_file_links/);assert.match(detail,/createSignedUrl/);assert.match(detail,/favorites/);assert.match(detail,/recent_views/);assert.match(detail,/entityType=ops_record/);
});

test('saved workspace resolves operational records to stable detail routes',()=>{
  const saved=read('app/saved/page.tsx');
  assert.match(saved,/\/ops-record\/\$\{id\}/);assert.match(saved,/favorites/);assert.match(saved,/recent_views/);
});

test('admin backup includes post-launch operational domains through the shared manifest',()=>{
  for(const table of ['ops_records','task_dependencies','entity_file_links','notifications','favorites','recent_views'])assert.ok(BACKUP_TABLES.includes(table as any),`missing ${table}`);
  assert.ok(BACKUP_EXCLUDED_TABLES.includes('client_events'));
  assert.match(read('app/admin/page.tsx'),/BACKUP_TABLES/);
});
