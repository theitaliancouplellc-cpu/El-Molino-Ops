'use client';
import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,CheckCircle2,DatabaseBackup,FileCheck2,Loader2,RotateCcw,ShieldAlert,Upload,XCircle} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {BACKUP_CHUNK_ROWS,BACKUP_MAX_FILE_BYTES,BACKUP_TABLES,type BackupEnvelope,type BackupTable} from '@/lib/backup-manifest';
import {parseBackupText,type BackupCheck} from '@/lib/round4-hardening';

type Profile={app_role:string;location_id:string|null};
type PreviewTable={rows:number;new:number;existing:number;conflicts:number};
type Preview={ok:boolean;session_id:string;policy:string;totals:{rows:number;new:number;existing:number;conflicts:number};tables:Record<string,PreviewTable>};
type ApplyResult={ok:boolean;session_id?:string;inserted?:number;skipped_existing?:number;conflicts?:number;error?:string;policy?:string};
const CONFIRM='RESTORE MISSING DATA';

function errText(error:unknown,fallback:string){const msg=typeof error==='object'&&error&&'message' in error?String((error as any).message||''):'';return msg&&msg.length<500?msg:fallback}
function chunks<T>(rows:T[],size=BACKUP_CHUNK_ROWS){const out:T[][]=[];for(let i=0;i<rows.length;i+=size)out.push(rows.slice(i,i+size));return out.length?out:[[]]}

