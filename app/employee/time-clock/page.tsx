'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {ArrowLeft,CheckCircle2,Clock3,Coffee,KeyRound,MapPin,RefreshCw} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {useI18n} from '@/lib/i18n';
import {timeClockI18n} from '@/lib/i18n-time-clock';
import styles from '../employee.module.css';

type Settings={enabled:boolean;mobile_punch_enabled:boolean;employee_approval_enabled:boolean;geofence_enabled:boolean};
type Punch={id:string;employee_id:string;clock_in:string;clock_out:string|null;source:string;note:string|null;employee_approval_status:'pending'|'approved'|'disputed';employee_dispute_note:string|null};
type BreakRow={id:string;punch_id:string;started_at:string;ended_at:string|null;paid:boolean;deleted_at:string|null};
const DEFAULT:Settings={enabled:true,mobile_punch_enabled:true,employee_approval_enabled:true,geofence_enabled:false};

export default function EmployeeTimeClock(){
 const {locale}=useI18n(),tx=timeClockI18n(locale),dateLocale=locale==='es'?'es-US':'en-US';
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[settings,setSettings]=useState<Settings>(DEFAULT),[employeeId,setEmployeeId]=useState<string|null>(null),[punches,setPunches]=useState<Punch[]>([]),[breaks,setBreaks]=useState<BreakRow[]>([]),[pin,setPin]=useState('');
 const openPunch=useMemo(()=>punches.find(p=>!p.clock_out)||null,[punches]);
 const activeBreak=useMemo(()=>openPunch?breaks.find(b=>b.punch_id===openPunch.id&&!b.ended_at&&!b.deleted_at)||null:null,[breaks,openPunch]);
 useEffect(()=>{void load()},[]);
 async function load(){
  setBusy(true);setMessage('');const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('app_role,location_id').eq('id',u.user.id).single();if(p.error||p.data?.app_role!=='employee'){location.href=p.data?'/manager':'/';return}
  const st=await supabase.rpc('employee_self_setup_status',{});if(st.error||st.data?.status!=='approved'||!st.data?.employee_id){location.href='/employee/setup';return}
  const emp=String(st.data.employee_id);setEmployeeId(emp);
  const [cfg,pu,br]=await Promise.all([
   supabase.from('time_clock_settings').select('enabled,mobile_punch_enabled,employee_approval_enabled,geofence_enabled').maybeSingle(),
   supabase.from('time_clock_punches').select('id,employee_id,clock_in,clock_out,source,note,employee_approval_status,employee_dispute_note').eq('employee_id',emp).order('clock_in',{ascending:false}).limit(30),
   supabase.from('time_clock_breaks').select('id,punch_id,started_at,ended_at,paid,deleted_at').eq('employee_id',emp).order('started_at',{ascending:false}).limit(100)
  ]);
  if(cfg.error||pu.error||br.error)setMessage(tx.partialRefresh);
  setSettings({...DEFAULT,...(cfg.data||{})} as Settings);setPunches((pu.data??[]) as Punch[]);setBreaks((br.data??[]) as BreakRow[]);setReady(true);setBusy(false)
 }
 async function coords(){if(!settings.geofence_enabled)return {lat:null,lng:null};if(!navigator.geolocation)throw new Error(tx.locationRequired);return new Promise<{lat:number;lng:number}>((resolve,reject)=>navigator.geolocation.getCurrentPosition(x=>resolve({lat:x.coords.latitude,lng:x.coords.longitude}),()=>reject(new Error(tx.allowLocation)),{enableHighAccuracy:true,timeout:10000,maximumAge:30000}))}
 async function punch(kind:'in'|'out'){if(busy||!settings.enabled||!settings.mobile_punch_enabled)return;setBusy(true);try{const c=await coords();const {error}=await supabase.rpc(kind==='in'?'clock_in':'clock_out',{p_source:'mobile',p_latitude:c.lat,p_longitude:c.lng});if(error)throw error;setMessage(kind==='in'?tx.clockedIn:tx.clockedOut);await load()}catch(e:any){setMessage(e?.message||tx.punchFailed)}finally{setBusy(false)}}
 async function breakAction(kind:'start'|'end'){if(busy)return;setBusy(true);const r=kind==='start'?await supabase.rpc('start_time_clock_break',{p_paid:false,p_source:'mobile'}):await supabase.rpc('end_time_clock_break',{p_source:'mobile'});setMessage(r.error?r.error.message:kind==='start'?tx.breakStarted:tx.breakEnded);if(!r.error)await load();setBusy(false)}
 async function attest(p:Punch,approved:boolean){if(busy)return;let note:string|null=null;if(!approved){note=prompt(tx.correctionPrompt)?.trim()||null;if(!note)return}setBusy(true);const {error}=await supabase.rpc('employee_attest_time_clock_punch',{p_punch_id:p.id,p_approved:approved,p_dispute_note:note});setMessage(error?error.message:approved?tx.punchApproved:tx.correctionSent);if(!error)await load();setBusy(false)}
 async function savePin(e:FormEvent){e.preventDefault();if(busy||!/^\d{4,8}$/.test(pin))return setMessage(tx.pinInvalid);setBusy(true);const {error}=await supabase.rpc('set_time_clock_pin',{p_pin:pin});if(!error)setPin('');setMessage(error?error.message:tx.pinSaved);setBusy(false)}
 const status=!settings.enabled?tx.disabled:activeBreak?tx.onBreak:openPunch?tx.statusIn:tx.statusOut;
 const approval=(s:Punch['employee_approval_status'])=>(tx.approval as Record<string,string>)[s]||s;
 if(!ready)return <main className={styles.page}>{tx.opening}</main>;
 if(!employeeId)return <main className={styles.page}>{tx.notLinked}</main>;
 return <main className={styles.page}>
  <header className={styles.header}><a className={styles.iconButton} href="/employee" aria-label={tx.back}><ArrowLeft size={20}/></a><div className={styles.brand}><small>{tx.staff}</small><strong>{tx.title}</strong></div><button className={styles.iconButton} disabled={busy} aria-label={tx.refresh} onClick={load}><RefreshCw size={18}/></button></header>
  {message&&<div className={message.toLowerCase().includes('could not')||message.toLowerCase().includes('required')?styles.error:styles.notice}>{message}</div>}
  <section className={styles.hero}><small>{tx.current}</small><h1>{status}</h1>{openPunch&&<p>{tx.since} {new Date(openPunch.clock_in).toLocaleTimeString(dateLocale,{hour:'numeric',minute:'2-digit'})}</p>}{settings.geofence_enabled&&<div className={styles.next}><span><MapPin size={14}/> {tx.locationVerification}</span></div>}</section>
  <section className={styles.section}><div className={styles.setupCard}><h2>{tx.actions}</h2>{!settings.mobile_punch_enabled?<div className={styles.empty}>{tx.mobileDisabled}</div>:<div className={styles.actions}>{!openPunch?<button className={styles.button} disabled={busy||!settings.enabled} onClick={()=>punch('in')}><Clock3 size={17}/> {tx.clockIn}</button>:<button className={styles.button} disabled={busy||Boolean(activeBreak)} onClick={()=>punch('out')}><Clock3 size={17}/> {tx.clockOut}</button>}{openPunch&&!activeBreak&&<button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>breakAction('start')}><Coffee size={17}/> {tx.startBreak}</button>}{activeBreak&&<button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>breakAction('end')}><Coffee size={17}/> {tx.endBreak}</button>}</div>}</div></section>
  <section className={styles.section}><div className={styles.sectionHead}><h2>{tx.recent}</h2><span>{tx.onlyYours}</span></div><div className={styles.list}>{punches.slice(0,20).map(p=><article className={styles.preferenceRow} key={p.id}><div className={styles.sectionHead}><div><h2>{new Date(p.clock_in).toLocaleDateString(dateLocale,{weekday:'short',month:'short',day:'numeric'})}</h2><span>{p.source}</span></div><span className={styles.pill}>{approval(p.employee_approval_status)}</span></div><b>{new Date(p.clock_in).toLocaleTimeString(dateLocale,{hour:'numeric',minute:'2-digit'})} – {p.clock_out?new Date(p.clock_out).toLocaleTimeString(dateLocale,{hour:'numeric',minute:'2-digit'}):tx.now}</b>{p.note&&<p className={styles.muted}>{p.note}</p>}{p.employee_dispute_note&&<div className={styles.error}>{p.employee_dispute_note}</div>}{p.clock_out&&settings.employee_approval_enabled&&p.employee_approval_status!=='approved'&&<div className={styles.actions}><button className={styles.button} disabled={busy} onClick={()=>attest(p,true)}><CheckCircle2 size={16}/> {tx.looksCorrect}</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>attest(p,false)}>{tx.requestCorrection}</button></div>}</article>)}{!punches.length&&<div className={styles.empty}>{tx.none}</div>}</div></section>
  <section className={styles.section}><div className={styles.setupCard}><h2>{tx.kioskPin}</h2><p className={styles.muted}>{tx.kioskHelp}</p><form className={styles.actions} onSubmit={savePin}><label className={styles.field}><span>{tx.newPin}</span><input aria-label={tx.kioskPin} inputMode="numeric" type="password" pattern="\d{4,8}" maxLength={8} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))}/></label><button className={styles.button} disabled={busy||!/^\d{4,8}$/.test(pin)}><KeyRound size={16}/> {tx.savePin}</button></form></div></section>
 </main>
}
