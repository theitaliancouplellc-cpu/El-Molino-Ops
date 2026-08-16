import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BACKUP_CHUNK_ROWS,BACKUP_TABLES} from '../lib/backup-manifest.ts';

const admin=readFileSync('app/admin/page.tsx','utf8');
const restore=readFileSync('app/admin/restore/page.tsx','utf8');

test('backup export is manifest-driven and schema-bound',()=>{
  assert.match(admin,/BACKUP_TABLES/);
  assert.match(admin,/backup_restore_schema_fingerprint/);
  assert.match(admin,/schema_fingerprint/);
  assert.match(admin,/objects_included:false/);
});

test('restore uses only staged transactional recovery RPCs',()=>{
  for(const rpc of ['begin_backup_restore','stage_backup_restore_chunk','preview_backup_restore','apply_backup_restore','cancel_backup_restore'])assert.match(restore,new RegExp(rpc));
  assert.doesNotMatch(restore,/supabase\.from\([^)]*\)\.(insert|upsert|update|delete)\(/);
});

test('restore contract preserves current rows and requires explicit confirmation',()=>{
  assert.match(restore,/RESTORE MISSING DATA/);
  assert.match(restore,/Existing rows are never overwritten/);
  assert.match(restore,/current database row wins/);
  assert.match(restore,/Database recovery, not file-storage backup/);
});

test('browser stages bounded chunks including empty tables',()=>{
  assert.equal(BACKUP_CHUNK_ROWS,250);
  assert.match(restore,/return out\.length\?out:\[\[\]\]/);
  assert.match(restore,/for\(const table of BACKUP_TABLES\)/);
});

test('modern manifest includes all major recovery domains',()=>{
  for(const table of ['schedule_shifts','time_clock_punches','tip_distributions','training_course_assignments','hiring_applicants','onboarding_assignments','cash_control_sessions','inventory_counts'])assert.ok(BACKUP_TABLES.includes(table as any),table);
});
