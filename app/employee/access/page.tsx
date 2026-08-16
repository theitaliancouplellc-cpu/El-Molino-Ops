'use client';

import {useEffect,useState} from 'react';
import {LockKeyhole,LogOut,RefreshCw,ShieldAlert,UserRound} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import styles from '../employee.module.css';

type Setup={status:string;employment_status?:'active'|'suspended'|'inactive'|null;status_reason?:string|null;status_changed_at?:string|null;full_name?:string|null;access_allowed?:boolean};

export default function EmployeeAccess(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[setup,setSetup]=useState<Setup|null>(null),[message,setMessage]=useState('');
 useEffect(()=>{void load()},[]);
 async function load(){setBusy(true);setMessage('');const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}const p=await supabase.from('profiles').select('app_role').eq('id',u.user.id).single();if(p.error||p.data?.app_role!=='employee'){location.href=p.data?'/manager':'/';return}const {data,error}=await supabase.rpc('employee_self_setup_status',{});if(error){setMessage('Could not verify your staff access.');setReady(true);setBusy(false);return}const st=(data||{}) as Setup;setSetup(st);if(st.status!=='approved'){location.href='/employee/setup';return}if(st.employment_status==='active'&&st.access_allowed!==false){location.href='/employee';return}setReady(true);setBusy(false)}
 async function signOut(){await supabase.auth.signOut();location.href='/'}
 if(!ready)return <main className={styles.page}>Checking staff access…</main>;
 const suspended=setup?.employment_status==='suspended';
 return <main className={styles.page}>
  <header className={styles.header}><div className={styles.brand}><small>El Molino Staff</small><strong>Account Access</strong></div><span className={styles.iconButton}>{suspended?<ShieldAlert size={20}/>:<LockKeyhole size={20}/>}</span></header>
  {message&&<div className={styles.error}>{message}</div>}
  <section className={styles.hero}><small>{suspended?'Access suspended':'Account inactive'}</small><h1>{suspended?'Your staff access is temporarily suspended.':'Your staff account is not active.'}</h1><p>{setup?.status_reason||'Please speak with a manager if you have questions about your current employment status.'}</p></section>
  <section className={styles.setupCard}><h2>What this means</h2><p className={styles.muted}>{suspended?'Your employee profile and history remain intact, but scheduling, Shift Pool, team, time-clock, training and tip tools are unavailable until management restores access.':'Your employee profile remains linked for recordkeeping, but operational staff tools are unavailable while the account is inactive.'}</p>{setup?.status_changed_at&&<p className={styles.muted}>Status updated {new Date(setup.status_changed_at).toLocaleString()}.</p>}<div className={styles.actions}><button className={styles.button} disabled={busy} onClick={load}><RefreshCw size={16}/> Check access again</button><a className={`${styles.button} ${styles.secondary}`} href="/account"><UserRound size={16}/> Account & Security</a><button className={`${styles.button} ${styles.secondary}`} onClick={signOut}><LogOut size={16}/> Sign out</button></div></section>
 </main>
}
