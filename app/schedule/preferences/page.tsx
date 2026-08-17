'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';
import {useI18n} from '@/lib/i18n';
import styles from '../../ops-tools.module.css';

const DAYS=[{d:1,k:'monday'},{d:2,k:'tuesday'},{d:3,k:'wednesday'},{d:4,k:'thursday'},{d:5,k:'friday'},{d:6,k:'saturday'},{d:0,k:'sunday'}] as const;

export default function SchedulePreferencesPage(){
  const {locale}=useI18n();
  const c=locale==='es'?{monday:'Lunes',tuesday:'Martes',wednesday:'Miércoles',thursday:'Jueves',friday:'Viernes',saturday:'Sábado',sunday:'Domingo',employeeRequired:'Se requiere un perfil de empleado activo para guardar preferencias de horario.',invalidWindow:'La hora de finalización preferida debe ser posterior a la hora de inicio.',saveError:'No se pudieron guardar tus preferencias de horario.',saved:'Preferencias de horario guardadas. El optimizador las usará cuando la cobertura lo permita.',loading:'Cargando preferencias…',title:'Mis preferencias de horario',intro:'Dile al optimizador lo que prefieres. Estas son preferencias flexibles, no disponibilidad garantizada ni tiempo libre aprobado.',back:'Volver al horario',daysOff:'Días libres preferidos',daysHelp:'Selecciona los días que preferirías no trabajar. Si definitivamente no puedes trabajar un día, márcalo como no disponible en la página principal de Horario.',window:'Horario de trabajo preferido',consistent:'Preferir un horario constante',start:'Inicio preferido',end:'Fin preferido',save:'Guardar preferencias'}:{monday:'Monday',tuesday:'Tuesday',wednesday:'Wednesday',thursday:'Thursday',friday:'Friday',saturday:'Saturday',sunday:'Sunday',employeeRequired:'An active employee profile is required to save scheduling preferences.',invalidWindow:'Preferred end time must be after the start time.',saveError:'Could not save your scheduling preferences.',saved:'Scheduling preferences saved. The optimizer will use them when coverage allows.',loading:'Loading preferences…',title:'My Scheduling Preferences',intro:'Tell the optimizer what you prefer. These are soft preferences, not guaranteed availability or approved time off.',back:'Back to Schedule',daysOff:'Preferred days off',daysHelp:'Select days you would rather not work. If you absolutely cannot work a day, set that day as unavailable on the main Schedule page instead.',window:'Preferred work window',consistent:'Prefer a consistent time window',start:'Preferred start',end:'Preferred end',save:'Save Preferences'};
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[messageKind,setMessageKind]=useState<'error'|'notice'>('notice');
  const [days,setDays]=useState<number[]>([]),[useWindow,setUseWindow]=useState(false),[start,setStart]=useState('10:00'),[end,setEnd]=useState('22:00');
  useEffect(()=>{void load()},[]);
  function say(text:string,kind:'error'|'notice'='notice'){setMessageKind(kind);setMessage(text)}
  async function load(){
    setReady(false);const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
    const {data:e,error:eError}=await supabase.from('employees').select('id').eq('user_id',u.user.id).eq('active',true).is('deleted_at',null).maybeSingle();
    if(eError||!e){say(c.employeeRequired,'error');setReady(true);return}
    const {data:p}=await supabase.from('employee_schedule_profiles').select('preferred_days_off,preferred_start,preferred_end').eq('employee_id',e.id).maybeSingle();
    if(p){setDays(Array.isArray(p.preferred_days_off)?p.preferred_days_off.map(Number):[]);if(p.preferred_start&&p.preferred_end){setUseWindow(true);setStart(String(p.preferred_start).slice(0,5));setEnd(String(p.preferred_end).slice(0,5))}}
    setReady(true);
  }
  function toggleDay(day:number){setDays(xs=>xs.includes(day)?xs.filter(x=>x!==day):[...xs,day].sort((a,b)=>a-b))}
  async function save(){
    if(busy)return;if(useWindow&&(!start||!end||end<=start)){say(c.invalidWindow,'error');return}
    setBusy(true);const {error}=await supabase.rpc('set_my_schedule_preferences',{p_preferred_days_off:days,p_preferred_start:useWindow?start:null,p_preferred_end:useWindow?end:null});
    say(error?c.saveError:c.saved,error?'error':'notice');setBusy(false);
  }
  if(!ready)return <main className={styles.page}>{c.loading}</main>;
  return <main className={styles.page}>
    <div className={styles.top}><div><h1>{c.title}</h1><p>{c.intro}</p></div><Link className={styles.back} href="/schedule">{c.back}</Link></div>
    {message&&<div className={messageKind==='error'?styles.error:styles.notice}>{message}</div>}
    <section className={styles.section}><div className={styles.card}><h2>{c.daysOff}</h2><p>{c.daysHelp}</p><div className={styles.list}>{DAYS.map(x=><label className={styles.entry} key={x.d} style={{display:'flex',gap:12,alignItems:'center'}}><input type="checkbox" checked={days.includes(x.d)} onChange={()=>toggleDay(x.d)}/><b>{c[x.k]}</b></label>)}</div></div></section>
    <section className={styles.section}><div className={styles.card}><h2>{c.window}</h2><label className={styles.field}><span>{c.consistent}</span><input type="checkbox" checked={useWindow} onChange={e=>setUseWindow(e.target.checked)}/></label>{useWindow&&<div className={styles.formGrid}><label className={styles.field}><span>{c.start}</span><input type="time" value={start} onChange={e=>setStart(e.target.value)}/></label><label className={styles.field}><span>{c.end}</span><input type="time" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>}<div className={styles.actions}><button className={styles.button} disabled={busy} onClick={save}>{c.save}</button></div></div></section>
  </main>
}
