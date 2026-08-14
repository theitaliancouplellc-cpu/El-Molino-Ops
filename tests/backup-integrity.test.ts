import test from 'node:test';
import assert from 'node:assert/strict';
import {BACKUP_FORMAT,validateBackup} from '../lib/round4-hardening.ts';

const LOC='550e8400-e29b-41d4-a716-446655440000';
const ID='6ba7b810-9dad-41d1-80b4-00c04fd430c8';
const base={format:BACKUP_FORMAT,exported_at:'2026-08-14T05:00:00.000Z',location_id:LOC,tables:{tasks:[{id:ID,location_id:LOC,title:'x'}]}};

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

test('complete exports remain valid',()=>{
  assert.equal(validateBackup({...base,errors:[]},LOC).ok,true);
});
