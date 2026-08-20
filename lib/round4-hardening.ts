import {
  BACKUP_EXCLUSIONS,
  BACKUP_FORMAT,
  BACKUP_MAX_FILE_BYTES,
  BACKUP_MAX_TABLE_ROWS,
  BACKUP_MAX_TOTAL_ROWS,
  BACKUP_SCHEMA_VERSION,
  BACKUP_TABLE_SET,
  BACKUP_TABLES,
} from './backup-manifest';

export {BACKUP_FORMAT};
export const RESTORABLE_TABLES=BACKUP_TABLES;
export type BackupCheck={ok:boolean;errors:string[];warnings:string[];rowCount:number;tables:string[]};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const integerId=/^[0-9]{1,20}$/;
const schemaFingerprint=/^[0-9a-f]{32}$/i;
export function validUuid(v:unknown){return uuid.test(String(v||''))}
export function validSchemaFingerprint(v:unknown){return schemaFingerprint.test(String(v||''))}
export function validRecordId(v:unknown){
  if(validUuid(v))return true;
  if(typeof v==='number')return Number.isSafeInteger(v)&&v>=0;
  return typeof v==='string'&&integerId.test(v);
}
export function validIsoDate(v:unknown){if(typeof v!=='string'||v.length>64)return false;const n=Date.parse(v);return Number.isFinite(n)}
function sameStringSet(value:unknown,expected:readonly string[]){
  if(!Array.isArray(value)||value.some(x=>typeof x!=='string'))return false;
  const got=new Set(value as string[]),want=new Set(expected);
  return got.size===want.size&&[...want].every(x=>got.has(x));
}
export function validateBackup(value:unknown,expectedLocation?:string):BackupCheck{
  const errors:string[]=[],warnings:string[]=[];
  if(!value||typeof value!=='object'||Array.isArray(value))return{ok:false,errors:['Backup root must be an object.'],warnings,rowCount:0,tables:[]};
  const b=value as any;
  if(b.format!==BACKUP_FORMAT)errors.push('Unsupported or legacy backup format. Create a new v5 backup before using full recovery.');
  if(b.schema_version!==BACKUP_SCHEMA_VERSION)errors.push('Backup schema version does not match this recovery engine.');
  if(!validSchemaFingerprint(b.schema_fingerprint))errors.push('Backup schema fingerprint is missing or invalid.');
  if(!validIsoDate(b.exported_at))errors.push('Backup export timestamp is invalid.');
  if(!validUuid(b.location_id))errors.push('Backup location is invalid.');
  if(expectedLocation&&b.location_id!==expectedLocation)errors.push('Backup belongs to a different location.');
  if('errors' in b&&!Array.isArray(b.errors))errors.push('Backup export status is malformed.');
  if(Array.isArray(b.errors)&&b.errors.length>0)errors.push('Backup export was incomplete and reported one or more table errors.');
  if(!b.manifest||typeof b.manifest!=='object'||Array.isArray(b.manifest))errors.push('Backup manifest is missing.');
  else if(!sameStringSet(b.manifest.tables,BACKUP_TABLES))errors.push('Backup manifest does not match the current recovery table set.');
  if(!b.storage||typeof b.storage!=='object'||b.storage.objects_included!==false)errors.push('Backup storage scope is missing or invalid.');
  else warnings.push('Storage object bytes are not included in this JSON recovery backup. File metadata can be recovered, but missing stored files must be restored separately.');
  if(!b.tables||typeof b.tables!=='object'||Array.isArray(b.tables))errors.push('Backup tables are missing.');
  const tables=b.tables&&typeof b.tables==='object'&&!Array.isArray(b.tables)?Object.keys(b.tables):[];
  const unknown=tables.filter(t=>!BACKUP_TABLE_SET.has(t));
  if(unknown.length)errors.push(`Backup contains unsupported table${unknown.length===1?'':'s'}: ${unknown.slice(0,10).join(', ')}${unknown.length>10?'…':''}.`);
  const missing=BACKUP_TABLES.filter(t=>!tables.includes(t));
  if(missing.length)errors.push(`Backup is missing ${missing.length} required table${missing.length===1?'':'s'}: ${missing.slice(0,10).join(', ')}${missing.length>10?'…':''}.`);
  let rowCount=0;
  for(const table of tables){
    const rows=b.tables[table];
    if(!Array.isArray(rows)){errors.push(`${table}: rows must be an array.`);continue}
    if(rows.length>BACKUP_MAX_TABLE_ROWS)errors.push(`${table}: exceeds ${BACKUP_MAX_TABLE_ROWS.toLocaleString()}-row safety limit.`);
    rowCount+=rows.length;
    if(rowCount>BACKUP_MAX_TOTAL_ROWS)errors.push(`Backup exceeds ${BACKUP_MAX_TOTAL_ROWS.toLocaleString()} total rows.`);
    const ids=new Set<string>();
    for(const row of rows){
      if(!row||typeof row!=='object'||Array.isArray(row)){errors.push(`${table}: contains a non-object row.`);continue}
      if('id' in row&&row.id!=null){
        if(!validRecordId(row.id))errors.push(`${table}: contains an invalid record id.`);
        else {const key=String(row.id);if(ids.has(key))errors.push(`${table}: contains a duplicate id.`);else ids.add(key)}
      }
      if('location_id' in row&&row.location_id!=null&&b.location_id&&row.location_id!==b.location_id)errors.push(`${table}: contains a row from another location.`);
    }
  }
  if(rowCount===0)warnings.push('Backup contains no rows.');
  warnings.push(...Object.entries(BACKUP_EXCLUSIONS).map(([table,reason])=>`${table}: ${reason}`));
  return{ok:errors.length===0,errors:[...new Set(errors)].slice(0,100),warnings:[...new Set(warnings)].slice(0,100),rowCount,tables};
}
export function parseBackupText(text:string,expectedLocation?:string){
  if(typeof text!=='string'||text.length===0)return{value:null,check:{ok:false,errors:['Backup file is empty.'],warnings:[],rowCount:0,tables:[]} as BackupCheck};
  if(text.length>BACKUP_MAX_FILE_BYTES)return{value:null,check:{ok:false,errors:[`Backup file exceeds ${Math.round(BACKUP_MAX_FILE_BYTES/1024/1024)} MB validation limit.`],warnings:[],rowCount:0,tables:[]} as BackupCheck};
  try{const value=JSON.parse(text);return{value,check:validateBackup(value,expectedLocation)}}catch{return{value:null,check:{ok:false,errors:['Backup JSON is malformed.'],warnings:[],rowCount:0,tables:[]} as BackupCheck}}
}
export function optimisticConflict<T extends {updated_at?:string|null}>(snapshot:T,current:T){return Boolean(snapshot.updated_at&&current.updated_at&&snapshot.updated_at!==current.updated_at)}
export function boundedText(v:unknown,max=5000){return String(v??'').replace(/\u0000/g,'').trim().slice(0,Math.max(0,Math.min(max,50000)))}
export function safeAriaText(v:unknown,fallback='Item'){const x=boundedText(v,160).replace(/[\r\n]+/g,' ');return x||fallback}
export function safeTabIndex(index:number,count:number){if(!Number.isFinite(index)||count<=0)return-1;return Math.max(0,Math.min(Math.trunc(index),count-1))}
export function nextFocus(index:number,direction:1|-1,count:number){if(count<=0)return-1;const i=safeTabIndex(index,count);return(i+direction+count)%count}
export function shouldAcceptAsyncResult(requestId:number,currentId:number,stillRelevant=true){return stillRelevant&&requestId===currentId}
export function safeCacheName(v:unknown){const s=String(v??'').trim();return /^el-molino-[a-z0-9._-]{1,80}$/i.test(s)?s:null}
export function isRestaurantInternalPath(v:unknown){const s=String(v??'').trim();return s.startsWith('/')&&!s.startsWith('//')&&!s.includes('\\')&&!/[\u0000-\u001f]/.test(s)}
export function chunkRanges(total:number,size=1000){const n=Math.max(0,Math.min(Math.trunc(Number(total)||0),BACKUP_MAX_TOTAL_ROWS)),s=Math.max(1,Math.min(Math.trunc(Number(size)||1000),5000)),out:{from:number;to:number}[]=[];for(let from=0;from<n;from+=s)out.push({from,to:Math.min(n-1,from+s-1)});return out}