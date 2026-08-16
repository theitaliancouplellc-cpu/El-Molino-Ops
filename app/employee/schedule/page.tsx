'use client';

import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,CalendarDays,Clock3,Home,MessageSquare,RefreshCw,Repeat2,UserRound} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {businessDateInZone} from '@/lib/intermediate-hardening';
import {addDateDays,dateDayOfWeek,shiftNetHours,zonedLocalToIso} from '@/lib/scheduling-engine';
import styles from '../employee.module.css';

type Profile={app_role:'admin'|'manager'|'employee';location_id:string|null};
type Setup={status:string;employee_id?:string|null};
type Shift={id:string;employee_id:string|null;role_id:string|null;starts_at:string;ends_at:string;break_minutes:number;status:string;notes:string|null;coverage_requirement_id:string|null};
type Role={id:string;name:string};
type BreakRow={id:string;shift_id:string;starts_at:string;duration_minutes:number;paid:boolean;status:string};
type Period={id:string;starts_on:string;ends_on:string;status:string;revision:number;published_at:string|null};
type NoticeContext={event_key:string;data:Record<string,unknown>};
type TradeCandidate={shift_id:string;employee_id:string;employee_name:string;role_id:string;role_name:string;starts_at:string;ends_at:string};

const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const mondayOf=(date:string)=>addDateDays(date,-((dateDayOfWeek(date)+6)%7));
const shortDate=(d:string)=>new Date(`${d}T12:00:00Z`).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
const validDate=(value:string|null)=>!!value&&/^\d{4}-\d{2}-\d{2}$/.test(value);

