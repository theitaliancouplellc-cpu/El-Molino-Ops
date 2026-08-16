'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';
import styles from '../../ops-tools.module.css';

const DAYS=[{d:1,n:'Monday'},{d:2,n:'Tuesday'},{d:3,n:'Wednesday'},{d:4,n:'Thursday'},{d:5,n:'Friday'},{d:6,n:'Saturday'},{d:0,n:'Sunday'}];

export default function SchedulePreferencesPage(){
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [days,setDays]=useState<number[]>([]),[useWindow,setUseWindow]=useState(false),[start,setStart]=useState('10:00'),[end,setEnd]=useState('22:00');
  useEffect(()=>{void load()},[]);
  async function load(){
    setReady(false);const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
    const {data:e,error:eError}=await supabase.from('employees').select('id').eq('user_id',u.user.id).eq('active',true).is('deleted_at',null).maybeSingle();
    if(eError||!e){setMessage('An active employee profile is required to save scheduling preferences.');setReady(true);return}
    const {data:p}=await supabase.from('employee_schedule_profiles').select('preferred_days_off,preferred_start,preferred_end').eq('employee_id',e.id).maybeSingle();
    if(p){setDays(Array.isArray(p.preferred_days_off)?p.preferred_days_off.map(Number):[]);if(p.preferred_start&&p.preferred_end){setUseWindow(true);setStart(String(p.preferred_start).slice(0,5));setEnd(String(p.preferred_end).slice(0,5))}}
    setReady(true);
  }
  function toggleDay(day:number){setDays(xs=>xs.includes(day)?xs.filter(x=>x!==day):[...xs,day].sort((a,b)=>a-b))}
  async function save(){
    if(busy)return;if(useWindow&&(!start||!end||end<=start)){setMessage('Preferred end time must be after the start time.');return}
    setBusy(true);const {error}=await supabase.rpc('set_my_schedule_preferences',{p_preferred_days_off:days,p_preferred_start:useWindow?start:null,p_preferred_end:useWindow?end:null});
    setMessage(error?'Could not save your scheduling preferences.':'Scheduling preferences saved. The optimizer will use them when coverage allows.');setBusy(false);
  }
  if(!ready)return <main className={styles.page}>Loading preferences…</main>;
  return <main className={styles.page}>
    <div className={styles.top}><div><h1>My Scheduling Preferences</h1><p>Tell the optimizer what you prefer. These are soft preferences, not guaranteed availability or approved time off.</p></div><Link className={styles.back} href="/schedule">Back to Schedule</Link></div>
    {message&&<div className={message.startsWith('Could not')?styles.error:styles.notice}>{message}</div>}
    <section className={styles.section}><div className={styles.card}><h2>Preferred days off</h2><p>Select days you would rather not work. If you absolutely cannot work a day, set that day as unavailable on the main Schedule page instead.</p><div className={styles.list}>{DAYS.map(x=><label className={styles.entry} key={x.d} style={{display:'flex',gap:12,alignItems:'center'}}><input type="checkbox" checked={days.includes(x.d)} onChange={()=>toggleDay(x.d)}/><b>{x.n}</b></label>)}</div></div></section>
    <section className={styles.section}><div className={styles.card}><h2>Preferred work window</h2><label className={styles.field}><span>Prefer a consistent time window</span><input type="checkbox" checked={useWindow} onChange={e=>setUseWindow(e.target.checked)}/></label>{useWindow&&<div className={styles.formGrid}><label className={styles.field}><span>Preferred start</span><input type="time" value={start} onChange={e=>setStart(e.target.value)}/></label><label className={styles.field}><span>Preferred end</span><input type="time" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>}<div className={styles.actions}><button className={styles.button} disabled={busy} onClick={save}>Save Preferences</button></div></div></section>
  </main>
}
