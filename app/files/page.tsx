'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, File, Image, Loader2, Mic, Search, Trash2, Video } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Row={id:string;file_name:string;mime_type:string|null;size_bytes:number|null;storage_bucket:string;storage_path:string;kind:string;title:string|null;tags:string[];created_at:string};
type Link={entity_type:string;entity_id:string;file_id:string};

const icon=(kind:string)=>kind==='photo'?Image:kind==='video'?Video:kind==='audio'?Mic:File;
const size=(n:number|null)=>!n?'':n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;

export default function FilesPage(){
 const [loading,setLoading]=useState(true),[message,setMessage]=useState(''),[rows,setRows]=useState<Row[]>([]),[links,setLinks]=useState<Link[]>([]),[q,setQ]=useState('');
 useEffect(()=>{void load()},[]);
 async function load(){setLoading(true);const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return;}const [f,l]=await Promise.all([supabase.from('files').select('id,file_name,mime_type,size_bytes,storage_bucket,storage_path,kind,title,tags,created_at').is('deleted_at',null).order('created_at',{ascending:false}).limit(1000),supabase.from('entity_file_links').select('entity_type,entity_id,file_id')]);if(f.error)setMessage(f.error.message);setRows((f.data??[]) as Row[]);setLinks((l.data??[]) as Link[]);setLoading(false)}
 const filtered=useMemo(()=>rows.filter(r=>!q.trim()||`${r.title||''} ${r.file_name} ${r.kind} ${(r.tags||[]).join(' ')}`.toLowerCase().includes(q.toLowerCase())),[rows,q]);
 async function open(row:Row){const {data,error}=await supabase.storage.from(row.storage_bucket).createSignedUrl(row.storage_path,120);if(error||!data?.signedUrl){setMessage(error?.message||'Could not open file.');return;}window.open(data.signedUrl,'_blank','noopener,noreferrer')}
 async function remove(row:Row){if(!confirm(`Move “${row.file_name}” to trash?`))return;const {error}=await supabase.from('files').update({deleted_at:new Date().toISOString()}).eq('id',row.id);if(error){setMessage(error.message);return;}await load();setMessage('File moved to trash. Original storage is preserved for recovery.')}
 if(loading)return <div className="full-loader"><Loader2 className="spin"/><span>Opening files…</span></div>;
 return <div className="app-shell"><header className="topbar"><a className="round-button" href="/tools" aria-label="Back"><ArrowLeft/></a><div style={{flex:1}}><div className="brand-kicker">El Molino Ops</div><div className="brand-title">Files & Media</div></div></header><main className="page">{message&&<div className="toast-message">{message}</div>}<div className="page-heading"><h1>Private file library</h1><p>Original photos, videos, voice notes and documents stay preserved and searchable.</p></div><div className="search-box" style={{marginBottom:14}}><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search files…"/></div><div className="list">{filtered.map(r=>{const Icon=icon(r.kind);const refs=links.filter(l=>l.file_id===r.id);return <div className="list-item" key={r.id}><span className="settings-icon"><Icon/></span><button className="list-main" style={{textAlign:'left',background:'none',border:0,color:'inherit'}} onClick={()=>open(r)}><b>{r.title||r.file_name}</b><small>{r.kind} · {size(r.size_bytes)} · {new Date(r.created_at).toLocaleString()}</small>{refs.length>0&&<small>Attached to {refs.length} record{refs.length===1?'':'s'}: {refs.map(x=>x.entity_type.replace(/_/g,' ')).join(', ')}</small>}</button><button className="icon-action danger-action" onClick={()=>remove(r)} aria-label="Trash file"><Trash2 size={15}/></button></div>})}{!filtered.length&&<div className="empty-state"><File/><b>No matching files</b><span>Captured photos, voice notes and documents will appear here.</span></div>}</div></main></div>;
}