export default function RestorePage(){
  const [profile,setProfile]=useState<Profile|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [check,setCheck]=useState<BackupCheck|null>(null),[backup,setBackup]=useState<BackupEnvelope|null>(null),[file,setFile]=useState(''),[message,setMessage]=useState('');
  const [sessionId,setSessionId]=useState<string|null>(null),[preview,setPreview]=useState<Preview|null>(null),[confirmation,setConfirmation]=useState(''),[progress,setProgress]=useState(''),[applied,setApplied]=useState<ApplyResult|null>(null);
  useEffect(()=>{void load()},[]);
  async function load(){const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}const {data,error}=await supabase.from('profiles').select('app_role,location_id').eq('id',u.user.id).single();if(error)setMessage('Could not verify administrator access.');setProfile(data as Profile);setLoading(false)}
  async function cancelSession(id=sessionId){if(!id)return;try{await supabase.rpc('cancel_backup_restore',{p_session:id})}catch{}finally{if(id===sessionId)setSessionId(null)}}
  async function reset(){if(busy)return;await cancelSession();setCheck(null);setBackup(null);setFile('');setPreview(null);setConfirmation('');setApplied(null);setProgress('');setMessage('')}
  async function choose(e:React.ChangeEvent<HTMLInputElement>){
    const f=e.target.files?.[0];e.target.value='';if(!f||busy)return;
    if(sessionId)await cancelSession(sessionId);
    setSessionId(null);setPreview(null);setApplied(null);setConfirmation('');setProgress('');setBackup(null);setCheck(null);setFile(f.name.slice(0,255));
    if(f.size>BACKUP_MAX_FILE_BYTES){setMessage(`Backup validation is limited to ${Math.round(BACKUP_MAX_FILE_BYTES/1024/1024)} MB per file.`);return}
    let text='';try{text=await f.text()}catch{setMessage('That backup file could not be read.');return}
    const result=parseBackupText(text,profile?.location_id||undefined);setCheck(result.check);
    if(!result.check.ok||!result.value){setMessage('Backup validation found blocking problems. Nothing has been staged or changed.');return}
    setBackup(result.value as BackupEnvelope);setMessage('Local validation passed. Stage the backup to run the server integrity preview before recovery.')
  }
  async function stageAndPreview(){
    if(busy||!backup||!check?.ok||!profile?.location_id)return;setBusy(true);setPreview(null);setApplied(null);setConfirmation('');setMessage('');
    let sid:string|null=null;
    try{
      setProgress('Starting protected recovery session…');
      const {data:started,error:startErr}=await supabase.rpc('begin_backup_restore',{
        p_format:backup.format,p_schema_version:backup.schema_version,p_schema_fingerprint:backup.schema_fingerprint,p_exported_at:backup.exported_at,p_backup_location:backup.location_id,p_manifest_tables:[...BACKUP_TABLES]
      });
      if(startErr||typeof started!=='string')throw new Error(errText(startErr,'Could not start the recovery session.'));
      sid=started;setSessionId(started);
      let call=0;const totalCalls=BACKUP_TABLES.reduce((n,t)=>n+chunks((backup.tables[t]??[]) as unknown[]).length,0);
      for(const table of BACKUP_TABLES){
        const tableChunks=chunks((backup.tables[table]??[]) as unknown[]);
        for(let index=0;index<tableChunks.length;index++){
          call++;setProgress(`Staging ${table} · ${call.toLocaleString()} of ${totalCalls.toLocaleString()} chunks`);
          const {error}=await supabase.rpc('stage_backup_restore_chunk',{p_session:started,p_table:table,p_chunk_index:index,p_rows:tableChunks[index]});
          if(error)throw new Error(errText(error,`Could not stage ${table}.`));
        }
      }
      setProgress('Running server integrity preview…');
      const {data,error}=await supabase.rpc('preview_backup_restore',{p_session:started});
      if(error||!data)throw new Error(errText(error,'Server integrity preview failed.'));
      const p=data as Preview;if(!p.ok)throw new Error('Server integrity preview did not approve this backup.');
      setPreview(p);setProgress('');setMessage(`Server preview passed. ${p.totals.new.toLocaleString()} missing row${p.totals.new===1?'':'s'} can be recovered; existing rows will not be overwritten.`)
    }catch(error){
      if(sid){try{await supabase.rpc('cancel_backup_restore',{p_session:sid})}catch{}}
      setSessionId(null);setProgress('');setMessage(errText(error,'Backup staging failed. Nothing was restored.'))
    }finally{setBusy(false)}
  }
  async function apply(){
    if(busy||!sessionId||!preview||confirmation!==CONFIRM)return;setBusy(true);setApplied(null);setMessage('');setProgress('Applying missing rows in one database transaction…');
    try{
      const {data,error}=await supabase.rpc('apply_backup_restore',{p_session:sessionId,p_confirmation:confirmation});
      if(error)throw new Error(errText(error,'Recovery transaction failed.'));
      const result=(data??{}) as ApplyResult;if(!result.ok)throw new Error(result.error||'Recovery transaction rolled back.');
      setApplied(result);setProgress('');setMessage(`Recovery complete. ${(result.inserted??0).toLocaleString()} missing row${result.inserted===1?'':'s'} restored; ${(result.skipped_existing??0).toLocaleString()} existing row${result.skipped_existing===1?'':'s'} left untouched.`);setSessionId(null)
    }catch(error){setProgress('');setMessage(errText(error,'Recovery transaction failed and was rolled back.'))}finally{setBusy(false)}
  }
  const interesting=useMemo(()=>preview?Object.entries(preview.tables).filter(([,v])=>v.rows||v.new||v.conflicts).sort((a,b)=>b[1].new-a[1].new||b[1].conflicts-a[1].conflicts):[],[preview]);
  if(loading)return <div className="full-loader"><Loader2 className="spin"/></div>;
  if(!profile||profile.app_role!=='admin')return <main className="page"><a href="/admin">‹ Back</a><div className="empty-state"><ShieldAlert/><b>Admin access required</b></div></main>;
  return <div className="app-shell"><header className="topbar"><a className="round-button" href="/admin" aria-label="Back to Admin Center"><ArrowLeft/></a><div className="brand-title">Backup Recovery</div></header><main className="page">
    {message&&<div className="toast-message" role="status">{message}</div>}
    <div className="page-heading"><h1>Recover missing restaurant data</h1><p>Recovery is conservative: the server validates the complete backup, inserts only rows that are missing, and never overwrites an existing row.</p></div>
    <div className="notice"><ShieldAlert/><div><b>Database recovery, not file-storage backup</b><small>This JSON can recover database records and file metadata. It does not contain uploaded photo, video, audio, or document bytes. Time-clock PIN hashes, runtime counters, device push endpoints, and internal permission maps are intentionally excluded.</small></div></div>
    <label className="drop-zone" style={{marginTop:14}}><Upload/><b>Choose an El Molino Ops v4 recovery backup</b><small>JSON · up to {Math.round(BACKUP_MAX_FILE_BYTES/1024/1024)} MB</small><input hidden type="file" accept="application/json,.json" disabled={busy} onChange={choose}/></label>
    {check&&<section className="card" style={{marginTop:16}}><div className="card-title-row"><h3>{check.ok?'Local validation passed':'Validation blocked'}</h3>{check.ok?<FileCheck2/>:<XCircle/>}</div><p>{file} · {check.tables.length} tables · {check.rowCount.toLocaleString()} rows</p>{check.errors.length>0&&<div><b>Blocking errors</b><ul>{check.errors.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}{check.warnings.length>0&&<details><summary><b>Recovery exclusions and warnings ({check.warnings.length})</b></summary><ul>{check.warnings.map((x,i)=><li key={i}>{x}</li>)}</ul></details>}{check.ok&&!preview&&!applied&&<div className="row-actions" style={{marginTop:14}}><button className="btn" disabled={busy||!backup} onClick={stageAndPreview}>{busy?<Loader2 className="spin"/>:<DatabaseBackup/>} Stage & run server preview</button><button className="btn secondary" disabled={busy} onClick={reset}><RotateCcw/> Reset</button></div>}</section>}
    {progress&&<div className="notice" style={{marginTop:14}}><Loader2 className="spin"/><div><b>Recovery check in progress</b><small>{progress}</small></div></div>}
    {preview&&<section className="card" style={{marginTop:16}}><div className="card-title-row"><h3>Server integrity preview</h3><CheckCircle2/></div><div className="stat-grid"><div><span>Total rows</span><b>{preview.totals.rows.toLocaleString()}</b></div><div><span>Missing</span><b>{preview.totals.new.toLocaleString()}</b></div><div><span>Already present</span><b>{preview.totals.existing.toLocaleString()}</b></div><div><span>Conflicts</span><b>{preview.totals.conflicts.toLocaleString()}</b></div></div><div className="notice" style={{marginTop:12}}><b>Existing rows are never overwritten.</b> A conflict means the same primary key exists with different data; the current database row wins and the backup copy is skipped.</div>{interesting.length>0&&<div className="table-wrap" style={{marginTop:12}}><table><thead><tr><th>Table</th><th>Rows</th><th>Missing</th><th>Existing</th><th>Conflicts</th></tr></thead><tbody>{interesting.map(([name,v])=><tr key={name}><td>{name}</td><td>{v.rows}</td><td>{v.new}</td><td>{v.existing}</td><td>{v.conflicts}</td></tr>)}</tbody></table></div>}{!applied&&<div style={{marginTop:16}}><label className="field"><span>Type <b>{CONFIRM}</b> to enable recovery</span><input className="input" autoComplete="off" value={confirmation} disabled={busy} onChange={e=>setConfirmation(e.target.value)} placeholder={CONFIRM}/></label><div className="row-actions" style={{marginTop:12}}><button className="btn" disabled={busy||confirmation!==CONFIRM} onClick={apply}>{busy?<Loader2 className="spin"/>:<DatabaseBackup/>} Restore missing data</button><button className="btn secondary" disabled={busy} onClick={reset}>Cancel recovery</button></div></div>}</section>}
    {applied?.ok&&<section className="card" style={{marginTop:16}}><div className="card-title-row"><h3>Recovery completed</h3><CheckCircle2/></div><p><b>{(applied.inserted??0).toLocaleString()}</b> missing rows restored. <b>{(applied.skipped_existing??0).toLocaleString()}</b> existing rows were left untouched. <b>{(applied.conflicts??0).toLocaleString()}</b> conflicts were preserved in favor of the current database.</p><div className="row-actions"><a className="btn" href="/admin">Return to Admin Center</a><button className="btn secondary" onClick={reset}>Validate another backup</button></div></section>}
  </main></div>
}
