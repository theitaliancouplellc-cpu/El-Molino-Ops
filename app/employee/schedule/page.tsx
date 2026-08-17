'use client';

import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,CalendarDays,Clock3,Home,MessageSquare,RefreshCw,Repeat2,UserRound} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {businessDateInZone} from '@/lib/intermediate-hardening';
import {addDateDays,dateDayOfWeek,shiftNetHours,zonedLocalToIso} from '@/lib/scheduling-engine';
import {employeeScheduleCacheAge,readEmployeeScheduleCache,writeEmployeeScheduleCache} from '@/lib/employee-schedule-cache';
import {useI18n} from '@/lib/i18n';
import {scheduleI18n} from '@/lib/i18n-schedule';
import styles from '../employee.module.css';

type Profile={app_role:'admin'|'manager'|'employee';location_id:string|null};
type Setup={status:string;employee_id?:string|null};
type Shift={id:string;employee_id:string|null;role_id:string|null;starts_at:string;ends_at:string;break_minutes:number;status:string;notes:string|null;coverage_requirement_id:string|null};
type Role={id:string;name:string};
type BreakRow={id:string;shift_id:string;starts_at:string;duration_minutes:number;paid:boolean;status:string};
type Period={id:string;starts_on:string;ends_on:string;status:string;revision:number;published_at:string|null};
type NoticeContext={event_key:string;data:Record<string,unknown>};
type TradeCandidate={shift_id:string;employee_id:string;employee_name:string;role_id:string;role_name:string;starts_at:string;ends_at:string};

const mondayOf=(date:string)=>addDateDays(date,-((dateDayOfWeek(date)+6)%7));
const validDate=(value:string|null)=>!!value&&/^\d{4}-\d{2}-\d{2}$/.test(value);

