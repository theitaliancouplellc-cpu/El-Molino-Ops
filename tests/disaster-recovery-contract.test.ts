import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/recovery-rehearsal.yml','utf8');
const rehearsal=fs.readFileSync('scripts/recovery-rehearsal.ts','utf8');
const restorePage=fs.readFileSync('app/admin/restore/page.tsx','utf8');

test('recovery rehearsal runs on main releases, weekly, and manually with exact-SHA narrow execution',()=>{
  assert.match(workflow,/push:\s*\n\s*branches: \[main\]/);
  assert.match(workflow,/schedule:/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/cron: '17 8 \* \* 1'/);
  assert.match(workflow,/group: disaster-recovery-rehearsal-\$\{\{ github\.sha \}\}/);
  assert.match(workflow,/ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/permissions:\s*\n\s*contents: read\s*\n\s*statuses: write/);
  assert.doesNotMatch(workflow,/SUPABASE_SERVICE_ROLE/i);
  assert.doesNotMatch(workflow,/SUPABASE_URL/i);
  assert.doesNotMatch(workflow,/CLOUDFLARE_API_TOKEN/i);
  assert.doesNotMatch(workflow,/DATABASE_URL/i);
  assert.doesNotMatch(workflow,/psql\b/i);
  assert.doesNotMatch(workflow,/supabase\s+(db|migration|functions|projects)/i);
});

test('rehearsal cannot invoke live restore or production mutation paths',()=>{
  assert.doesNotMatch(workflow,/begin_backup_restore|stage_backup_restore_chunk|apply_backup_restore|cancel_backup_restore/);
  assert.doesNotMatch(rehearsal,/createClient|\.rpc\(|fetch\(|https?:\/\//);
  assert.doesNotMatch(rehearsal,/insert\(|update\(|delete\(|upsert\(/);
  assert.match(rehearsal,/production_data_accessed:false/);
  assert.match(rehearsal,/production_write_operations:false/);
  assert.match(rehearsal,/live_database_restore_executed:false/);
});

test('synthetic recovery proves current portable backup acceptance and fail-closed cases',()=>{
  assert.match(rehearsal,/complete-current-portable-backup/);
  assert.match(rehearsal,/stale-schema-version/);
  assert.match(rehearsal,/missing-required-table/);
  assert.match(rehearsal,/invalid-storage-scope/);
  assert.match(rehearsal,/cross-location-row/);
  assert.match(rehearsal,/duplicate-record-id/);
  assert.match(rehearsal,/invalid-schema-fingerprint/);
  assert.match(rehearsal,/incomplete-export/);
  assert.match(rehearsal,/scenarios\.every\(scenario=>scenario\.passed\)/);
  assert.match(rehearsal,/if\(!passed\)process\.exit\(1\)/);
});

test('recovery evidence is durable, sanitized, and queryable by exact commit',()=>{
  assert.match(workflow,/actions\/upload-artifact@v4/);
  assert.match(workflow,/recovery-rehearsal-\$\{\{ github\.sha \}\}/);
  assert.match(workflow,/retention-days: 90/);
  assert.match(workflow,/context:'Disaster Recovery Rehearsal'/);
  assert.match(workflow,/state:'pending'/);
  assert.match(workflow,/REGRESSION_OUTCOME/);
  assert.match(workflow,/REHEARSAL_OUTCOME/);
  assert.match(workflow,/EVIDENCE_OUTCOME/);
  assert.match(workflow,/Portable disaster recovery rehearsal passed/);
  assert.match(rehearsal,/storage_object_bytes_covered:false/);
  assert.match(rehearsal,/does not prove that a current offsite production snapshot exists/);
});

test('human production restore remains separately guarded and server-previewed',()=>{
  assert.match(restorePage,/begin_backup_restore/);
  assert.match(restorePage,/stage_backup_restore_chunk/);
  assert.match(restorePage,/preview_backup_restore/);
  assert.match(restorePage,/apply_backup_restore/);
  assert.match(restorePage,/RESTORE MISSING DATA/);
});
