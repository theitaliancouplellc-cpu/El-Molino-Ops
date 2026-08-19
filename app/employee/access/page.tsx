'use client';

import {useEffect,useState} from 'react';
import {LockKeyhole,LogOut,RefreshCw,ShieldAlert,UserRound} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {useI18n} from '@/lib/i18n';
import styles from '../employee.module.css';

type Setup={status:string;employment_status?:'active'|'suspended'|'inactive'|null;status_reason?:string|null;status_changed_at?:string|null;full_name?:string|null;access_allowed?:boolean};

export default function EmployeeAccess(){
 const {locale}=useI18n();
 const c=locale==='es'?{verifyError:'No se pudo verificar tu acceso de personal.',checking:'Verificando acceso del personal…',staff:'Personal de El Molino',title:'Acceso a la Cuenta',suspended:'Acceso suspendido',inactive:'Cuenta inactiva',suspendedHeading:'Tu acceso de personal está suspendido temporalmente.',inactiveHeading:'Tu cuenta de personal no está activa.',questions:'Habla con un gerente si tienes preguntas sobre tu estado laboral actual.',meaning:'Qué significa esto',suspendedBody:'Tu perfil e historial de empleado permanecen intactos, pero tu horario, solicitudes, Bolsa de Turnos y comunicaciones del equipo no están disponibles hasta que gerencia restablezca el acceso.',inactiveBody:'Tu perfil de empleado sigue vinculado para mantener registros, pero las herramientas del personal no están disponibles mientras la cuenta esté inactiva.',updated:'Estado actualizado',checkAgain:'Revisar acceso de nuevo',account:'Cuenta y Seguridad',signOut:'Cerrar sesión'}:{verifyError:'Could not verify your staff access.',checking:'Checking staff access…',staff:'El Molino Staff',title:'Account Access',suspended:'Access suspended',inactive:'Account inactive',suspendedHeading:'Your staff access is temporarily suspended.',inactiveHeading:'Your staff account is not active.',questions:'Please speak with a manager if you have questions about your current employment status.',meaning:'What this means',suspendedBody:'Your employee profile and history remain intact, but your schedule, requests, Shift Pool and team communications are unavailable until management restores access.',inactiveBody:'Your employee profile remains linked for recordkeeping, but staff tools are unavailable while the account is inactive.',updated:'Status updated',checkAgain:'Check access again',account:'Account & Security',signOut:'Sign out'};
 const localeCode=locale==='es'?'es-US':'en-US';
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[setup,setSetup]=useState<Setup|null>(null),[message,setMessage]=useState('');
 useEffect(()=>{void load()},[]);
 async function load(){setBusy(true);setMessage('');const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}const p=await supabase.from('profiles').select('app_role').eq('id',u.user.id).single();if(p.error||p.data?.app_role!=='employee'){location.href=p.data?'/manager':'/';return}const {data,error}=await supabase.rpc('employee_self_setup_status',{});if(error){setMessage(c.verifyError);setReady(true);setBusy(false);return}const st=(data||{}) as Setup;setSetup(st);if(st.status!=='approved'){location.href='/employee/setup';return}if(st.employment_status==='active'&&st.access_allowed!==false){location.href='/employee';return}setReady(true);setBusy(false)}
 async function signOut(){await supabase.auth.signOut();location.href='/'}
 if(!ready)return <main className={styles.page}>{c.checking}</main>;
 const suspended=setup?.employment_status==='suspended';
 return <main className={styles.page}>
  <header className={styles.header}><div className={styles.brand}><small>{c.staff}</small><strong>{c.title}</strong></div><span className={styles.iconButton}>{suspended?<ShieldAlert size={20}/>:<LockKeyhole size={20}/>}</span></header>
  {message&&<div className={styles.error}>{message}</div>}
  <section className={styles.hero}><small>{suspended?c.suspended:c.inactive}</small><h1>{suspended?c.suspendedHeading:c.inactiveHeading}</h1><p>{setup?.status_reason||c.questions}</p></section>
  <section className={styles.setupCard}><h2>{c.meaning}</h2><p className={styles.muted}>{suspended?c.suspendedBody:c.inactiveBody}</p>{setup?.status_changed_at&&<p className={styles.muted}>{c.updated} {new Date(setup.status_changed_at).toLocaleString(localeCode)}.</p>}<div className={styles.actions}><button className={styles.button} disabled={busy} onClick={load}><RefreshCw size={16}/> {c.checkAgain}</button><a className={`${styles.button} ${styles.secondary}`} href="/account"><UserRound size={16}/> {c.account}</a><button className={`${styles.button} ${styles.secondary}`} onClick={signOut}><LogOut size={16}/> {c.signOut}</button></div></section>
 </main>
}