export default function EmployeeSchedule(){
 const {locale}=useI18n(),tx=scheduleI18n(locale),dateLocale=locale==='es'?'es-US':'en-US';
 const shortDate=(d:string)=>new Date(`${d}T12:00:00Z`).toLocaleDateString(dateLocale,{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[cachedAt,setCachedAt]=useState<string|null>(null),[online,setOnline]=useState(true),[profile,setProfile]=useState<Profile|null>(null),[employeeId,setEmployeeId]=useState(''),[weekStart,setWeekStart]=useState(()=>mondayOf(businessDateInZone())),[period,setPeriod]=useState<Period|null>(null),[shifts,setShifts]=useState<Shift[]>([]),[roles,setRoles]=useState<Role[]>([]),[breaks,setBreaks]=useState<BreakRow[]>([]),[swapSource,setSwapSource]=useState<string|null>(null),[swapTarget,setSwapTarget]=useState(''),[swapCandidates,setSwapCandidates]=useState<TradeCandidate[]>([]),[changedShiftIds,setChangedShiftIds]=useState<Set<string>>(new Set());
 useEffect(()=>{void init();const sync=()=>setOnline(navigator.onLine);sync();addEventListener('online',sync);addEventListener('offline',sync);return()=>{removeEventListener('online',sync);removeEventListener('offline',sync)}},[]);
 async function init(){
  const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('app_role,location_id').eq('id',u.user.id).single();if(!p.data){setMessage(tx.accountError);setReady(true);return}
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
  setChangedShiftIds(new Set(ids));if(ids.length)setMessage(`${ids.length} ${ids.length===1?tx.updatedSingular:tx.updatedPlural}`)
 }
 async function loadWeek(emp=employeeId,ws=weekStart){if(!emp)return;setBusy(true);setMessage('');const tz='America/New_York',from=zonedLocalToIso(ws,'00:00:00',tz),to=zonedLocalToIso(addDateDays(ws,7),'00:00:00',tz);const [p,s,r,b]=await Promise.all([
  supabase.from('schedule_periods').select('id,starts_on,ends_on,status,revision,published_at').eq('starts_on',ws).eq('ends_on',addDateDays(ws,6)).maybeSingle(),
  supabase.from('schedule_shifts').select('id,employee_id,role_id,starts_at,ends_at,break_minutes,status,notes,coverage_requirement_id').eq('employee_id',emp).in('status',['scheduled','covered']).gte('starts_at',from).lt('starts_at',to).order('starts_at'),
  supabase.from('employee_roles').select('id,name').order('name'),
  supabase.from('schedule_shift_breaks').select('id,shift_id,starts_at,duration_minutes,paid,status').gte('starts_at',from).lt('starts_at',to).order('starts_at')
 ]);const failed=[p,s,r,b].some(x=>x.error);if(failed){const cached=readEmployeeScheduleCache<Period,Shift,Role,BreakRow>(emp,ws);if(cached){setPeriod(cached.period);setShifts(cached.shifts);setRoles(cached.roles);setBreaks(cached.breaks);setCachedAt(cached.savedAt);setMessage(`${tx.connectionSaved} ${employeeScheduleCacheAge(cached.savedAt)}.`)}else setMessage(tx.noSaved)}else{const nextPeriod=(p.data??null) as Period|null,nextShifts=(s.data??[]) as Shift[],nextRoles=(r.data??[]) as Role[],nextBreaks=(b.data??[]) as BreakRow[];setPeriod(nextPeriod);setShifts(nextShifts);setRoles(nextRoles);setBreaks(nextBreaks);setCachedAt(null);writeEmployeeScheduleCache({employeeId:emp,weekStart:ws,period:nextPeriod,shifts:nextShifts,roles:nextRoles,breaks:nextBreaks})}setSwapSource(null);setSwapTarget('');setSwapCandidates([]);setBusy(false)}
 function requireConnection(){if(online&&navigator.onLine)return true;setMessage(tx.offline);return false}
 async function changeWeek(days:number){if(busy)return;const ws=addDateDays(weekStart,days);setWeekStart(ws);setChangedShiftIds(new Set());history.replaceState(null,'',`/employee/schedule?week=${ws}`);await loadWeek(employeeId,ws)}
 async function thisWeek(){if(busy)return;const ws=mondayOf(businessDateInZone());setWeekStart(ws);setChangedShiftIds(new Set());history.replaceState(null,'',`/employee/schedule?week=${ws}`);await loadWeek(employeeId,ws)}
 async function offer(s:Shift){if(busy||!requireConnection())return;const note=prompt(tx.optionalCoworkerNote)||'';if(!confirm(tx.offerConfirm))return;setBusy(true);const {error}=await supabase.rpc('offer_my_shift_to_pool',{p_shift_id:s.id,p_comment:note.trim().slice(0,2000)||null,p_recipient_employee_ids:null,p_offered_starts_at:null,p_offered_ends_at:null});setMessage(error?error.message:tx.offerSuccess);setBusy(false)}
 async function coverage(s:Shift){if(busy||!requireConnection())return;const reason=prompt(tx.coverageReason)||'';setBusy(true);const {error}=await supabase.rpc('submit_my_shift_change_request',{p_shift_id:s.id,p_request_type:'coverage',p_target_shift_id:null,p_reason:reason.trim().slice(0,2000)||null});setMessage(error?error.message:tx.coverageSuccess);setBusy(false)}
 async function beginTrade(s:Shift){if(busy||!requireConnection())return;setBusy(true);setMessage('');const {data,error}=await supabase.rpc('staff_trade_candidates',{p_shift_id:s.id});if(error){setMessage(tx.tradeLoadError);setBusy(false);return}setSwapSource(s.id);setSwapTarget('');setSwapCandidates((data??[]) as TradeCandidate[]);setBusy(false)}
 async function submitSwap(){if(busy||!swapSource||!swapTarget||!requireConnection())return;const target=swapCandidates.find(s=>s.shift_id===swapTarget);if(!target)return setMessage(tx.chooseCoworker);setBusy(true);const {error}=await supabase.rpc('submit_my_shift_change_request',{p_shift_id:swapSource,p_request_type:'swap',p_target_shift_id:target.shift_id,p_reason:'Employee requested reciprocal shift trade'});setMessage(error?error.message:tx.tradeSuccess);if(!error){setSwapSource(null);setSwapTarget('');setSwapCandidates([])}setBusy(false)}
 const weekEnd=addDateDays(weekStart,6),total=useMemo(()=>shifts.reduce((a,s)=>a+shiftNetHours(s.starts_at,s.ends_at,s.break_minutes),0),[shifts]),roleName=(id:string|null)=>roles.find(r=>r.id===id)?.name||tx.shift;
 if(!ready)return <main className={styles.page}>{tx.loading}</main>;
 return <main className={styles.page}>
  <header className={styles.header}><a className={styles.iconButton} href="/employee" aria-label={tx.backHome}><ArrowLeft size={20}/></a><div className={styles.brand}><small>{tx.staff}</small><strong>{tx.title}</strong></div><button className={styles.iconButton} disabled={busy} aria-label={tx.refresh} onClick={()=>loadWeek()}><RefreshCw size={18}/></button></header>
  {message&&<div className={styles.notice}>{message}</div>}{cachedAt&&<div className={styles.notice} role="status">{tx.savedSchedule} · {employeeScheduleCacheAge(cachedAt)} · {tx.viewOnly}</div>}
  <div className={styles.metricGrid}><div className={styles.metric}><b>{shifts.length}</b><span>{tx.publishedShifts}</span></div><div className={styles.metric}><b>{total.toFixed(1)}</b><span>{tx.scheduledHours}</span></div></div>
  <div className={styles.weekNav}><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>changeWeek(-7)}>{tx.previous}</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={thisWeek}>{tx.thisWeek}</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>changeWeek(7)}>{tx.next}</button></div>
  <section className={styles.setupCard}><div className={styles.sectionHead}><h2>{shortDate(weekStart)} – {shortDate(weekEnd)}</h2><span>{period?.status==='published'?`${tx.published} · ${tx.revision} ${period.revision}`:tx.publishedOnly}</span></div><p className={styles.muted}>{tx.privacy}</p></section>
  <section className={styles.section}>{tx.days.map((name,i)=>{const date=addDateDays(weekStart,i),day=shifts.filter(s=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s.starts_at))===date);return <div className={styles.scheduleDay} key={date}><h3>{name} · {shortDate(date)}</h3>{day.map(s=>{const br=breaks.filter(b=>b.shift_id===s.id),changed=changedShiftIds.has(s.id);return <article className={`${styles.shift} ${changed?styles.changedShift:''}`} key={s.id}>{changed&&<div className={styles.changedLabel}>{tx.updated}</div>}<div className={styles.shiftHead}><div><h4>{roleName(s.role_id)}</h4><small>{new Date(s.starts_at).toLocaleTimeString(dateLocale,{hour:'numeric',minute:'2-digit'})} – {new Date(s.ends_at).toLocaleTimeString(dateLocale,{hour:'numeric',minute:'2-digit'})} · {shiftNetHours(s.starts_at,s.ends_at,s.break_minutes).toFixed(1)} {tx.hours}</small></div><span className={styles.pill}>{s.status}</span></div>{s.notes&&<small>{s.notes}</small>}{br.map(x=><small key={x.id}>{x.paid?tx.paid:tx.unpaid} {tx.breakLabel} · {new Date(x.starts_at).toLocaleTimeString(dateLocale,{hour:'numeric',minute:'2-digit'})} · {x.duration_minutes} {tx.minutes}</small>)}<div className={styles.actions}><button className={styles.button} disabled={busy} onClick={()=>offer(s)}>{tx.offerUp}</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>coverage(s)}>{tx.needCoverage}</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>beginTrade(s)}>{tx.tradeShift}</button></div></article>})}{!day.length&&<div className={styles.empty}>{tx.off}</div>}</div>})}</section>
  {swapSource&&<section className={styles.section}><div className={styles.setupCard}><h2>{tx.tradeThis}</h2><p className={styles.muted}>{tx.tradeHelp}</p><label className={styles.field}><span>{tx.coworkerShift}</span><select value={swapTarget} onChange={e=>setSwapTarget(e.target.value)}><option value="">{tx.chooseEligible}</option>{swapCandidates.map(s=><option key={s.shift_id} value={s.shift_id}>{s.employee_name} · {s.role_name} · {new Date(s.starts_at).toLocaleString(dateLocale,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</option>)}</select></label>{!swapCandidates.length&&<div className={styles.empty}>{tx.noMatches}</div>}<div className={styles.actions}><button className={styles.button} disabled={busy||!swapTarget} onClick={submitSwap}>{tx.sendTrade}</button><button className={`${styles.button} ${styles.secondary}`} onClick={()=>{setSwapSource(null);setSwapTarget('');setSwapCandidates([])}}>{locale==='es'?'Cancelar':'Cancel'}</button></div></div></section>}
  <section className={styles.section}><div className={styles.grid}><a className={styles.card} href="/employee/shift-pool"><Repeat2/><b>{tx.shiftPool}</b><small>{tx.shiftPoolHelp}</small></a><a className={styles.card} href="/employee/requests"><Clock3/><b>{tx.requests}</b><small>{tx.requestsHelp}</small></a></div></section>
  <nav className={styles.tabs} aria-label={tx.staffNavigation}><a className={styles.tab} href="/employee"><Home size={19}/>{tx.home}</a><a className={`${styles.tab} ${styles.tabActive}`} href="/employee/schedule"><CalendarDays size={19}/>{tx.schedule}</a><a className={styles.tab} href="/employee/requests"><Clock3 size={19}/>{tx.requests}</a><a className={styles.tab} href="/employee/team"><MessageSquare size={19}/>{tx.team}</a><a className={styles.tab} href="/account"><UserRound size={19}/>{tx.more}</a></nav>
 </main>
}
