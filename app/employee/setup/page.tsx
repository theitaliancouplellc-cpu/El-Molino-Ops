'use client';

import {FormEvent,useEffect,useState} from 'react';
import {ArrowLeft,CheckCircle2,Clock3,ShieldCheck} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import styles from '../employee.module.css';

type Profile={app_role:'admin'|'manager'|'employee';location_id:string|null;full_name:string|null};
type Role={id:string;name:string;department:string};
type Setup={status:string;claim_id?:string;employee_id?:string|null;first_name?:string;last_name?:string;full_name?:string;phone?:string|null;requested_role_ids?:string[];manager_note?:string|null};

export default function EmployeeSetup(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[profile,setProfile]=useState<Profile|null>(null),[roles,setRoles]=useState<Role[]>([]),[setup,setSetup]=useState<Setup|null>(null),[firstName,setFirstName]=useState(''),[lastName,setLastName]=useState(''),[phone,setPhone]=useState(''),[selected,setSelected]=useState<string[]>([]);
 useEffect(()=>{void load()},[]);
 async function load(){
  setBusy(true);setMessage('');const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('app_role,location_id,full_name').eq('id',u.user.id).single();if(p.error||!p.data){setMessage('Could not load your account.');setBusy(false);setReady(true);return}
  const pr=p.data as Profile;setProfile(pr);if(pr.app_role!=='employee'){location.href='/manager';return}
  const [r,s]=await Promise.all([supabase.from('employee_roles').select('id,name,department').neq('department','management').order('department').order('name'),supabase.rpc('employee_self_setup_status',{})]);
  if(r.error||s.error){setMessage(r.error?.message||s.error?.message||'Could not load employee setup.');setBusy(false);setReady(true);return}
  const st=(s.data||{status:'not_started'}) as Setup;setRoles((r.data??[]) as Role[]);setSetup(st);
  if(st.status==='approved'){location.href='/employee';return}
  if(st.first_name)setFirstName(st.first_name);if(st.last_name)setLastName(st.last_name);if(st.phone)setPhone(st.phone);if(Array.isArray(st.requested_role_ids))setSelected(st.requested_role_ids);
  if(st.status==='not_started'&&pr.full_name){const parts=pr.full_name.trim().split(/\s+/);if(parts.length>1){setFirstName(parts[0]);setLastName(parts.slice(1).join(' '))}}
  setBusy(false);setReady(true)
 }
 function toggle(id:string){setSelected(x=>x.includes(id)?x.filter(v=>v!==id):[...x,id])}
 async function submit(e:FormEvent){e.preventDefault();if(busy)return;if(!firstName.trim()||!lastName.trim())return setMessage('Enter your first and last name.');if(!selected.length)return setMessage('Select at least one job you actually work.');setBusy(true);const {data,error}=await supabase.rpc('submit_employee_self_setup',{p_first_name:firstName.trim(),p_last_name:lastName.trim(),p_phone:phone.trim()||null,p_role_ids:selected});if(error)setMessage(error.message);else{setSetup(data as Setup);setMessage('Submitted. A manager can now verify your name and job roles before scheduling starts.')}setBusy(false)}
 if(!ready)return <main className={styles.page}>Opening employee setup…</main>;
 if(!profile)return <main className={styles.page}>{message||'Account unavailable.'}</main>;
 const pending=setup?.status==='pending',changes=setup?.status==='changes_requested',rejected=setup?.status==='rejected';
 return <main className={styles.page}>
  <header className={styles.header}><a className={styles.topLink} href="/"><ArrowLeft size={20}/></a><div className={styles.brand}><small>El Molino · Johns Island</small><strong>Set up your staff profile</strong></div><span/></header>
  {message&&<div className={message.toLowerCase().includes('could not')||message.toLowerCase().includes('enter ')||message.toLowerCase().includes('select ')?styles.error:styles.notice}>{message}</div>}
  {pending&&<div className={styles.notice}><Clock3 size={18}/> <b>Waiting for manager review.</b> You can still correct the form and resubmit before approval.</div>}
  {changes&&<div className={styles.error}><ShieldCheck size={18}/> <b>A manager asked you to update this profile.</b>{setup?.manager_note?` ${setup.manager_note}`:''}</div>}
  {rejected&&<div className={styles.error}><b>This setup was not approved.</b>{setup?.manager_note?` ${setup.manager_note}`:' Speak with a manager before resubmitting.'}</div>}
  <section className={styles.setupCard}><h1 style={{marginTop:0}}>Tell us who you are</h1><p className={styles.muted}>Use your real first and last name, then select every job you actually work. Management reviews this once so the scheduling system starts with a clean roster.</p>
   <form className={styles.form} onSubmit={submit}><div className={styles.two}><label className={styles.field}><span>First name</span><input autoComplete="given-name" maxLength={80} value={firstName} onChange={e=>setFirstName(e.target.value)} required/></label><label className={styles.field}><span>Last name</span><input autoComplete="family-name" maxLength={80} value={lastName} onChange={e=>setLastName(e.target.value)} required/></label></div><label className={styles.field}><span>Phone number (optional)</span><input autoComplete="tel" inputMode="tel" maxLength={40} value={phone} onChange={e=>setPhone(e.target.value)}/></label>
    <div><b>What jobs do you work?</b><p className={styles.muted}>Choose all that apply. Do not choose something just because you have done it once; management will confirm the final list.</p><div className={styles.roles}>{roles.map(r=><label className={styles.role} key={r.id}><input type="checkbox" checked={selected.includes(r.id)} onChange={()=>toggle(r.id)}/><span>{r.name}</span></label>)}</div></div>
    <button className={styles.button} disabled={busy}>{busy?'Saving…':pending?'Update submission':'Submit for manager review'}</button>
   </form>
  </section>
  <section className={styles.section}><div className={styles.setupCard}><CheckCircle2 size={22}/><h2>What happens next</h2><p className={styles.muted}>A manager checks your identity and job roles. Once approved, your account becomes the employee record used for published schedules, shift trades, open shifts, availability, time off, training and staff notifications.</p></div></section>
 </main>
}
