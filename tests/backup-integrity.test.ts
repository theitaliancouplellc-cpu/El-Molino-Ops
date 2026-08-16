import test from 'node:test';
import assert from 'node:assert/strict';
import {BACKUP_FORMAT,BACKUP_SCHEMA_VERSION,BACKUP_TABLES} from '../lib/backup-manifest';
import {validateBackup} from '../lib/round4-hardening.ts';

const LOC='550e8400-e29b-41d4-a716-446655440000';
const ID='6ba7b810-9dad-41d1-80b4-00c04fd430c8';
const emptyTables=Object.fromEntries(BACKUP_TABLES.map(t=>[t,[]]));
const base={
  format:BACKUP_FORMAT,
  schema_version:BACKUP_SCHEMA_VERSION,
  exported_at:'2026-08-14T05:00:00.000Z',
  location_id:LOC,
  manifest:{tables:[...BACKUP_TABLES],excluded:{}},
  tables:{...emptyTables,tasks:[{id:ID,location_id:LOC,title:'x'}]},
};

test('dry-run rejects an export that reports table failures',()=>{
  const check=validateBackup({...base,errors:[{table:'files',error:'table export failed'}]},LOC);
  assert.equal(check.ok,false);
  assert.ok(check.errors.some(x=>x.includes('incomplete')));
});

test('dry-run rejects malformed export-status metadata',()=>{
  const check=validateBackup({...base,errors:'files failed'},LOC);
  assert.equal(check.ok,false);
  assert.ok(check.errors.some(x=>x.includes('status is malformed')));
});

test('complete v4 exports remain valid',()=>{
  assert.equal(validateBackup({...base,errors:[]},LOC).ok,true);
});

test('legacy or partial backups cannot masquerade as full recovery sources',()=>{
  const legacy=validateBackup({format:'el-molino-ops-backup-v3',exported_at:base.exported_at,location_id:LOC,tables:{tasks:[]},errors:[]},LOC);
  assert.equal(legacy.ok,false);
  assert.ok(legacy.errors.some(x=>x.includes('legacy')));
  assert.ok(legacy.errors.some(x=>x.includes('missing')));
});

test('numeric audit ids are valid in modern backups',()=>{
  const tables={...emptyTables,time_clock_punch_audit:[{id:42,location_id:LOC,action:'test'}]};
  assert.equal(validateBackup({...base,tables,errors:[]},LOC).ok,true);
});
