'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { laborPercent, salesPerLaborHour } from '@/lib/performance';
import styles from '../ops-tools.module.css';
import { businessDateInZone } from '@/lib/intermediate-hardening';

type Profile={app_role:'admin'|'manager'|'employee';location_id:string|null};
type Perf={business_date:string;net_sales:number;labor_cost:number;labor_hours:number;guest_count:number};
type Task={id:string;title:string;priority:string;status:string;due_at:string|null};
type LogData={shift?:string;summary?:string;staffing?:string;guest_issues?:string;items_86?:string;maintenance?:string;safety?:string;wins?:string;follow_up?:string};
type Log={id:string;title:string;status:string;priority:string;data:LogData;occurred_at:string|null;created_at:string};
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n)||0);
const today=()=>businessDateInZone();

export default function LogbookPage(){
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[profile,setProfile]=useState<Profile|null>(null),[perf,setPerf]=useState<Perf|null>(null),[tasks,setTasks]=useState<Task[]>([]),[logs,setLogs]=useState<Log[]>([]),[message,setMessage]=useState('');
  const [form,setForm]=useState({title:'',shift:'PM',summary:'',staffing:'',guest_issues:'',items_86:'',maintenance:'',safety:'',wins:'',follow_up:'',priority:'normal'});
  useEffect(()=>{void init()},[]);
  async function init(){const {data:u}=await supabase.auth.getUser();if(!u.user){window.location.href='/';return;}const {data:p}=await supabase.from('profiles').select('app_role,location_id').eq('id',u.user.id).single();setProfile((p||null) as Profile|null);if(p?.location_id&&['admin','manager'].includes(p.app_role))await load(p.location_id);setReady(true);}
  async function load(locationId=profile?.location_id||''){if(!locationId)return;const [pr,t,l]=await Promise.all([
    supabase.from('restaurant_daily_performance').select('business_date,net_sales,labor_cost,labor_hours,guest_count').eq('location_id',locationId).eq('business_date',today()).maybeSingle(),
    supabase.from('tasks').select('id,title,priority,status,due_at').eq('location_id',locationId).is('deleted_at',null).not('status','in','("done","cancelled")').order('created_at',{ascending:false}).limit(50),
    supabase.from('ops_records').select('id,title,status,priority,data,occurred_at,created_at').eq('location_id',locationId).eq('kind','manager_log').is('deleted_at',null).order('occurred_at',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}).limit(60)
  ]);if(pr.data)setPerf(pr.data as Perf);else setPerf(null);setTasks((t.data??[]) as Task[]);setLogs((l.data??[]) as Log[]);if(pr.error||t.error||l.error)setMessage('Some MOD dashboard data could not be loaded.');}
  const openFollowups=useMemo(()=>logs.filter(x=>x.status==='active'&&String(x.data?.follow_up||'').trim()).length,[logs]);
  const urgentTasks=useMemo(()=>tasks.filter(x=>['urgent','high'].includes(x.priority)).length,[tasks]);
  async function save(e:FormEvent){e.preventDefault();if(!profile?.location_id||busy||!form.summary.trim())return;setBusy(true);setMessage('');try{const {data:u}=await supabase.auth.getUser();if(!u.user)return;const title=(form.title.trim()||`${form.shift} shift log — ${new Date().toLocaleDateString()}`).slice(0,200);const data:LogData={shift:form.shift,summary:form.summary.trim().slice(0,8000),staffing:form.staffing.trim().slice(0,4000),guest_issues:form.guest_issues.trim().slice(0,4000),items_86:form.items_86.trim().slice(0,2000),maintenance:form.maintenance.trim().slice(0,4000),safety:form.safety.trim().slice(0,4000),wins:form.wins.trim().slice(0,3000),follow_up:form.follow_up.trim().slice(0,4000)};const {error}=await supabase.from('ops_records').insert({location_id:profile.location_id,kind:'manager_log',title,status:'active',priority:form.priority,sensitivity:'manager',data,tags:['manager-log',form.shift.toLowerCase()],occurred_at:new Date().toISOString(),created_by:u.user.id,updated_by:u.user.id});if(error)throw error;setForm({title:'',shift:'PM',summary:'',staffing:'',guest_issues:'',items_86:'',maintenance:'',safety:'',wins:'',follow_up:'',priority:'normal'});setMessage('Manager log saved for handoff.');await load();}catch{setMessage('Could not save the manager log.');}finally{setBusy(false)}}
  async function resolve(id:string){if(busy)return;setBusy(true);try{const {data:u}=await supabase.auth.getUser();if(!u.user)return;const {error}=await supabase.from('ops_records').update({status:'resolved',archived_at:new Date().toISOString(),updated_by:u.user.id,updated_at:new Date().toISOString()}).eq('id',id).eq('kind','manager_log');if(error)throw error;await load();setMessage('Follow-up resolved.');}catch{setMessage('Could not resolve that follow-up.');}finally{setBusy(false)}}
  if(!ready)return <main className={styles.page}>Loading manager logbook…</main>;
  if(!profile?.location_id||!['admin','manager'].includes(profile.app_role))return <main className={styles.page}><div className={styles.top}><div><h1>Manager Logbook</h1><p>MOD handoff and sensitive shift notes.</p></div><Link className={styles.back} href="/">Back</Link></div><div className={styles.error}>Manager access is required.</div></main>;
  return <main className={styles.page}>
    <div className={styles.top}><div><h1>Manager Logbook</h1><p>What happened, what matters now, and what the next MOD needs to know.</p></div><Link className={styles.back} href="/">Back to Ops</Link></div>
    {message&&<div className={message.startsWith('Could not')||message.startsWith('Some')?styles.error:styles.notice}>{message}</div>}
    <div className={styles.grid}><Metric label="Today net sales" value={perf?money(perf.net_sales):'Not entered'}/><Metric label="Today labor %" value={perf?`${laborPercent(perf.net_sales,perf.labor_cost).toFixed(1)}%`:'—'}/><Metric label="Sales / labor hr" value={perf?money(salesPerLaborHour(perf.net_sales,perf.labor_hours)):'—'}/><Metric label="Open follow-ups" value={String(openFollowups)} detail={`${urgentTasks} high/urgent tasks`}/></div>
    <section className={styles.section}><div className={styles.card}><h2>New shift handoff</h2><form onSubmit={save}><div className={styles.formGrid}>
      <Field label="Shift"><select value={form.shift} onChange={e=>setForm({...form,shift:e.target.value})}><option>AM</option><option>PM</option><option>Mid</option><option>Closing</option></select></Field>
      <Field label="Priority"><select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field>
      <Field label="Title (optional)" wide><input maxLength={200} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></Field>
      <Field label="Shift summary" wide><textarea required maxLength={8000} value={form.summary} onChange={e=>setForm({...form,summary:e.target.value})}/></Field>
      <Field label="Staffing / call-outs"><textarea maxLength={4000} value={form.staffing} onChange={e=>setForm({...form,staffing:e.target.value})}/></Field>
      <Field label="Guest issues / recoveries"><textarea maxLength={4000} value={form.guest_issues} onChange={e=>setForm({...form,guest_issues:e.target.value})}/></Field>
      <Field label="86'd / low items"><textarea maxLength={2000} value={form.items_86} onChange={e=>setForm({...form,items_86:e.target.value})}/></Field>
      <Field label="Maintenance"><textarea maxLength={4000} value={form.maintenance} onChange={e=>setForm({...form,maintenance:e.target.value})}/></Field>
      <Field label="Safety / sanitation"><textarea maxLength={4000} value={form.safety} onChange={e=>setForm({...form,safety:e.target.value})}/></Field>
      <Field label="Wins / recognition"><textarea maxLength={3000} value={form.wins} onChange={e=>setForm({...form,wins:e.target.value})}/></Field>
      <Field label="Follow-up for next MOD" wide><textarea maxLength={4000} value={form.follow_up} onChange={e=>setForm({...form,follow_up:e.target.value})}/></Field>
    </div><div className={styles.actions}><button className={styles.button} disabled={busy}>Save handoff</button></div></form></div></section>
    <section className={styles.section}><h2>Recent manager logs</h2><div className={styles.list}>{logs.length?logs.map(log=><article className={styles.entry} key={log.id}><div className={styles.entryHead}><div><h3>{log.title}</h3><small>{log.data?.shift||'Shift'} · {new Date(log.occurred_at||log.created_at).toLocaleString()}</small></div><span className={styles.pill}>{log.priority} · {log.status}</span></div><div className={styles.details}>{detail('Summary',log.data?.summary)}{detail('Staffing',log.data?.staffing)}{detail('Guest issues',log.data?.guest_issues)}{detail("86'd / low",log.data?.items_86)}{detail('Maintenance',log.data?.maintenance)}{detail('Safety',log.data?.safety)}{detail('Wins',log.data?.wins)}{detail('Follow-up',log.data?.follow_up)}</div>{log.status==='active'&&log.data?.follow_up&&<div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>resolve(log.id)}>Mark follow-up resolved</button></div>}</article>):<div className={styles.empty}>No manager logs yet.</div>}</div></section>
  </main>;
}
function Metric({label,value,detail}:{label:string;value:string;detail?:string}){return <div className={styles.metric}><span>{label}</span><strong>{value}</strong>{detail&&<small className={styles.muted}>{detail}</small>}</div>}
function Field({label,children,wide=false}:{label:string;children:React.ReactNode;wide?:boolean}){return <label className={`${styles.field} ${wide?styles.wide:''}`}><span>{label}</span>{children}</label>}
function detail(label:string,value?:string){return value?.trim()?<div className={styles.detail} key={label}><b>{label}</b><span>{value}</span></div>:null}
