import fs from 'node:fs';
import path from 'node:path';
import {
  BACKUP_EXCLUSIONS,
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  BACKUP_TABLES,
} from '../lib/backup-manifest';
import {validateBackup} from '../lib/round4-hardening';

const LOCATION_ID='11111111-1111-4111-8111-111111111111';
const OTHER_LOCATION_ID='22222222-2222-4222-8222-222222222222';
const SYNTHETIC_SCHEMA_FINGERPRINT='0123456789abcdef0123456789abcdef';
const outputPath=process.env.RECOVERY_EVIDENCE_PATH||'artifacts/recovery-rehearsal.json';

function syntheticBackup(){
  return {
    format:BACKUP_FORMAT,
    schema_version:BACKUP_SCHEMA_VERSION,
    schema_fingerprint:SYNTHETIC_SCHEMA_FINGERPRINT,
    exported_at:'2026-01-01T00:00:00.000Z',
    location_id:LOCATION_ID,
    manifest:{tables:[...BACKUP_TABLES],excluded:BACKUP_EXCLUSIONS},
    storage:{
      objects_included:false,
      note:'Synthetic recovery rehearsal: storage object bytes are outside the portable JSON backup contract.',
    },
    tables:Object.fromEntries(BACKUP_TABLES.map(table=>[table,[]])),
    errors:[],
  };
}

function clone<T>(value:T):T{return JSON.parse(JSON.stringify(value));}
function runScenario(name:string,value:unknown,expectedOk:boolean,expectedError?:RegExp){
  const check=validateBackup(value,LOCATION_ID);
  const matchedError=expectedError?check.errors.some(error=>expectedError.test(error)):true;
  const passed=check.ok===expectedOk&&matchedError;
  return {
    name,
    passed,
    expected_ok:expectedOk,
    observed_ok:check.ok,
    matched_expected_error:matchedError,
    row_count:check.rowCount,
    errors:check.errors,
  };
}

const complete=syntheticBackup();
const staleVersion=clone(complete);
staleVersion.schema_version=BACKUP_SCHEMA_VERSION+1 as typeof BACKUP_SCHEMA_VERSION;
const missingTable=clone(complete);
delete missingTable.tables[BACKUP_TABLES[BACKUP_TABLES.length-1]];
const invalidStorage=clone(complete) as any;
invalidStorage.storage.objects_included=true;
const crossLocation=clone(complete) as any;
crossLocation.tables.employees=[{id:'33333333-3333-4333-8333-333333333333',location_id:OTHER_LOCATION_ID}];
const duplicateId=clone(complete) as any;
duplicateId.tables.locations=[{id:1},{id:1}];
const invalidFingerprint=clone(complete);
invalidFingerprint.schema_fingerprint='not-a-schema-fingerprint';
const incompleteExport=clone(complete) as any;
incompleteExport.errors=[{table:'employees',error:'synthetic export failure'}];

const scenarios=[
  runScenario('complete-current-portable-backup',complete,true),
  runScenario('stale-schema-version',staleVersion,false,/schema version/i),
  runScenario('missing-required-table',missingTable,false,/missing .*required table/i),
  runScenario('invalid-storage-scope',invalidStorage,false,/storage scope/i),
  runScenario('cross-location-row',crossLocation,false,/another location/i),
  runScenario('duplicate-record-id',duplicateId,false,/duplicate id/i),
  runScenario('invalid-schema-fingerprint',invalidFingerprint,false,/fingerprint/i),
  runScenario('incomplete-export',incompleteExport,false,/incomplete/i),
];

const passed=scenarios.every(scenario=>scenario.passed);
const evidence={
  evidence_type:'portable-backup-contract-recovery-rehearsal',
  exact_sha:process.env.GITHUB_SHA||'local',
  workflow_run_id:process.env.GITHUB_RUN_ID||'local',
  generated_at:new Date().toISOString(),
  backup_format:BACKUP_FORMAT,
  backup_schema_version:BACKUP_SCHEMA_VERSION,
  backup_table_count:BACKUP_TABLES.length,
  storage_object_bytes_covered:false,
  production_data_accessed:false,
  production_write_operations:false,
  live_database_restore_executed:false,
  scope:'Synthetic validation of the portable backup/recovery contract only. This evidence does not prove that a current offsite production snapshot exists.',
  passed,
  scenarios,
};

fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
if(!passed)process.exit(1);
