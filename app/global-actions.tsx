'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Camera, ClipboardCheck, FileText, Menu as MenuIcon, Search, Settings, Users, Wrench, X, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Result={entity_type:string;entity_id:string;title:string;subtitle:string;href:string;rank:number};
type Command={title:string;subtitle:string;href:string;keywords:string;icon:any};

const commands:Command[]=[
  {title:'Today',subtitle:'Daily dashboard',href:'/',keywords:'home today dashboard',icon:Zap},
  {title:'Run the Shift',subtitle:'Opening, mid-shift and closing',href:'/shift',keywords:'opening closing mid shift checklist',icon:ClipboardCheck},
  {title:'Task Center',subtitle:'Assignments and recurring work',href:'/tasks',keywords:'tasks assignments recurring due',icon:ClipboardCheck},
  {title:'Operations Center',subtitle:'Logs, maintenance, safety, inventory and training',href:'/ops',keywords:'maintenance incidents equipment vendors temperature waste inventory recipe training',icon:Wrench},
  {title:'Capture Studio',subtitle:'Photos, video, voice and files',href:'/capture',keywords:'camera photo voice upload file capture',icon:Camera},
  {title:'Calendar',subtitle:'Dated operational work',href:'/calendar',keywords:'calendar schedule events due',icon:CalendarDays},
  {title:'Menu Catalog',subtitle:'Structured menu data',href:'/menu',keywords:'menu item ingredient price category',icon:MenuIcon},
  {title:'Team',subtitle:'Employees and training',href:'/?tab=team',keywords:'employees staff people training team',icon:Users},
  {title:'Ask AI',subtitle:'El Molino assistant',href:'/?tab=ai',keywords:'assistant ai ask chat',icon:Search},
  {title:'Account & Security',subtitle:'Profile and session controls',href:'/account',keywords:'account security password profile sign out',icon:Settings},
  {title:'New maintenance ticket',subtitle:'Report equipment or facility issue',href:'/ops?kind=maintenance_ticket&new=1',keywords:'new create maintenance repair broken',icon:Wrench},
  {title:'New incident report',subtitle:'Document an incident',href:'/ops?kind=incident&new=1',keywords:'new incident accident safety',icon:FileText},
  {title:'New shift handoff',subtitle:'Pass notes to the next manager',href:'/ops?kind=shift_handoff&new=1',keywords:'handoff manager next shift',icon:ClipboardCheck},
  {title:'New temperature log',subtitle:'Record food or equipment temperature',href:'/ops?kind=temperature_log&new=1',keywords:'temp food safety refrigeration',icon:ClipboardCheck},
];

export default function GlobalActions(){
  const [open,setOpen]=useState(false),[q,setQ]=useState(''),[results,setResults]=useState<Result[]>([]),[signedIn,setSignedIn]=useState(false);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{supabase.auth.getSession().then(({data})=>setSignedIn(Boolean(data.session)));const {data:l}=supabase.auth.onAuthStateChange((_e,s)=>setSignedIn(Boolean(s)));const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setOpen(v=>!v)}if(e.key==='Escape')setOpen(false)};window.addEventListener('keydown',key);return()=>{l.subscription.unsubscribe();window.removeEventListener('keydown',key)}},[]);
  useEffect(()=>{if(!open){setQ('');setResults([])}},[open]);
  useEffect(()=>{if(timer.current)clearTimeout(timer.current);if(!signedIn||q.trim().length<2){setResults([]);return;}timer.current=setTimeout(async()=>{const {data}=await supabase.rpc('global_search',{q:q.trim()});setResults((data??[]).slice(0,8) as Result[])},180);return()=>{if(timer.current)clearTimeout(timer.current)}},[q,signedIn]);
  const filtered=useMemo(()=>{const s=q.toLowerCase().trim();return commands.filter(c=>!s||`${c.title} ${c.subtitle} ${c.keywords}`.toLowerCase().includes(s)).slice(0,10)},[q]);
  function go(href:string,title:string){try{const old=JSON.parse(localStorage.getItem('elmolino_recent_commands')||'[]') as any[];localStorage.setItem('elmolino_recent_commands',JSON.stringify([{href,title,at:Date.now()},...old.filter(x=>x.href!==href)].slice(0,8)))}catch{}location.href=href}
  if(!open||!signedIn)return null;
  return <div className="command-backdrop" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><div className="command-palette"><div className="command-input"><Search/><input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search or jump anywhere…" aria-label="Search commands"/><button onClick={()=>setOpen(false)} aria-label="Close"><X/></button></div><div className="command-list">{filtered.map(c=>{const Icon=c.icon;return <button key={c.href+c.title} onClick={()=>go(c.href,c.title)}><span className="settings-icon"><Icon/></span><span><b>{c.title}</b><small>{c.subtitle}</small></span></button>})}{results.length>0&&<div className="command-section">Internal results</div>}{results.map(r=><button key={`${r.entity_type}:${r.entity_id}`} onClick={()=>go(r.href,r.title)}><span className="settings-icon"><Search/></span><span><b>{r.title}</b><small>{r.subtitle||r.entity_type}</small></span></button>)}{!filtered.length&&!results.length&&<div className="empty-state"><b>No matches</b><span>Try a feature, employee, task, procedure or operational term.</span></div>}</div><div className="command-hint">Ctrl/⌘ K opens this anywhere · Esc closes</div></div></div>;
}
