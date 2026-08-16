'use client';

import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';
import styles from '../../ops-tools.module.css';

type Profile={app_role:'admin'|'manager'|'employee';location_id:string|null};
type Claim={id:string;user_id:string;first_name:string;last_name:string;phone:string|null;status:'pending'|'approved'|'changes_requested'|'rejected';employee_id:string|null;manager_note:string|null;submitted_at:string;reviewed_at:string|null};
type Role={id:string;name:string;department:string};
type RoleClaim={claim_id:string;role_id:string};
type Employee={id:string;full_name:string;user_id:string|null;active:boolean};

export default function TeamSetupPage(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[profile,setProfile]=useState<Profile|null>(null),[claims,setClaims]=useState<Claim[]>([]),[roles,setRoles]=useState<Role[]>([]),[roleClaims,setRoleClaims]=useState<RoleClaim[]>([]),[employees,setEmployees]=useState<Employee[]>([]),[selectedRoles,setSelectedRoles]=useState<Record<string,string[]>>({}),[existing,setExisting]=useState<Record<string,string>>({});
 useEffect(()=>{void load()},[]);
 async function load(){setBusy(true);setMessage('');const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}const p=await supabase.from('profiles').select('app_role,location_id').eq('id',u.user.id).single();if(!p.data||!['admin','manager'].includes(p.data.app_role)){location.href='/employee';return}const pr=p.data as Profile;setProfile(pr);const [c,r,rc,e]=await Promise.all([
  supabase.from('employee_self_setup_claims').select('id,user_id,first_name,last_name,phone,status,employee_id,manager_note,submitted_at,reviewed_at').eq('location_id',pr.location_id).order('submitted_at',{ascending:true}),
  supabase.from('employee_roles').select('id,name,department').eq('location_id',pr.location_id).neq('department','management').order('department').order('name'),
  supabase.from('employee_self_setup_role_claims').select('claim_id,role_id'),
  supabase.from('employees').select('id,full_name,user_id,active').eq('location_id',pr.location_id).is('deleted_at',null).order('full_name')
 ]);if(c.error||r.error||rc.error||e.error)setMessage(c.error?.message||r.error?.message||rc.error?.message||e.error?.message||'Could not load team setup.');const cs=(c.data??[]) as Claim[],rr=(rc.data??[]) as RoleClaim[];setClaims(cs);setRoles((r.data??[]) as Role[]);setRoleClaims(rr);setEmployees((e.data??[]) as Employee[]);const map:Record<string,string[]>={};for(const claim of cs)map[claim.id]=rr.filter(x=>x.claim_id===claim.id).map(x=>x.role_id);setSelectedRoles(map);setBusy(false);setReady(true)}
 function toggle(claimId:string,roleId:string){setSelectedRoles(m=>{const now=m[claimId]||[];return {...m,[claimId]:now.includes(roleId)?now.filter(x=>x!==roleId):[...now,roleId]}})}
 async function review(c:Claim,decision:'approved'|'changes_requested'|'rejected'){
  if(busy)return;let note:string|null=null;if(decision!=='approved'){note=prompt(decision==='changes_requested'?'What should this employee correct?':'Reason / note for this employee:')?.trim()||null;if(decision==='changes_requested'&&!note)return}
  if(decision==='rejected'&&!confirm(`Reject ${c.first_name} ${c.last_name}'s staff profile?`))return;
  const roleIds=selectedRoles[c.id]||[];if(decision==='approved'&&!roleIds.length){setMessage('Choose at least one verified job role before approving.');return}
  setBusy(true);const {error}=await supabase.rpc('review_employee_self_setup',{p_claim_id:c.id,p_decision:decision,p_role_ids:decision==='approved'?roleIds:null,p_existing_employee_id:decision==='approved'?(existing[c.id]||null):null,p_manager_note:note});setMessage(error?error.message:decision==='approved'?`${c.first_name} ${c.last_name} is approved and scheduling-ready.`:decision==='changes_requested'?'Update request sent to the employee.':'Employee setup rejected.');await load();setBusy(false)
 }
 const pending=claims.filter(c=>c.status==='pending').length,changes=claims.filter(c=>c.status==='changes_requested').length,approved=claims.filter(c=>c.status==='approved').length,rejected=claims.filter(c=>c.status==='rejected').length;
 const unlinked=useMemo(()=>employees.filter(e=>e.active&&!e.user_id).length,[employees]);
 if(!ready)return <main className={styles.page}>Loading team setup…</main>;
 if(!profile)return null;
 return <main className={styles.page}>
  <div className={styles.top}><div><h1>Employee App Setup</h1><p>Verify every staff profile and job role before schedule publishing begins.</p></div><Link className={styles.back} href="/manager">Back to Manager</Link></div>
  {message&&<div className={message.toLowerCase().includes('could not')||message.toLowerCase().includes('choose at least')?styles.error:styles.notice}>{message}</div>}
  <div className={styles.grid}><Metric label="Approved" value={approved}/><Metric label="Waiting review" value={pending}/><Metric label="Needs changes" value={changes}/><Metric label="Existing unlinked roster" value={unlinked}/></div>
  <section className={styles.section}><div className={styles.card}><h2>How this works</h2><p>Employees enter their first and last name and select every job they actually work. You verify the choices once. Approval links the account to an existing same-name employee when there is one, or creates the employee record when there is not. The approved roles become the qualifications used by scheduling.</p></div></section>
  <section className={styles.section}><h2>Waiting for review</h2><div className={styles.list}>{claims.filter(c=>c.status!=='approved').map(c=><div className={styles.entry} key={c.id}><div className={styles.entryHead}><div><h3>{c.first_name} {c.last_name}</h3><small>{c.phone||'No phone'} · submitted {new Date(c.submitted_at).toLocaleString()}</small></div><span className={styles.pill}>{c.status.replaceAll('_',' ')}</span></div>{c.manager_note&&<div className={styles.notice} style={{marginTop:10}}>{c.manager_note}</div>}<div className={styles.formGrid} style={{marginTop:12}}><label className={styles.field}><span>Link to existing roster record (optional)</span><select value={existing[c.id]||''} onChange={e=>setExisting(m=>({...m,[c.id]:e.target.value}))}><option value="">Auto-match same name or create new</option>{employees.filter(e=>!e.user_id||e.user_id===c.user_id).map(e=><option value={e.id} key={e.id}>{e.full_name}{e.user_id?' · already linked':''}</option>)}</select></label></div><div className={styles.details}>{roles.map(r=><label className={styles.checkbox} key={r.id}><input type="checkbox" checked={(selectedRoles[c.id]||[]).includes(r.id)} onChange={()=>toggle(c.id,r.id)}/>{r.name}</label>)}</div><div className={styles.actions}><button className={styles.button} disabled={busy} onClick={()=>review(c,'approved')}>Approve Profile</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>review(c,'changes_requested')}>Request Changes</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>review(c,'rejected')}>Reject</button></div></div>)}{!claims.some(c=>c.status!=='approved')&&<div className={styles.empty}>No employee profiles are waiting for review.</div>}</div></section>
  <section className={styles.section}><h2>Approved staff</h2><div className={styles.list}>{claims.filter(c=>c.status==='approved').map(c=><div className={styles.entry} key={c.id}><div className={styles.entryHead}><div><h3>{c.first_name} {c.last_name}</h3><small>{(selectedRoles[c.id]||[]).map(id=>roles.find(r=>r.id===id)?.name).filter(Boolean).join(' · ')||'No role labels loaded'}</small></div><span className={styles.pill}>ready</span></div></div>)}{!approved&&<div className={styles.empty}>Approved staff will appear here.</div>}</div></section>
  {rejected>0&&<section className={styles.section}><div className={styles.card}><b>{rejected} rejected setup request{rejected===1?'':'s'}</b><p>Rejected employees can correct and resubmit after speaking with management.</p></div></section>}
 </main>
}
function Metric({label,value}:{label:string;value:number}){return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div>}
