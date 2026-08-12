'use client';

import { useState } from 'react';
import { File, Loader2, Paperclip, Star, StarOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Attachment={id:string;file_name:string;title:string|null;kind:string;storage_bucket:string;storage_path:string};

export default function RecordExtras({recordId,title}:{recordId:string;title:string}){
  const [loaded,setLoaded]=useState(false),[loading,setLoading]=useState(false),[files,setFiles]=useState<Attachment[]>([]),[saved,setSaved]=useState(false),[message,setMessage]=useState('');

  async function load(){
    if(loaded)return;
    setLoading(true);
    const {data:u}=await supabase.auth.getUser();
    if(!u.user){setLoading(false);return;}
    const [links,fav]=await Promise.all([
      supabase.from('entity_file_links').select('file_id').eq('entity_type','ops_record').eq('entity_id',recordId),
      supabase.from('favorites').select('entity_id').eq('user_id',u.user.id).eq('entity_type','ops_record').eq('entity_id',recordId).maybeSingle()
    ]);
    setSaved(Boolean(fav.data));
    const ids=(links.data??[]).map((x:any)=>x.file_id).filter(Boolean);
    if(ids.length){
      const {data}=await supabase.from('files').select('id,file_name,title,kind,storage_bucket,storage_path').in('id',ids).is('deleted_at',null);
      setFiles((data??[]) as Attachment[]);
    }
    await supabase.from('recent_views').upsert({user_id:u.user.id,entity_type:'ops_record',entity_id:recordId,title,href:`/ops?record=${recordId}`,viewed_at:new Date().toISOString()},{onConflict:'user_id,entity_type,entity_id'});
    setLoaded(true);setLoading(false);
  }

  async function toggleSaved(){
    const {data:u}=await supabase.auth.getUser();if(!u.user)return;
    if(saved){
      const {error}=await supabase.from('favorites').delete().eq('user_id',u.user.id).eq('entity_type','ops_record').eq('entity_id',recordId);
      if(error)return setMessage(error.message);setSaved(false);setMessage('Removed from saved.');
    }else{
      const {error}=await supabase.from('favorites').upsert({user_id:u.user.id,entity_type:'ops_record',entity_id:recordId},{onConflict:'user_id,entity_type,entity_id'});
      if(error)return setMessage(error.message);setSaved(true);setMessage('Saved.');
    }
  }

  async function openFile(file:Attachment){
    const {data,error}=await supabase.storage.from(file.storage_bucket).createSignedUrl(file.storage_path,120);
    if(error||!data?.signedUrl)return setMessage(error?.message||'Could not open attachment.');
    window.open(data.signedUrl,'_blank','noopener,noreferrer');
  }

  if(!loaded)return <div className="row-actions" style={{marginTop:10}}><button className="mini-action" onClick={load} disabled={loading}>{loading?<Loader2 className="spin" size={14}/>:<Paperclip size={14}/>} Files & saved</button></div>;
  return <div style={{marginTop:12}}>
    {message&&<small style={{display:'block',marginBottom:8,color:'var(--muted)'}}>{message}</small>}
    <div className="row-actions" style={{flexWrap:'wrap'}}>
      <button className="mini-action" onClick={toggleSaved}>{saved?<StarOff size={14}/>:<Star size={14}/>} {saved?'Unsave':'Save'}</button>
      <a className="mini-action" href={`/capture?entityType=ops_record&entityId=${recordId}`}><Paperclip size={14}/> Attach file</a>
    </div>
    {files.length>0&&<div className="list" style={{marginTop:8}}>{files.map(f=><button key={f.id} className="list-item" onClick={()=>openFile(f)} style={{width:'100%',textAlign:'left'}}><span className="settings-icon"><File size={16}/></span><span className="list-main"><b>{f.title||f.file_name}</b><small>{f.kind}</small></span></button>)}</div>}
    {!files.length&&<small style={{display:'block',marginTop:8,color:'var(--muted)'}}>No attachments yet.</small>}
  </div>;
}
