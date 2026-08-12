'use client';

import { use, useEffect, useState } from 'react';
import { ArrowLeft, File, Loader2, Paperclip, Star, StarOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Row={id:string;kind:string;title:string;status:string;priority:string;data:Record<string,unknown>;due_at:string|null;created_at:string;updated_at:string};
type Attachment={id:string;file_name:string;title:string|null;kind:string;storage_bucket:string;storage_path:string};
const pretty=(x:string)=>x.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());

export default function OpsRecordPage({params}:{params:Promise<{id:string}>}){
  const {id}=use(params);
  const [loading,setLoading]=useState(true),[message,setMessage]=useState(''),[row,setRow]=useState<Row|null>(null),[files,setFiles]=useState<Attachment[]>([]),[saved,setSaved]=useState(false);
  useEffect(()=>{void load()},[id]);
  async function load(){
    setLoading(true);const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return;}
    const [r,links,fav]=await Promise.all([
      supabase.from('ops_records').select('id,kind,title,status,priority,data,due_at,created_at,updated_at').eq('id',id).is('deleted_at',null).single(),
      supabase.from('entity_file_links').select('file_id').eq('entity_type','ops_record').eq('entity_id',id),
      supabase.from('favorites').select('entity_id').eq('user_id',u.user.id).eq('entity_type','ops_record').eq('entity_id',id).maybeSingle()
    ]);
    if(r.error){setMessage(r.error.message);setLoading(false);return;}const record=r.data as Row;setRow(record);setSaved(Boolean(fav.data));
    const ids=(links.data??[]).map((x:any)=>x.file_id).filter(Boolean);if(ids.length){const {data}=await supabase.from('files').select('id,file_name,title,kind,storage_bucket,storage_path').in('id',ids).is('deleted_at',null);setFiles((data??[]) as Attachment[]);}else setFiles([]);
    await supabase.from('recent_views').upsert({user_id:u.user.id,entity_type:'ops_record',entity_id:id,title:record.title,href:`/ops-record/${id}`,viewed_at:new Date().toISOString()},{onConflict:'user_id,entity_type,entity_id'});
    setLoading(false);
  }
  async function toggleSaved(){const {data:u}=await supabase.auth.getUser();if(!u.user)return;if(saved){const {error}=await supabase.from('favorites').delete().eq('user_id',u.user.id).eq('entity_type','ops_record').eq('entity_id',id);if(error)return setMessage(error.message);setSaved(false);setMessage('Removed from saved.');}else{const {error}=await supabase.from('favorites').upsert({user_id:u.user.id,entity_type:'ops_record',entity_id:id},{onConflict:'user_id,entity_type,entity_id'});if(error)return setMessage(error.message);setSaved(true);setMessage('Saved.');}}
  async function openFile(file:Attachment){const {data,error}=await supabase.storage.from(file.storage_bucket).createSignedUrl(file.storage_path,120);if(error||!data?.signedUrl)return setMessage(error?.message||'Could not open attachment.');window.open(data.signedUrl,'_blank','noopener,noreferrer');}
  if(loading)return <div className="full-loader"><Loader2 className="spin"/><span>Opening record…</span></div>;
  if(!row)return <main className="page"><a className="back-link" href="/ops">‹ Operations</a><div className="empty-state"><b>Record unavailable</b><span>{message||'This record could not be loaded.'}</span></div></main>;
  return <div className="app-shell"><header className="topbar"><a className="round-button" href={`/ops?kind=${row.kind}`} aria-label="Back"><ArrowLeft/></a><div style={{flex:1}}><div className="brand-kicker">{pretty(row.kind)}</div><div className="brand-title">{row.title}</div></div><button className="round-button" onClick={toggleSaved} aria-label={saved?'Remove saved item':'Save item'}>{saved?<StarOff/>:<Star/>}</button></header><main className="page">{message&&<div className="toast-message">{message}</div>}<div className="card" style={{padding:18}}><div className="card-title-row"><h2>{row.title}</h2><span className="status">{row.status}</span></div><p style={{color:'var(--muted)',marginTop:4}}>{pretty(row.kind)} · {row.priority} priority{row.due_at?` · due ${new Date(row.due_at).toLocaleString()}`:''}</p><dl className="ops-detail">{Object.entries(row.data||{}).map(([k,v])=><div key={k} style={{marginTop:10}}><dt style={{fontSize:11,color:'var(--muted)'}}>{pretty(k)}</dt><dd style={{margin:0,marginTop:3}}>{typeof v==='boolean'?(v?'Yes':'No'):String(v)}</dd></div>)}</dl><div className="row-actions" style={{marginTop:16}}><a className="mini-action" href={`/capture?entityType=ops_record&entityId=${id}`}><Paperclip size={14}/> Attach file</a><a className="mini-action" href={`/ops?kind=${row.kind}`}>View all {pretty(row.kind)}</a></div></div><div className="section-title"><h2>Attachments</h2><span>{files.length}</span></div>{files.length?<div className="list">{files.map(f=><button key={f.id} className="list-item" onClick={()=>openFile(f)} style={{width:'100%',textAlign:'left'}}><span className="settings-icon"><File/></span><span className="list-main"><b>{f.title||f.file_name}</b><small>{f.kind}</small></span></button>)}</div>:<div className="empty-state"><Paperclip/><b>No attachments yet</b><span>Add a photo, document, video or voice note to this record.</span></div>}</main></div>;
}
