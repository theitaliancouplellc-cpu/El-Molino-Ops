'use client';

import {useEffect,useState} from 'react';
import {ArrowLeft,Coins,RefreshCw} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import styles from '../employee.module.css';

type Distribution={run_id:string;pool_name:string;starts_on:string;ends_on:string;eligible_hours:number;weight:number;amount:number};
type Report={starts_on:string;ends_on:string;total:number;distributions:Distribution[]};
const today=()=>new Date().toISOString().slice(0,10);
const monthStart=()=>`${today().slice(0,8)}01`;
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);

export default function EmployeeTips(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[range,setRange]=useState({start:monthStart(),end:today()}),[report,setReport]=useState<Report|null>(null);
 useEffect(()=>{void init()},[]);
 async function init(){
  const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('app_role').eq('id',u.user.id).single();if(p.error||p.data?.app_role!=='employee'){location.href=p.data?'/manager':'/';return}
  const st=await supabase.rpc('employee_self_setup_status',{});if(st.error||st.data?.status!=='approved'){location.href='/employee/setup';return}
  await refresh(range.start,range.end);setReady(true)
 }
 async function refresh(start=range.start,end=range.end){
  if(busy||!start||!end||end<start)return setMessage('Choose a valid date range.');setBusy(true);setMessage('');
  const {data,error}=await supabase.rpc('my_tip_report',{p_starts_on:start,p_ends_on:end});
  if(error){setReport(null);setMessage(error.message.includes('visibility is disabled')?'Tip history is not currently visible to employees.':error.message)}else setReport(data as Report);setBusy(false)
 }
 const rows=report?.distributions||[];
 const hours=rows.reduce((sum,x)=>sum+Number(x.eligible_hours||0),0);
 if(!ready)return <main className={styles.page}>Opening your tips…</main>;
 return <main className={styles.page}>
  <header className={styles.header}><a className={styles.iconButton} href="/employee" aria-label="Back to staff home"><ArrowLeft size={20}/></a><div className={styles.brand}><small>El Molino Staff</small><strong>My Tips</strong></div><button className={styles.iconButton} disabled={busy} aria-label="Refresh tip history" onClick={()=>refresh()}><RefreshCw size={18}/></button></header>
  {message&&<div className={message.toLowerCase().includes('not currently')||message.toLowerCase().includes('choose')?styles.notice:styles.error}>{message}</div>}
  <section className={styles.hero}><small>Finalized distributions</small><h1>{money(report?.total||0)}</h1><p>Only finalized tip distributions assigned to your employee profile appear here.</p></section>
  <section className={styles.section}><div className={styles.setupCard}><div className={styles.two}><label className={styles.field}><span>From</span><input type="date" value={range.start} onChange={e=>setRange({...range,start:e.target.value})}/></label><label className={styles.field}><span>To</span><input type="date" min={range.start} value={range.end} onChange={e=>setRange({...range,end:e.target.value})}/></label></div><div className={styles.actions}><button className={styles.button} disabled={busy||!range.start||!range.end||range.end<range.start} onClick={()=>refresh()}><RefreshCw size={16}/> Update range</button></div></div></section>
  <section className={styles.section}><div className={styles.metricGrid}><div className={styles.metric}><b>{rows.length}</b><span>finalized distributions</span></div><div className={styles.metric}><b>{hours.toFixed(1)}</b><span>eligible hours represented</span></div></div></section>
  <section className={styles.section}><div className={styles.sectionHead}><h2>Distribution history</h2><span>{range.start} – {range.end}</span></div><div className={styles.list}>{rows.map(d=>{const amount=Number(d.amount||0),eligible=Number(d.eligible_hours||0);return <article className={styles.preferenceRow} key={`${d.run_id}-${d.pool_name}`}><div className={styles.sectionHead}><div><h2>{d.pool_name}</h2><span>{d.starts_on} – {d.ends_on}</span></div><strong>{money(amount)}</strong></div><div className={styles.notificationMeta}><span>{eligible.toFixed(2)} eligible hrs</span><span>Weight {Number(d.weight||0).toFixed(2)}</span></div>{eligible>0&&<p className={styles.muted}>This finalized distribution equals {money(amount/eligible)} per eligible hour for this pool after the pool's configured weighting is applied.</p>}</article>})}{!rows.length&&<div className={styles.empty}><Coins size={24}/><div>No finalized tip distributions in this date range.</div></div>}</div></section>
 </main>
}
