'use client';

import {FormEvent,useEffect,useState} from 'react';
import {ArrowLeft,CheckCircle2,Clock3,ShieldCheck} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {useI18n} from '@/lib/i18n';
import styles from '../employee.module.css';

type Profile={app_role:'admin'|'manager'|'employee';location_id:string|null;full_name:string|null};
type Role={id:string;name:string;department:string};
type Setup={status:string;claim_id?:string;employee_id?:string|null;first_name?:string;last_name?:string;full_name?:string;phone?:string|null;requested_role_ids?:string[];manager_note?:string|null};

export default function EmployeeSetup(){
 const {locale}=useI18n();
 const c=locale==='es'?{accountError:'No se pudo cargar tu cuenta.',setupError:'No se pudo cargar la configuración del empleado.',needName:'Ingresa tu nombre y apellido.',needRole:'Selecciona al menos un puesto que realmente trabajas.',submitted:'Enviado. Un gerente puede verificar tu nombre y puestos antes de que comience la programación.',opening:'Abriendo configuración del empleado…',unavailable:'Cuenta no disponible.',title:'Configura tu perfil de personal',waiting:'Esperando revisión de gerencia.',waitingBody:'Puedes corregir el formulario y volver a enviarlo antes de la aprobación.',changes:'Un gerente te pidió actualizar este perfil.',rejected:'Esta configuración no fue aprobada.',speak:' Habla con un gerente antes de volver a enviarla.',who:'Cuéntanos quién eres',intro:'Usa tu nombre y apellido reales, luego selecciona cada puesto que realmente trabajas. Gerencia revisa esto una vez para que el sistema de horarios comience con una plantilla correcta.',first:'Nombre',last:'Apellido',phone:'Número de teléfono (opcional)',jobs:'¿Qué puestos trabajas?',jobsHelp:'Selecciona todos los que correspondan. No elijas un puesto solo porque lo hiciste una vez; gerencia confirmará la lista final.',saving:'Guardando…',update:'Actualizar envío',submit:'Enviar para revisión de gerencia',next:'Qué sucede después',nextBody:'Un gerente verifica tu identidad y puestos. Una vez aprobado, tu cuenta se convierte en el registro de empleado utilizado para horarios publicados, intercambios de turnos, turnos abiertos, disponibilidad, tiempo libre, capacitación y notificaciones del personal.'}:{accountError:'Could not load your account.',setupError:'Could not load employee setup.',needName:'Enter your first and last name.',needRole:'Select at least one job you actually work.',submitted:'Submitted. A manager can now verify your name and job roles before scheduling starts.',opening:'Opening employee setup…',unavailable:'Account unavailable.',title:'Set up your staff profile',waiting:'Waiting for manager review.',waitingBody:'You can still correct the form and resubmit before approval.',changes:'A manager asked you to update this profile.',rejected:'This setup was not approved.',speak:' Speak with a manager before resubmitting.',who:'Tell us who you are',intro:'Use your real first and last name, then select every job you actually work. Management reviews this once so the scheduling system starts with a clean roster.',first:'First name',last:'Last name',phone:'Phone number (optional)',jobs:'What jobs do you work?',jobsHelp:'Choose all that apply. Do not choose something just because you have done it once; management will confirm the final list.',saving:'Saving…',update:'Update submission',submit:'Submit for manager review',next:'What happens next',nextBody:'A manager checks your identity and job roles. Once approved, your account becomes the employee record used for published schedules, shift trades, open shifts, availability, time off, training and staff notifications.'};
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[profile,setProfile]=useState<Profile|null>(null),[roles,setRoles]=useState<Role[]>([]),[setup,setSetup]=useState<Setup|null>(null),[firstName,setFirstName]=useState(''),[lastName,setLastName]=useState(''),[phone,setPhone]=useState(''),[selected,setSelected]=useState<string[]>([]);
 useEffect(()=>{void load()},[]);
 async function load(){
  setBusy(true);setMessage('');const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('app_role,location_id,full_name').eq('id',u.user.id).single();if(p.error||!p.data){setMessage(c.accountError);setBusy(false);setReady(true);return}
  const pr=p.data as Profile;setProfile(pr);if(pr.app_role!=='employee'){location.href='/manager';return}
  const [r,s]=await Promise.all([supabase.from('employee_roles').select('id,name,department').neq('department','management').order('department').order('name'),supabase.rpc('employee_self_setup_status',{})]);
  if(r.error||s.error){setMessage(r.error?.message||s.error?.message||c.setupError);setBusy(false);setReady(true);return}
  const st=(s.data||{status:'not_started'}) as Setup;setRoles((r.data??[]) as Role[]);setSetup(st);
  if(st.status==='approved'){location.href='/employee';return}
  if(st.first_name)setFirstName(st.first_name);if(st.last_name)setLastName(st.last_name);if(st.phone)setPhone(st.phone);if(Array.isArray(st.requested_role_ids))setSelected(st.requested_role_ids);
  if(st.status==='not_started'&&pr.full_name){const parts=pr.full_name.trim().split(/\s+/);if(parts.length>1){setFirstName(parts[0]);setLastName(parts.slice(1).join(' '))}}
  setBusy(false);setReady(true)
 }
 function toggle(id:string){setSelected(x=>x.includes(id)?x.filter(v=>v!==id):[...x,id])}
 async function submit(e:FormEvent){e.preventDefault();if(busy)return;if(!firstName.trim()||!lastName.trim())return setMessage(c.needName);if(!selected.length)return setMessage(c.needRole);setBusy(true);const {data,error}=await supabase.rpc('submit_employee_self_setup',{p_first_name:firstName.trim(),p_last_name:lastName.trim(),p_phone:phone.trim()||null,p_role_ids:selected});if(error)setMessage(error.message);else{setSetup(data as Setup);setMessage(c.submitted)}setBusy(false)}
 if(!ready)return <main className={styles.page}>{c.opening}</main>;
 if(!profile)return <main className={styles.page}>{message||c.unavailable}</main>;
 const pending=setup?.status==='pending',changes=setup?.status==='changes_requested',rejected=setup?.status==='rejected';
 return <main className={styles.page}>
  <header className={styles.header}><a className={styles.topLink} href="/"><ArrowLeft size={20}/></a><div className={styles.brand}><small>El Molino · Johns Island</small><strong>{c.title}</strong></div><span/></header>
  {message&&<div className={styles.notice}>{message}</div>}
  {pending&&<div className={styles.notice}><Clock3 size={18}/> <b>{c.waiting}</b> {c.waitingBody}</div>}
  {changes&&<div className={styles.error}><ShieldCheck size={18}/> <b>{c.changes}</b>{setup?.manager_note?` ${setup.manager_note}`:''}</div>}
  {rejected&&<div className={styles.error}><b>{c.rejected}</b>{setup?.manager_note?` ${setup.manager_note}`:c.speak}</div>}
  <section className={styles.setupCard}><h1 style={{marginTop:0}}>{c.who}</h1><p className={styles.muted}>{c.intro}</p>
   <form className={styles.form} onSubmit={submit}><div className={styles.two}><label className={styles.field}><span>{c.first}</span><input autoComplete="given-name" maxLength={80} value={firstName} onChange={e=>setFirstName(e.target.value)} required/></label><label className={styles.field}><span>{c.last}</span><input autoComplete="family-name" maxLength={80} value={lastName} onChange={e=>setLastName(e.target.value)} required/></label></div><label className={styles.field}><span>{c.phone}</span><input autoComplete="tel" inputMode="tel" maxLength={40} value={phone} onChange={e=>setPhone(e.target.value)}/></label>
    <div><b>{c.jobs}</b><p className={styles.muted}>{c.jobsHelp}</p><div className={styles.roles}>{roles.map(r=><label className={styles.role} key={r.id}><input type="checkbox" checked={selected.includes(r.id)} onChange={()=>toggle(r.id)}/><span>{r.name}</span></label>)}</div></div>
    <button className={styles.button} disabled={busy}>{busy?c.saving:pending?c.update:c.submit}</button>
   </form>
  </section>
  <section className={styles.section}><div className={styles.setupCard}><CheckCircle2 size={22}/><h2>{c.next}</h2><p className={styles.muted}>{c.nextBody}</p></div></section>
 </main>
}
