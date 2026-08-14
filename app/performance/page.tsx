'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { averageCheck, laborPercent, mapPerformanceCsv, percentChange, salesPerLaborHour, type PerformancePatch } from '@/lib/performance';
import styles from './performance.module.css';
import { businessDateInZone } from '@/lib/intermediate-hardening';

type Profile={app_role:'admin'|'manager'|'employee';location_id:string|null};
type Row={id:string;business_date:string;source:string;gross_sales:number;net_sales:number;food_sales:number;alcohol_sales:number;discounts:number;comps:number;voids:number;refunds:number;guest_count:number;labor_hours:number;labor_cost:number;overtime_hours:number;overtime_cost:number;notes:string|null};
type Targets={daily_sales_target:number;labor_pct_target:number;sales_per_labor_hour_target:number};
const zeroTargets:Targets={daily_sales_target:0,labor_pct_target:0,sales_per_labor_hour_target:0};
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n)||0);
const pct=(n:number)=>`${(Number(n)||0).toFixed(1)}%`;
const num=(v:string)=>Math.max(0,Number(v)||0);
const today=()=>businessDateInZone();

export default function PerformancePage(){
  const [profile,setProfile]=useState<Profile|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [rows,setRows]=useState<Row[]>([]),[targets,setTargets]=useState<Targets>(zeroTargets),[pending,setPending]=useState<PerformancePatch[]>([]),[warnings,setWarnings]=useState<string[]>([]),[fileName,setFileName]=useState('');
  const [form,setForm]=useState({business_date:today(),gross_sales:'',net_sales:'',food_sales:'',alcohol_sales:'',guest_count:'',labor_hours:'',labor_cost:'',overtime_hours:'',overtime_cost:'',discounts:'',comps:'',voids:'',refunds:'',notes:''});

  useEffect(()=>{void init()},[]);
  async function init(){const {data:u}=await supabase.auth.getUser();if(!u.user){window.location.href='/';return;}const {data:p}=await supabase.from('profiles').select('app_role,location_id').eq('id',u.user.id).single();setProfile((p||null) as Profile|null);if(p?.location_id&&['admin','manager'].includes(p.app_role))await load(p.location_id);setReady(true);}
  async function load(locationId=profile?.location_id||''){if(!locationId)return;const [r,t]=await Promise.all([supabase.from('restaurant_daily_performance').select('id,business_date,source,gross_sales,net_sales,food_sales,alcohol_sales,discounts,comps,voids,refunds,guest_count,labor_hours,labor_cost,overtime_hours,overtime_cost,notes').eq('location_id',locationId).order('business_date',{ascending:false}).limit(90),supabase.from('restaurant_performance_targets').select('daily_sales_target,labor_pct_target,sales_per_labor_hour_target').eq('location_id',locationId).maybeSingle()]);if(r.error)setMessage('Could not load performance data.');else setRows((r.data??[]) as Row[]);if(t.data)setTargets(t.data as Targets);}

  const summary=useMemo(()=>{
    const sorted=[...rows].sort((a,b)=>b.business_date.localeCompare(a.business_date)),current=sorted.slice(0,7),previous=sorted.slice(7,14);
    const sum=(list:Row[],key:keyof Row)=>list.reduce((n,r)=>n+Number(r[key]||0),0);
    const sales=sum(current,'net_sales'),prevSales=sum(previous,'net_sales'),labor=sum(current,'labor_cost'),hours=sum(current,'labor_hours'),guests=sum(current,'guest_count');
    return {sales,prevSales,labor,hours,guests,laborPct:laborPercent(sales,labor),splh:salesPerLaborHour(sales,hours),avgCheck:averageCheck(sales,guests),salesChange:percentChange(sales,prevSales),days:current.length};
  },[rows]);

  async function saveManual(e:FormEvent){e.preventDefault();if(!profile?.location_id||busy)return;setBusy(true);setMessage('');try{const {data:u}=await supabase.auth.getUser();if(!u.user)return;const payload={location_id:profile.location_id,business_date:form.business_date,source:'manual',gross_sales:num(form.gross_sales),net_sales:num(form.net_sales),food_sales:num(form.food_sales),alcohol_sales:num(form.alcohol_sales),guest_count:Math.round(num(form.guest_count)),labor_hours:num(form.labor_hours),labor_cost:num(form.labor_cost),overtime_hours:num(form.overtime_hours),overtime_cost:num(form.overtime_cost),discounts:num(form.discounts),comps:num(form.comps),voids:num(form.voids),refunds:num(form.refunds),notes:form.notes.trim().slice(0,4000)||null,created_by:u.user.id,updated_by:u.user.id};const {error}=await supabase.from('restaurant_daily_performance').upsert(payload,{onConflict:'location_id,business_date'});if(error)throw error;setMessage('Daily performance saved.');await load();}catch{setMessage('Could not save daily performance.');}finally{setBusy(false)}}

  async function chooseCsv(e:ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];e.target.value='';if(!f)return;if(f.size>5_000_000){setMessage('CSV files are limited to 5 MB.');return;}const result=mapPerformanceCsv(await f.text());setFileName(f.name);setPending(result.records);setWarnings(result.warnings.slice(0,20));if(!result.records.length)setMessage(result.warnings[0]||'No importable rows were found.');else setMessage(`${result.records.length} business date${result.records.length===1?'':'s'} ready to import.`);}
  async function applyCsv(){if(!profile?.location_id||!pending.length||busy)return;setBusy(true);try{const {data:u}=await supabase.auth.getUser();if(!u.user)return;const payload=pending.map(r=>({location_id:profile.location_id,source:'toast_csv',created_by:u.user.id,updated_by:u.user.id,...r}));const {error}=await supabase.from('restaurant_daily_performance').upsert(payload,{onConflict:'location_id,business_date'});if(error)throw error;setMessage(`Imported ${pending.length} business date${pending.length===1?'':'s'} from ${fileName}.`);setPending([]);setWarnings([]);setFileName('');await load();}catch{setMessage('The Toast CSV could not be imported. No existing records were deleted.');}finally{setBusy(false)}}
  async function saveTargets(e:FormEvent){e.preventDefault();if(!profile?.location_id||busy)return;setBusy(true);try{const {error}=await supabase.from('restaurant_performance_targets').upsert({location_id:profile.location_id,...targets},{onConflict:'location_id'});if(error)throw error;setMessage('Performance targets saved.');}catch{setMessage('Could not save targets.');}finally{setBusy(false)}}

  if(!ready)return <main className={styles.page}>Loading performance…</main>;
  if(!profile||!profile.location_id||!['admin','manager'].includes(profile.app_role))return <main className={styles.page}><div className={styles.top}><div><h1>Performance</h1><p>Manager-only restaurant financial and labor data.</p></div><Link className={styles.back} href="/">Back</Link></div><div className={styles.error}>You do not have manager access to this section.</div></main>;

  return <main className={styles.page}>
    <div className={styles.top}><div><h1>Performance</h1><p>Sales, labor, Toast imports and weekly operating trends.</p></div><Link className={styles.back} href="/">Back to Ops</Link></div>
    {message&&<div className={message.startsWith('Could not')||message.startsWith('The Toast')?styles.error:styles.notice}>{message}</div>}
    <div className={styles.grid}>
      <Metric label={`${summary.days||0}-day net sales`} value={money(summary.sales)} detail={`${summary.salesChange>=0?'+':''}${summary.salesChange.toFixed(1)}% vs prior period`} bad={summary.salesChange<0}/>
      <Metric label="Labor %" value={pct(summary.laborPct)} detail={targets.labor_pct_target?`Target ${pct(targets.labor_pct_target)}`:'Set a target below'} bad={targets.labor_pct_target>0&&summary.laborPct>targets.labor_pct_target}/>
      <Metric label="Sales / labor hr" value={money(summary.splh)} detail={targets.sales_per_labor_hour_target?`Target ${money(targets.sales_per_labor_hour_target)}`:`${summary.hours.toFixed(1)} labor hrs`}/>
      <Metric label="Average check" value={money(summary.avgCheck)} detail={`${Math.round(summary.guests)} guests`}/>
    </div>

    <section className={styles.section}><h2>Toast CSV import</h2><p>Import a daily sales report, labor report, or a combined export. Existing dates are updated instead of duplicated.</p><div className={styles.actions}><label className={`${styles.button} ${styles.secondary}`}>Choose CSV<input hidden type="file" accept=".csv,text/csv" onChange={chooseCsv}/></label>{pending.length>0&&<button className={styles.button} disabled={busy} onClick={applyCsv}>Import {pending.length} date{pending.length===1?'':'s'}</button>}</div>{pending.length>0&&<div className={styles.preview}><b>{fileName}</b><span>{pending[0].business_date} → {pending[pending.length-1].business_date}</span>{warnings.length>0&&<span>{warnings.length} row warning{warnings.length===1?'':'s'}; valid rows can still be imported.</span>}</div>}</section>

    <section className={styles.section}><h2>Daily entry / correction</h2><p>Use this while Toast access is pending, or to correct a day after import.</p><form onSubmit={saveManual}><div className={styles.formGrid}>
      <Field label="Business date" type="date" value={form.business_date} onChange={v=>setForm({...form,business_date:v})}/><Field label="Net sales" value={form.net_sales} onChange={v=>setForm({...form,net_sales:v})}/><Field label="Gross sales" value={form.gross_sales} onChange={v=>setForm({...form,gross_sales:v})}/><Field label="Food sales" value={form.food_sales} onChange={v=>setForm({...form,food_sales:v})}/><Field label="Alcohol sales" value={form.alcohol_sales} onChange={v=>setForm({...form,alcohol_sales:v})}/><Field label="Guests / covers" value={form.guest_count} onChange={v=>setForm({...form,guest_count:v})}/><Field label="Labor hours" value={form.labor_hours} onChange={v=>setForm({...form,labor_hours:v})}/><Field label="Labor cost" value={form.labor_cost} onChange={v=>setForm({...form,labor_cost:v})}/><Field label="OT hours" value={form.overtime_hours} onChange={v=>setForm({...form,overtime_hours:v})}/><Field label="OT cost" value={form.overtime_cost} onChange={v=>setForm({...form,overtime_cost:v})}/><Field label="Discounts" value={form.discounts} onChange={v=>setForm({...form,discounts:v})}/><Field label="Comps" value={form.comps} onChange={v=>setForm({...form,comps:v})}/><Field label="Voids" value={form.voids} onChange={v=>setForm({...form,voids:v})}/><Field label="Refunds" value={form.refunds} onChange={v=>setForm({...form,refunds:v})}/><div className={styles.field}><label>Manager note</label><input maxLength={4000} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
    </div><div className={styles.actions}><button className={styles.button} disabled={busy}>Save day</button></div></form></section>

    <section className={styles.section}><h2>Targets</h2><p>These become the operating benchmarks for the dashboard and later alerts.</p><form onSubmit={saveTargets}><div className={styles.targets}><Field label="Daily net sales target" value={String(targets.daily_sales_target||'')} onChange={v=>setTargets({...targets,daily_sales_target:num(v)})}/><Field label="Labor % target" value={String(targets.labor_pct_target||'')} onChange={v=>setTargets({...targets,labor_pct_target:Math.min(100,num(v))})}/><Field label="Sales / labor hr target" value={String(targets.sales_per_labor_hour_target||'')} onChange={v=>setTargets({...targets,sales_per_labor_hour_target:num(v)})}/></div><div className={styles.actions}><button className={styles.button} disabled={busy}>Save targets</button></div></form></section>

    <section className={styles.section}><h2>Recent business days</h2><p>Latest 90 records. Week-over-week calculations use the most recent recorded dates.</p><div className={styles.tableWrap}>{rows.length?<table className={styles.table}><thead><tr><th>Date</th><th>Net sales</th><th>Labor</th><th>Labor %</th><th>Hours</th><th>Sales/hr</th><th>Guests</th><th>Avg check</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{new Date(`${r.business_date}T12:00:00`).toLocaleDateString()}</td><td>{money(r.net_sales)}</td><td>{money(r.labor_cost)}</td><td>{pct(laborPercent(r.net_sales,r.labor_cost))}</td><td>{Number(r.labor_hours).toFixed(1)}</td><td>{money(salesPerLaborHour(r.net_sales,r.labor_hours))}</td><td>{r.guest_count}</td><td>{money(averageCheck(r.net_sales,r.guest_count))}</td></tr>)}</tbody></table>:<div className={styles.empty}>No performance data yet. Enter a day manually or import a Toast CSV.</div>}</div></section>
  </main>;
}

function Metric({label,value,detail,bad=false}:{label:string;value:string;detail:string;bad?:boolean}){return <div className={styles.metric}><span>{label}</span><strong>{value}</strong><small className={bad?styles.negative:undefined}>{detail}</small></div>}
function Field({label,value,onChange,type='number'}:{label:string;value:string;onChange:(v:string)=>void;type?:string}){return <div className={styles.field}><label>{label}</label><input type={type} inputMode={type==='number'?'decimal':undefined} step={type==='number'?'0.01':undefined} min={type==='number'?'0':undefined} value={value} onChange={e=>onChange(e.target.value)}/></div>}