export default function EmployeeSchedule(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[profile,setProfile]=useState<Profile|null>(null),[employeeId,setEmployeeId]=useState(''),[weekStart,setWeekStart]=useState(()=>mondayOf(businessDateInZone())),[period,setPeriod]=useState<Period|null>(null),[shifts,setShifts]=useState<Shift[]>([]),[roles,setRoles]=useState<Role[]>([]),[breaks,setBreaks]=useState<BreakRow[]>([]),[swapSource,setSwapSource]=useState<string|null>(null),[swapTarget,setSwapTarget]=useState(''),[swapCandidates,setSwapCandidates]=useState<TradeCandidate[]>([]),[changedShiftIds,setChangedShiftIds]=useState<Set<string>>(new Set());
 useEffect(()=>{void init()},[]);
 async function init(){
  const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('app_role,location_id').eq('id',u.user.id).single();if(!p.data){setMessage('Could not load your account.');setReady(true);return}
  const pr=p.data as Profile;setProfile(pr);if(pr.app_role!=='employee'){location.href='/manager';return}
  const s=await supabase.rpc('employee_self_setup_status',{});const st=(s.data||{status:'not_started'}) as Setup;if(s.error||st.status!=='approved'||!st.employee_id){location.href='/employee/setup';return}
  const params=new URLSearchParams(location.search),requested=params.get('week'),ws=validDate(requested)?requested!:mondayOf(businessDateInZone());
  setEmployeeId(st.employee_id);setWeekStart(ws);await loadWeek(st.employee_id,ws);
  const noticeId=params.get('notice');if(noticeId)await loadNoticeContext(noticeId);
  setReady(true)
 }
 async function loadNoticeContext(id:string){
  const {data}=await supabase.from('notifications').select('event_key,data').eq('id',id).maybeSingle();
  const n=data as NoticeContext|null;if(!n||n.event_key!=='schedule.shift_changed')return;
  const raw=n.data?.changed_shift_ids,ids=Array.isArray(raw)?raw.filter((x):x is string=>typeof x==='string'):[];
  setChangedShiftIds(new Set(ids));if(ids.length)setMessage(`${ids.length} updated shift${ids.length===1?' is':'s are'} highlighted below.`)
 }
 async function loadWeek(emp=employeeId,ws=weekStart){if(!emp)return;setBusy(true);setMessage('');const tz='America/New_York',from=zonedLocalToIso(ws,'00:00:00',tz),to=zonedLocalToIso(addDateDays(ws,7),'00:00:00',tz);const [p,s,r,b]=await Promise.all([
  supabase.from('schedule_periods').select('id,starts_on,ends_on,status,revision,published_at').eq('starts_on',ws).eq('ends_on',addDateDays(ws,6)).maybeSingle(),
  supabase.from('schedule_shifts').select('id,employee_id,role_id,starts_at,ends_at,break_minutes,status,notes,coverage_requirement_id').eq('employee_id',emp).in('status',['scheduled','covered']).gte('starts_at',from).lt('starts_at',to).order('starts_at'),
  supabase.from('employee_roles').select('id,name').order('name'),
  supabase.from('schedule_shift_breaks').select('id,shift_id,starts_at,duration_minutes,paid,status').gte('starts_at',from).lt('starts_at',to).order('starts_at')
 ]);if([p,s,r,b].some(x=>x.error))setMessage('Some schedule details could not be loaded.');setPeriod((p.data??null) as Period|null);setShifts((s.data??[]) as Shift[]);setRoles((r.data??[]) as Role[]);setBreaks((b.data??[]) as BreakRow[]);setSwapSource(null);setSwapTarget('');setSwapCandidates([]);setBusy(false)}
 async function changeWeek(days:number){if(busy)return;const ws=addDateDays(weekStart,days);setWeekStart(ws);setChangedShiftIds(new Set());history.replaceState(null,'',`/employee/schedule?week=${ws}`);await loadWeek(employeeId,ws)}
 async function thisWeek(){if(busy)return;const ws=mondayOf(businessDateInZone());setWeekStart(ws);setChangedShiftIds(new Set());history.replaceState(null,'',`/employee/schedule?week=${ws}`);await loadWeek(employeeId,ws)}
 async function offer(s:Shift){if(busy)return;const note=prompt('Optional note for coworkers about this shift:')||'';if(!confirm('Put this shift up for grabs? You remain responsible until another employee is approved and the schedule is reassigned.'))return;setBusy(true);const {error}=await supabase.rpc('offer_my_shift_to_pool',{p_shift_id:s.id,p_comment:note.trim().slice(0,2000)||null,p_recipient_employee_ids:null,p_offered_starts_at:null,p_offered_ends_at:null});setMessage(error?error.message:'Shift is now in the Shift Pool. You are still responsible until coverage is approved.');setBusy(false)}
 async function coverage(s:Shift){if(busy)return;const reason=prompt('Why do you need coverage? (optional)')||'';setBusy(true);const {error}=await supabase.rpc('submit_my_shift_change_request',{p_shift_id:s.id,p_request_type:'coverage',p_target_shift_id:null,p_reason:reason.trim().slice(0,2000)||null});setMessage(error?error.message:'Coverage request sent to management. You remain responsible until management changes the schedule.');setBusy(false)}
 async function beginTrade(s:Shift){if(busy)return;setBusy(true);setMessage('');const {data,error}=await supabase.rpc('staff_trade_candidates',{p_shift_id:s.id});if(error){setMessage('Eligible trade matches could not be loaded.');setBusy(false);return}setSwapSource(s.id);setSwapTarget('');setSwapCandidates((data??[]) as TradeCandidate[]);setBusy(false)}
 async function submitSwap(){if(busy||!swapSource||!swapTarget)return;const target=swapCandidates.find(s=>s.shift_id===swapTarget);if(!target)return setMessage('Choose a valid coworker shift.');setBusy(true);const {error}=await supabase.rpc('submit_my_shift_change_request',{p_shift_id:swapSource,p_request_type:'swap',p_target_shift_id:target.shift_id,p_reason:'Employee requested reciprocal shift trade'});setMessage(error?error.message:'Trade sent to your coworker for acceptance. Management reviews it only after they accept.');if(!error){setSwapSource(null);setSwapTarget('');setSwapCandidates([])}setBusy(false)}
 const weekEnd=addDateDays(weekStart,6),total=useMemo(()=>shifts.reduce((a,s)=>a+shiftNetHours(s.starts_at,s.ends_at,s.break_minutes),0),[shifts]),roleName=(id:string|null)=>roles.find(r=>r.id===id)?.name||'Shift';
 if(!ready)return <main className={styles.page}>Loading your schedule…</main>;
 return <main className={styles.page}>
  <header className={styles.header}><a className={styles.iconButton} href="/employee" aria-label="Back to staff home"><ArrowLeft size={20}/></a><div className={styles.brand}><small>El Molino Staff</small><strong>My Schedule</strong></div><button className={styles.iconButton} disabled={busy} aria-label="Refresh schedule" onClick={()=>loadWeek()}><RefreshCw size={18}/></button></header>
  {message&&<div className={styles.notice}>{message}</div>}
  <div className={styles.metricGrid}><div className={styles.metric}><b>{shifts.length}</b><span>published shifts</span></div><div className={styles.metric}><b>{total.toFixed(1)}</b><span>scheduled hours</span></div></div>
  <div className={styles.weekNav}><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>changeWeek(-7)}>Previous</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={thisWeek}>This week</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>changeWeek(7)}>Next</button></div>
  <section className={styles.setupCard}><div className={styles.sectionHead}><h2>{shortDate(weekStart)} – {shortDate(weekEnd)}</h2><span>{period?.status==='published'?`Published · revision ${period.revision}`:'Published shifts only'}</span></div><p className={styles.muted}>This view only shows shifts assigned to you. Draft manager schedules are never shown here.</p></section>
  <section className={styles.section}>{DAYS.map((name,i)=>{const date=addDateDays(weekStart,i),day=shifts.filter(s=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s.starts_at))===date);return <div className={styles.scheduleDay} key={date}><h3>{name} · {shortDate(date)}</h3>{day.map(s=>{const br=breaks.filter(b=>b.shift_id===s.id),changed=changedShiftIds.has(s.id);return <article className={`${styles.shift} ${changed?styles.changedShift:''}`} key={s.id}>{changed&&<div className={styles.changedLabel}>Updated in the latest publication</div>}<div className={styles.shiftHead}><div><h4>{roleName(s.role_id)}</h4><small>{new Date(s.starts_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} – {new Date(s.ends_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} · {shiftNetHours(s.starts_at,s.ends_at,s.break_minutes).toFixed(1)} hrs</small></div><span className={styles.pill}>{s.status}</span></div>{s.notes&&<small>{s.notes}</small>}{br.map(x=><small key={x.id}>{x.paid?'Paid':'Unpaid'} break · {new Date(x.starts_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} · {x.duration_minutes} min</small>)}<div className={styles.actions}><button className={styles.button} disabled={busy} onClick={()=>offer(s)}>Offer Up</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>coverage(s)}>Need Coverage</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>beginTrade(s)}>Trade Shift</button></div></article>})}{!day.length&&<div className={styles.empty}>Off</div>}</div>})}</section>
  {swapSource&&<section className={styles.section}><div className={styles.setupCard}><h2>Trade this shift</h2><p className={styles.muted}>Only reciprocal matches with compatible role qualifications, approved time off and schedule overlap checks are shown. The coworker accepts first; management still approves the final trade.</p><label className={styles.field}><span>Coworker shift</span><select value={swapTarget} onChange={e=>setSwapTarget(e.target.value)}><option value="">Choose an eligible shift</option>{swapCandidates.map(s=><option key={s.shift_id} value={s.shift_id}>{s.employee_name} · {s.role_name} · {new Date(s.starts_at).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</option>)}</select></label>{!swapCandidates.length&&<div className={styles.empty}>No reciprocal trade matches are available for this shift right now.</div>}<div className={styles.actions}><button className={styles.button} disabled={busy||!swapTarget} onClick={submitSwap}>Send Trade Request</button><button className={`${styles.button} ${styles.secondary}`} onClick={()=>{setSwapSource(null);setSwapTarget('');setSwapCandidates([])}}>Cancel</button></div></div></section>}
  <section className={styles.section}><div className={styles.grid}><a className={styles.card} href="/employee/shift-pool"><Repeat2/><b>Shift Pool</b><small>Pick up eligible shifts or follow your offers and trades.</small></a><a className={styles.card} href="/employee/requests"><Clock3/><b>Requests</b><small>Availability, time off and scheduling preferences.</small></a></div></section>
  <nav className={styles.tabs} aria-label="Staff navigation"><a className={styles.tab} href="/employee"><Home size={19}/>Home</a><a className={`${styles.tab} ${styles.tabActive}`} href="/employee/schedule"><CalendarDays size={19}/>Schedule</a><a className={styles.tab} href="/employee/requests"><Clock3 size={19}/>Requests</a><a className={styles.tab} href="/employee/team"><MessageSquare size={19}/>Team</a><a className={styles.tab} href="/account"><UserRound size={19}/>More</a></nav>
 </main>
}
