'use client';

import {useEffect,useState} from 'react';
import {ArrowLeft,Coins,RefreshCw} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {useI18n} from '@/lib/i18n';
import styles from '../employee.module.css';

type Distribution={run_id:string;pool_name:string;starts_on:string;ends_on:string;eligible_hours:number;weight:number;amount:number};
type Report={starts_on:string;ends_on:string;total:number;distributions:Distribution[]};
const today=()=>new Date().toISOString().slice(0,10);
const monthStart=()=>`${today().slice(0,8)}01`;
const money=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(n)||0);
const COPY={en:{invalid:'Choose a valid date range.',hidden:'Tip history is not currently visible to employees.',opening:'Opening your tips…',back:'Back to staff home',staff:'El Molino Staff',title:'My Tips',refresh:'Refresh tip history',finalized:'Finalized distributions',hero:'Only finalized tip distributions assigned to your employee profile appear here.',from:'From',to:'To',update:'Update range',count:'finalized distributions',hours:'eligible hours represented',history:'Distribution history',eligible:'eligible hrs',weight:'Weight',explainA:'This finalized distribution equals',explainB:'per eligible hour for this pool after the pool’s configured weighting is applied.',none:'No finalized tip distributions in this date range.'},es:{invalid:'Elige un rango de fechas válido.',hidden:'El historial de propinas no está visible actualmente para los empleados.',opening:'Abriendo tus propinas…',back:'Volver al inicio del personal',staff:'Personal de El Molino',title:'Mis Propinas',refresh:'Actualizar historial de propinas',finalized:'Distribuciones finalizadas',hero:'Aquí aparecen únicamente las distribuciones de propinas finalizadas asignadas a tu perfil de empleado.',from:'Desde',to:'Hasta',update:'Actualizar rango',count:'distribuciones finalizadas',hours:'horas elegibles representadas',history:'Historial de distribuciones',eligible:'h elegibles',weight:'Peso',explainA:'Esta distribución finalizada equivale a',explainB:'por hora elegible para este fondo después de aplicar la ponderación configurada.',none:'No hay distribuciones de propinas finalizadas en este rango de fechas.'}} as const;

export default function EmployeeTips(){
 const {locale}=useI18n(),tx=COPY[locale];
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[range,setRange]=useState({start:monthStart(),end:today()}),[report,setReport]=useState<Report|null>(null);
 useEffect(()=>{void init()},[]);
 async function init(){
  const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('app_role').eq('id',u.user.id).single();if(p.error||p.data?.app_role!=='employee'){location.href=p.data?'/manager':'/';return}
  const st=await supabase.rpc('employee_self_setup_status',{});if(st.error||st.data?.status!=='approved'){location.href='/employee/setup';return}
  await refresh(range.start,range.end);setReady(true)
 }
 async function refresh(start=range.start,end=range.end){
  if(busy||!start||!end||end<start)return setMessage(tx.invalid);setBusy(true);setMessage('');
  const {data,error}=await supabase.rpc('my_tip_report',{p_starts_on:start,p_ends_on:end});
  if(error){setReport(null);setMessage(error.message.includes('visibility is disabled')?tx.hidden:error.message)}else setReport(data as Report);setBusy(false)
 }
 const rows=report?.distributions||[];
 const hours=rows.reduce((sum,x)=>sum+Number(x.eligible_hours||0),0);
 if(!ready)return <main className={styles.page}>{tx.opening}</main>;
 return <main className={styles.page}>
  <header className={styles.header}><a className={styles.iconButton} href="/employee" aria-label={tx.back}><ArrowLeft size={20}/></a><div className={styles.brand}><small>{tx.staff}</small><strong>{tx.title}</strong></div><button className={styles.iconButton} disabled={busy} aria-label={tx.refresh} onClick={()=>refresh()}><RefreshCw size={18}/></button></header>
  {message&&<div className={message===tx.hidden||message===tx.invalid?styles.notice:styles.error}>{message}</div>}
  <section className={styles.hero}><small>{tx.finalized}</small><h1>{money(report?.total||0)}</h1><p>{tx.hero}</p></section>
  <section className={styles.section}><div className={styles.setupCard}><div className={styles.two}><label className={styles.field}><span>{tx.from}</span><input type="date" value={range.start} onChange={e=>setRange({...range,start:e.target.value})}/></label><label className={styles.field}><span>{tx.to}</span><input type="date" min={range.start} value={range.end} onChange={e=>setRange({...range,end:e.target.value})}/></label></div><div className={styles.actions}><button className={styles.button} disabled={busy||!range.start||!range.end||range.end<range.start} onClick={()=>refresh()}><RefreshCw size={16}/> {tx.update}</button></div></div></section>
  <section className={styles.section}><div className={styles.metricGrid}><div className={styles.metric}><b>{rows.length}</b><span>{tx.count}</span></div><div className={styles.metric}><b>{hours.toFixed(1)}</b><span>{tx.hours}</span></div></div></section>
  <section className={styles.section}><div className={styles.sectionHead}><h2>{tx.history}</h2><span>{range.start} – {range.end}</span></div><div className={styles.list}>{rows.map(d=>{const amount=Number(d.amount||0),eligible=Number(d.eligible_hours||0);return <article className={styles.preferenceRow} key={`${d.run_id}-${d.pool_name}`}><div className={styles.sectionHead}><div><h2>{d.pool_name}</h2><span>{d.starts_on} – {d.ends_on}</span></div><strong>{money(amount)}</strong></div><div className={styles.notificationMeta}><span>{eligible.toFixed(2)} {tx.eligible}</span><span>{tx.weight} {Number(d.weight||0).toFixed(2)}</span></div>{eligible>0&&<p className={styles.muted}>{tx.explainA} {money(amount/eligible)} {tx.explainB}</p>}</article>})}{!rows.length&&<div className={styles.empty}><Coins size={24}/><div>{tx.none}</div></div>}</div></section>
 </main>
}
