'use client';

import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,CalendarDays,Clock3,Home,MessageSquare,Repeat2,UserRound} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {businessDateInZone} from '@/lib/intermediate-hardening';
import {addDateDays,dateDayOfWeek,shiftNetHours,zonedLocalToIso} from '@/lib/scheduling-engine';
import styles from '../employee.module.css';

type Profile={app_role:'admin'|'manager'|'employee';location_id:string|null};
type Setup={status:string;employee_id?:string|null};
type Shift={id:string;employee_id:string|null;role_id:string|null;starts_at:string;ends_at:string;break_minutes:number;status:string;notes:string|null;coverage_requirement_id:string|null};
type Role={id:string;name:string};
type BreakRow={id:string;shift_id:string;starts_at:string;duration_minutes:number;paid:boolean;status:string};
type Period={id:string;starts_on:string;ends_on:string;status:string};

const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const mondayOf=(date:string)=>addDateDays(date,-((dateDayOfWeek(date)+6)%7));
const shortDate=(d:string)=>new Date(`${d}T12:00:00Z`).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});

export default function EmployeeSchedule(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[profile,setProfile]=useState<Profile|null>(null),[employeeId,setEmployeeId]=useState(''),[weekStart,setWeekStart]=useState(()=>mondayOf(businessDateInZone())),[period,setPeriod]=useState<Period|null>(null),[shifts,setShifts]=useState<Shift[]>([]),[roles,setRoles]=useState<Role[]>([]),[breaks,setBreaks]=useState<BreakRow[]>([]);
 useEffect(()=>{void init()},[]);
 async function init(){const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}const p=await supabase.from('profiles').select('app_role,location_id').eq('id',u.user.id).single();if(!p.data){setMessage('Could not load your account.');setReady(true);return}const pr=p.data as Profile;setProfile(pr);if(pr.app_role!=='employee'){location.href='/manager';return}const s=await supabase.rpc('employee_self_setup_status',{});const st=(s.data||{status:'not_started'}) as Setup;if(s.error||st.status!=='approved'||!st.employee_id){location.href='/employee/setup';return}setEmployeeId(st.employee_id);await loadWeek(st.employee_id,weekStart);setReady(true)}
 async function loadWeek(emp=employeeId,ws=weekStart){if(!emp||!profile?.location_id&&ready)return;setBusy(true);setMessage('');const loc=profile?.location_id;const tz='America/New_York',from=zonedLocalToIso(ws,'00:00:00',tz),to=zonedLocalToIso(addDateDays(ws,7),'00:00:00',tz);const [p,s,r,b]=await Promise.all([
  supabase.from('schedule_periods').select('id,starts_on,ends_on,status').eq('starts_on',ws).eq('ends_on',addDateDays(ws,6)).maybeSingle(),
  supabase.from('schedule_shifts').select('id,employee_id,role_id,starts_at,ends_at,break_minutes,status,notes,coverage_requirement_id').eq('employee_id',emp).in('status',['scheduled','covered']).gte('starts_at',from).lt('starts_at',to).order('starts_at'),
  supabase.from('employee_roles').select('id,name').order('name'),
  supabase.from('schedule_shift_breaks').select('id,shift_id,starts_at,duration_minutes,paid,status').gte('starts_at',from).lt('starts_at',to).order('starts_at')
 ]);if(p.error||s.error||r.error||b.error)setMessage('Some schedule details could not be loaded.');setPeriod((p.data??null) as Period|null);setShifts((s.data??[]) as Shift[]);setRoles((r.data??[]) as Role[]);setBreaks((b.data??[]) as BreakRow[]);setBusy(false)}
 async function changeWeek(days:number){if(busy)return;const ws=addDateDays(weekStart,days);setWeekStart(ws);await loadWeek(employeeId,ws)}
 async function offer(s:Shift){if(busy)return;const note=prompt('Optional note for coworkers about this shift:')||'';if(!confirm('Put this shift up for grabs? You remain responsible until another employee is approved and the schedule is reassigned.'))return;setBusy(true);const {error}=await supabase.rpc('offer_my_shift_to_pool',{p_shift_id:s.id,p_comment:note.trim().slice(0,2000)||null,p_recipient_employee_ids:null,p_offered_starts_at:null,p_offered_ends_at:null});setMessage(error?error.message:'Shift is now in the Shift Pool. You are still responsible until coverage is approved.');setBusy(false)}
 async function coverage(s:Shift){if(busy)return;const reason=prompt('Why do you need coverage? (optional)')||'';setBusy(true);const {error}=await supabase.from('shift_change_requests').insert({location_id:profile?.location_id,shift_id:s.id,request_type:'coverage',requested_by_employee_id:employeeId,reason:reason.trim().slice(0,2000)||null});setMessage(error?error.message:'Coverage request sent to management.');setBusy(false)}
 const weekEnd=addDateDays(weekStart,6),total=useMemo(()=>shifts.reduce((a,s)=>a+shiftNetHours(s.starts_at,s.ends_at,s.break_minutes),0),[shifts]),roleName=(id:string|null)=>roles.find(r=>r.id===id)?.name||'Shift';
 if(!ready)return <main className={styles.page}>Loading your schedule…</main>;
 return <main className={styles.page}>
  <header className={styles.header}><a className={styles.topLink} href="/employee"><ArrowLeft size={20}/></a><div className={styles.brand}><small>El Molino Staff</small><strong>My Schedule</strong></div><span/></header>
  {message&&<div className={styles.notice}>{message}</div>}
  <div className={styles.metricGrid}><div className={styles.metric}><b>{shifts.length}</b><span>published shifts</span></div><div className={styles.metric}><b>{total.toFixed(1)}</b><span>scheduled hours</span></div></div>
  <div className={styles.weekNav}><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>changeWeek(-7)}>Previous</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>{const ws=mondayOf(businessDateInZone());setWeekStart(ws);void loadWeek(employeeId,ws)}}>This week</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>changeWeek(7)}>Next</button></div>
  <section className={styles.setupCard}><div className={styles.sectionHead}><h2>{shortDate(weekStart)} – {shortDate(weekEnd)}</h2><span>{period?.status==='published'?'Published':'Published shifts only'}</span></div><p className={styles.muted}>This view only shows shifts assigned to you. Draft manager schedules are never shown here.</p></section>
  <section className={styles.section}>{DAYS.map((name,i)=>{const date=addDateDays(weekStart,i),day=shifts.filter(s=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s.starts_at))===date);return <div className={styles.scheduleDay} key={date}><h3>{name} · {shortDate(date)}</h3>{day.map(s=>{const br=breaks.filter(b=>b.shift_id===s.id);return <article className={styles.shift} key={s.id}><div className={styles.shiftHead}><div><h4>{roleName(s.role_id)}</h4><small>{new Date(s.starts_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} – {new Date(s.ends_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} · {shiftNetHours(s.starts_at,s.ends_at,s.break_minutes).toFixed(1)} hrs</small></div><span className={styles.pill}>{s.status}</span></div>{s.notes&&<small>{s.notes}</small>}{br.map(x=><small key={x.id}>{x.paid?'Paid':'Unpaid'} break · {new Date(x.starts_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} · {x.duration_minutes} min</small>)}<div className={styles.actions}><button className={styles.button} disabled={busy} onClick={()=>offer(s)}>Offer Up</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>coverage(s)}>Need Coverage</button><a className={`${styles.button} ${styles.secondary}`} href="/schedule">Trade Shift</a></div></article>})}{!day.length&&<div className={styles.empty}>Off</div>}</div>})}</section>
  <section className={styles.section}><div className={styles.grid}><a className={styles.card} href="/schedule/pool"><Repeat2/><b>Shift Pool</b><small>Pick up open shifts or follow your offered shifts.</small></a><a className={styles.card} href="/schedule/requests"><Clock3/><b>Requests</b><small>Availability, time off and scheduling preferences.</small></a></div></section>
  <nav className={styles.tabs} aria-label="Staff navigation"><a className={styles.tab} href="/employee"><Home size={19}/>Home</a><a className={`${styles.tab} ${styles.tabActive}`} href="/employee/schedule"><CalendarDays size={19}/>Schedule</a><a className={styles.tab} href="/schedule/requests"><Clock3 size={19}/>Requests</a><a className={styles.tab} href="/team"><MessageSquare size={19}/>Team</a><a className={styles.tab} href="/account"><UserRound size={19}/>More</a></nav>
 </main>
}
