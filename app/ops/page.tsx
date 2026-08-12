'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { OPS_CATEGORIES, OPS_MODULES, OPS_MODULE_BY_KIND, OpsKind, normalizeOpsData, validateOpsRecord } from '@/lib/ops-modules';

type Profile={app_role:'admin'|'manager'|'employee';location_id:string|null};
type Row={id:string;kind:OpsKind;title:string;status:string;priority:string;sensitivity:string;data:Record<string,unknown>;due_at:string|null;occurred_at:string|null;created_at:string;updated_at:string;archived_at:string|null;deleted_at:string|null};

const blank=()=>({title:'',priority:'normal',due_at:'',data:{} as Record<string,unknown>});
const pretty=(k:string)=>k.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const formatDate=(v:string|null)=>v?new Date(v).toLocaleString():'';

export default function OpsPage(){
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [profile,setProfile]=useState<Profile|null>(null),[rows,setRows]=useState<Row[]>([]);
  const [category,setCategory]=useState('All'),[kind,setKind]=useState<OpsKind>('shift_handoff'),[query,setQuery]=useState(''),[showForm,setShowForm]=useState(false);
  const [draft,setDraft]=useState(blank()),[editing,setEditing]=useState<Row|null>(null),[showArchived,setShowArchived]=useState(false);
  const canManage=profile?.app_role==='admin'||profile?.app_role==='manager';
  const module=OPS_MODULE_BY_KIND[kind];
  const visibleModules=useMemo(()=>OPS_MODULES.filter(m=>(category==='All'||m.category===category)&&(canManage||m.sensitivity==='team')),[category,canManage]);
  const filtered=useMemo(()=>rows.filter(r=>r.kind===kind&&(showArchived?Boolean(r.archived_at):!r.archived_at)&&(!query.trim()||`${r.title} ${JSON.stringify(r.data)}`.toLowerCase().includes(query.toLowerCase()))),[rows,kind,query,showArchived]);

  useEffect(()=>{void load()},[]);
  async function load(){setLoading(true);const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return;}const [p,r]=await Promise.all([supabase.from('profiles').select('app_role,location_id').eq('id',u.user.id).single(),supabase.from('ops_records').select('*').is('deleted_at',null).order('updated_at',{ascending:false}).limit(1000)]);if(p.data)setProfile(p.data as Profile);if(r.error)setMessage(r.error.message);setRows((r.data??[]) as Row[]);setLoading(false)}
  function flash(x:string){setMessage(x);setTimeout(()=>setMessage(''),3500)}
  function selectKind(next:OpsKind){setKind(next);setDraft(blank());setEditing(null);setShowForm(false)}
  function setField(key:string,value:unknown){setDraft(d=>({...d,data:{...d.data,[key]:value}}))}
  function beginEdit(row:Row){setKind(row.kind);setEditing(row);setDraft({title:row.title,priority:row.priority,due_at:row.due_at?row.due_at.slice(0,16):'',data:{...row.data}});setShowForm(true);window.scrollTo({top:0,behavior:'smooth'})}
  function resetForm(){setEditing(null);setDraft(blank());setShowForm(false)}
  async function save(e:FormEvent){e.preventDefault();if(!profile?.location_id)return;const clean=normalizeOpsData(kind,draft.data);const errors=validateOpsRecord(kind,draft.title,clean);if(errors.length){flash(errors[0]);return;}setBusy(true);const {data:u}=await supabase.auth.getUser();if(!u.user){setBusy(false);return;}const payload={location_id:profile.location_id,kind,title:draft.title.trim(),priority:draft.priority,sensitivity:module.sensitivity,data:clean,due_at:draft.due_at?new Date(draft.due_at).toISOString():null,created_by:u.user.id};let result;if(editing){const {created_by,...update}=payload;result=await supabase.from('ops_records').update({...update,updated_by:u.user.id}).eq('id',editing.id).select('id').single()}else result=await supabase.from('ops_records').insert(payload).select('id').single();setBusy(false);if(result.error){flash(result.error.message);return;}await supabase.from('activity_log').insert({location_id:profile.location_id,actor_user_id:u.user.id,action:editing?'updated':'created',entity_type:'ops_record',entity_id:result.data.id,summary:`${editing?'Updated':'Created'} ${module.title}: ${draft.title.trim()}`});resetForm();await load();flash(editing?'Updated.':'Saved.')}
  async function setStatus(row:Row,status:string){const {error}=await supabase.from('ops_records').update({status}).eq('id',row.id);if(error)return flash(error.message);await load();flash(`Marked ${status}.`)}
  async function archive(row:Row){const {error}=await supabase.from('ops_records').update({archived_at:row.archived_at?null:new Date().toISOString()}).eq('id',row.id);if(error)return flash(error.message);await load();flash(row.archived_at?'Restored from archive.':'Archived.')}
  async function remove(row:Row){if(!confirm(`Move “${row.title}” to trash?`))return;const {error}=await supabase.from('ops_records').update({deleted_at:new Date().toISOString()}).eq('id',row.id);if(error)return flash(error.message);await load();flash('Moved to trash.')}

  if(loading)return <div className="full-loader"><Loader2 className="spin"/><span>Opening operations…</span></div>;
  return <div className="app-shell">
    <header className="topbar"><a className="round-button" href="/tools" aria-label="Back"><ArrowLeft/></a><div style={{flex:1}}><div className="brand-kicker">El Molino Ops</div><div className="brand-title">Operations Center</div></div><button className="round-button" onClick={()=>setShowForm(x=>!x)} aria-label="Create record">{showForm?<X/>:<Plus/>}</button></header>
    <main className="page">
      {message&&<div className="toast-message">{message}</div>}
      <div className="page-heading"><h1>Restaurant systems</h1><p>Operational records, logs, maintenance, food safety, inventory, training and communication.</p></div>
      <div className="ops-category-tabs" role="tablist"><button className={category==='All'?'active':''} onClick={()=>setCategory('All')}>All</button>{OPS_CATEGORIES.map(c=><button key={c} className={category===c?'active':''} onClick={()=>setCategory(c)}>{c}</button>)}</div>
      <div className="ops-module-grid">{visibleModules.map(m=><button key={m.kind} onClick={()=>selectKind(m.kind)} className={`ops-module-card ${kind===m.kind?'active':''}`}><b>{m.title}</b><small>{m.description}</small><ChevronRight/></button>)}</div>

      <div className="section-title"><div><h2>{module.title}</h2><span>{module.description}</span></div><button className="btn" onClick={()=>{setEditing(null);setDraft(blank());setShowForm(true)}}><Plus/> Add</button></div>

      {showForm&&<form className="card form" onSubmit={save} style={{marginBottom:16}}>
        <div className="card-title-row"><h3>{editing?'Edit':'New'} {module.title.replace(/s$/,'')}</h3><button type="button" className="icon-action" onClick={resetForm}><X/></button></div>
        <div className="field"><label>Title</label><input className="input" maxLength={200} value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))} placeholder={`Name this ${module.title.toLowerCase().replace(/s$/,'')}`} required/></div>
        {module.fields.map(field=><div className="field" key={field.key}><label>{field.label}{field.required?' *':''}</label>{field.type==='textarea'?<textarea className="textarea" value={String(draft.data[field.key]??'')} onChange={e=>setField(field.key,e.target.value)} required={field.required}/>:field.type==='select'?<select className="select" value={String(draft.data[field.key]??'')} onChange={e=>setField(field.key,e.target.value)} required={field.required}><option value="">Select…</option>{field.options?.map(o=><option key={o}>{o}</option>)}</select>:field.type==='boolean'?<label className="remember-row"><input type="checkbox" checked={Boolean(draft.data[field.key])} onChange={e=>setField(field.key,e.target.checked)}/>{field.label}</label>:<input className="input" type={field.type==='datetime'?'datetime-local':field.type} min={field.min} max={field.max} value={String(draft.data[field.key]??'')} onChange={e=>setField(field.key,e.target.value)} required={field.required} placeholder={field.placeholder}/>}</div>)}
        <div className="two-col"><div className="field"><label>Priority</label><select className="select" value={draft.priority} onChange={e=>setDraft(d=>({...d,priority:e.target.value}))}><option>low</option><option>normal</option><option>high</option><option>urgent</option></select></div><div className="field"><label>Due date / follow-up</label><input className="input" type="datetime-local" value={draft.due_at} onChange={e=>setDraft(d=>({...d,due_at:e.target.value}))}/></div></div>
        <button className="btn" disabled={busy}>{busy?<Loader2 className="spin"/>:<Check/>}{editing?'Save changes':'Create record'}</button>
      </form>}

      <div className="ops-toolbar"><div className="search-box"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={`Search ${module.title.toLowerCase()}…`}/></div><button className="mini-action" onClick={()=>setShowArchived(x=>!x)}>{showArchived?'Current':'Archived'}</button></div>
      <div className="list">{filtered.map(row=><details className="list-item" key={row.id}><summary style={{display:'flex',alignItems:'center',gap:12,width:'100%'}}><div className="list-main"><b>{row.title}</b><small>{row.status} · {row.priority}{row.due_at?` · due ${formatDate(row.due_at)}`:''}</small></div><span className="status">{row.status}</span><ChevronDown/></summary><div className="ops-detail"><dl>{Object.entries(row.data).map(([k,v])=><div key={k}><dt>{pretty(k)}</dt><dd>{typeof v==='boolean'?(v?'Yes':'No'):String(v)}</dd></div>)}</dl><div className="row-actions"><button className="mini-action" onClick={()=>beginEdit(row)}>Edit</button>{row.status!=='complete'&&<button className="mini-action" onClick={()=>setStatus(row,'complete')}>Complete</button>}<button className="mini-action" onClick={()=>archive(row)}>{row.archived_at?'Restore':'Archive'}</button>{canManage&&<button className="mini-action danger-action" onClick={()=>remove(row)}><Trash2/> Trash</button>}</div></div></details>)}{!filtered.length&&<div className="empty-state"><b>No {showArchived?'archived ':''}{module.title.toLowerCase()} yet</b><span>Create the first record when you need it.</span></div>}</div>
    </main>
  </div>
}
