'use client';

import {useEffect,useMemo,useState} from 'react';
import {Bell,CalendarDays,ChevronRight,Clock3,Coins,GraduationCap,Home,LogOut,MessageSquare,RefreshCw,Repeat2,UserRound} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {employeeNotificationHref,notificationTimeLabel} from '@/lib/employee-notifications';
import styles from './employee.module.css';

type Profile={full_name:string|null;app_role:'admin'|'manager'|'employee';location_id:string|null};
type Setup={status:string;employee_id?:string|null;full_name?:string|null};
type Shift={id:string;starts_at:string;ends_at:string;break_minutes:number;role_id:string|null;status:string};
type Role={id:string;name:string};
type Notice={id:string;title:string;body:string|null;href:string|null;read_at:string|null;created_at:string;type:string;category:string;event_key:string;priority:string};
type Signals={pendingRequests:number;trainingDue:number;unreadAnnouncements:number;shiftPool:number};

const hours=(s:Shift)=>Math.max(0,(new Date(s.ends_at).getTime()-new Date(s.starts_at).getTime())/3600000-(Number(s.break_minutes)||0)/60);
const countdown=(iso:string)=>{const mins=Math.max(0,Math.floor((new Date(iso).getTime()-Date.now())/60000));if(mins<60)return `in ${mins} min`;const h=Math.floor(mins/60),m=mins%60;if(h<24)return `in ${h}h${m?` ${m}m`:''}`;const d=Math.floor(h/24);return `in ${d} day${d===1?'':'s'}`};

export default function EmployeeHome(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[profile,setProfile]=useState<Profile|null>(null),[setup,setSetup]=useState<Setup|null>(null),[shifts,setShifts]=useState<Shift[]>([]),[roles,setRoles]=useState<Role[]>([]),[notices,setNotices]=useState<Notice[]>([]),[signals,setSignals]=useState<Signals>({pendingRequests:0,trainingDue:0,unreadAnnouncements:0,shiftPool:0});
 useEffect(()=>{void load()},[]);
 async function load(){
  setBusy(true);setMessage('');
  const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('full_name,app_role,location_id').eq('id',u.user.id).single();
  if(p.error||!p.data){setMessage('Could not load your staff account.');setBusy(false);setReady(true);return}
  const pr=p.data as Profile;setProfile(pr);
  if(pr.app_role!=='employee'){location.href='/manager';return}
  const st=await supabase.rpc('employee_self_setup_status',{});if(st.error){setMessage(st.error.message);setBusy(false);setReady(true);return}
  const status=(st.data||{status:'not_started'}) as Setup;setSetup(status);
  if(status.status!=='approved'||!status.employee_id){location.href='/employee/setup';return}
  const emp=status.employee_id,now=new Date().toISOString(),future=new Date(Date.now()+21*86400000).toISOString();
  const [s,r,n,to,av,ch,claims,training,announcements,pool]=await Promise.all([
    supabase.from('schedule_shifts').select('id,starts_at,ends_at,break_minutes,role_id,status').eq('employee_id',emp).in('status',['scheduled','covered']).gte('ends_at',now).lt('starts_at',future).order('starts_at').limit(40),
    supabase.from('employee_roles').select('id,name').order('name'),
    supabase.from('notifications').select('id,title,body,href,read_at,created_at,type,category,event_key,priority').order('created_at',{ascending:false}).limit(20),
    supabase.from('time_off_requests').select('id',{count:'exact',head:true}).eq('employee_id',emp).eq('status','pending'),
    supabase.from('availability_change_requests').select('id',{count:'exact',head:true}).eq('employee_id',emp).eq('status','pending'),
    supabase.from('shift_change_requests').select('id',{count:'exact',head:true}).eq('requested_by_employee_id',emp).eq('status','pending'),
    supabase.from('shift_claims').select('id',{count:'exact',head:true}).eq('employee_id',emp).eq('status','pending'),
    supabase.from('training_course_assignments').select('id',{count:'exact',head:true}).eq('employee_id',emp).in('status',['assigned','in_progress']),
    supabase.from('team_announcement_recipients').select('announcement_id',{count:'exact',head:true}).eq('employee_id',emp).is('read_at',null),
    supabase.from('shift_pool_offers').select('id',{count:'exact',head:true}).eq('status','open')
  ]);
  if([s,r,n,to,av,ch,claims,training,announcements,pool].some(x=>x.error))setMessage('Some staff-app details could not be refreshed.');
  setShifts((s.data??[]) as Shift[]);setRoles((r.data??[]) as Role[]);setNotices((n.data??[]) as Notice[]);
  setSignals({pendingRequests:(to.count||0)+(av.count||0)+(ch.count||0)+(claims.count||0),trainingDue:training.count||0,unreadAnnouncements:announcements.count||0,shiftPool:pool.count||0});
  setBusy(false);setReady(true)
 }
 async function openNotice(n:Notice){if(!n.read_at)await supabase.rpc('mark_my_notification_read',{p_notification_id:n.id});location.href=employeeNotificationHref(n.href,n.id)}
 async function signOut(){await supabase.auth.signOut();location.href='/'}
 const next=shifts[0]||null,upcomingHours=useMemo(()=>shifts.reduce((a,s)=>a+hours(s),0),[shifts]),unread=notices.filter(n=>!n.read_at).length;
 const important=notices.find(n=>!n.read_at&&(n.priority==='critical'||n.priority==='high'))||null;
 const roleName=(id:string|null)=>roles.find(r=>r.id===id)?.name||'Shift';
 if(!ready)return <main className={styles.page}>Opening staff app…</main>;
 if(!profile||setup?.status!=='approved')return null;
 const first=(profile.full_name||setup.full_name||'Team member').trim().split(/\s+/)[0];
 return <main className={styles.page}>
  <header className={styles.header}><div className={styles.brand}><small>El Molino · Johns Island</small><strong>Staff</strong></div><div className={styles.headerActions}><a className={styles.iconButton} href="/employee/notifications" aria-label={`${unread} unread notifications`}><Bell size={20}/>{unread>0&&<span className={styles.badge}>{unread>99?'99+':unread}</span>}</a><button className={styles.avatar} aria-label="Sign out" onClick={signOut}>{first.slice(0,1).toUpperCase()}</button></div></header>
  {message&&<div className={styles.notice}>{message}</div>}
  <section className={styles.hero}><small>Employee app</small><h1>Hi, {first}.</h1><p>Your shifts, requests, team updates and staff tools are all here.</p>{next?<div className={styles.next}><span>Next shift · {countdown(next.starts_at)}</span><b>{roleName(next.role_id)} · {new Date(next.starts_at).toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'})}</b><span>{new Date(next.starts_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} – {new Date(next.ends_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} · {hours(next).toFixed(1)} scheduled hrs</span></div>:<div className={styles.next}><b>No upcoming published shifts</b><span>When management publishes your schedule, it will appear here automatically.</span></div>}</section>
  {important&&<section className={styles.section}><div className={styles.sectionHead}><h2>Needs your attention</h2><a className={styles.sectionLink} href="/employee/notifications">Notification Center</a></div><button className={`${styles.row} ${styles.notificationUnread}`} onClick={()=>openNotice(important)}><span className={styles.notificationIcon}><span className={styles.dot}/></span><span className={styles.rowMain}><span className={styles.notificationMeta}><span>{important.priority==='critical'?'Critical':'Important'}</span><span>{notificationTimeLabel(important.created_at)}</span></span><b>{important.title}</b><small>{important.body||'Open for details.'}</small></span><ChevronRight size={17}/></button></section>}
  <section className={styles.section}><div className={styles.sectionHead}><h2>Right now</h2><span>Only your staff activity</span></div><div className={styles.signalGrid}><a className={styles.signal} href="/schedule/requests"><b>{signals.pendingRequests}</b><span>pending request{signals.pendingRequests===1?'':'s'}</span></a><a className={styles.signal} href="/schedule/pool"><b>{signals.shiftPool}</b><span>Shift Pool option{signals.shiftPool===1?'':'s'} visible to you</span></a><a className={styles.signal} href="/team"><b>{signals.unreadAnnouncements}</b><span>unread team announcement{signals.unreadAnnouncements===1?'':'s'}</span></a><a className={styles.signal} href="/training/courses"><b>{signals.trainingDue}</b><span>training assignment{signals.trainingDue===1?'':'s'} open</span></a></div></section>
  <section className={styles.section}><div className={styles.sectionHead}><h2>This is your app</h2><span>{shifts.length} upcoming · {upcomingHours.toFixed(1)} hrs</span></div><div className={styles.grid}>
   <a className={styles.card} href="/employee/schedule"><CalendarDays/><b>My Schedule</b><small>See only your published shifts and manage coverage.</small></a>
   <a className={styles.card} href="/schedule/pool"><Repeat2/><b>Shift Pool</b><small>Pick up eligible open shifts and view offers.</small></a>
   <a className={styles.card} href="/schedule/requests"><Clock3/><b>Availability & Time Off</b><small>Set availability and submit time-off requests.</small></a>
   <a className={styles.card} href="/team"><MessageSquare/><b>Team Hub</b><small>Announcements, recognition and team communication.</small></a>
   <a className={styles.card} href="/training/courses"><GraduationCap/><b>Training</b><small>Your assigned courses, quizzes and completion progress.</small></a>
   <a className={styles.card} href="/time-clock"><Clock3/><b>Time Clock</b><small>Your clock status, punches and attestations.</small></a>
   <a className={styles.card} href="/tips"><Coins/><b>My Tips</b><small>Your finalized tip information when available.</small></a>
   <a className={styles.card} href="/account"><UserRound/><b>My Account</b><small>Profile, security, verified roles and preferences.</small></a>
  </div></section>
  <section className={styles.section}><div className={styles.sectionHead}><h2>Notifications</h2><a className={styles.sectionLink} href="/employee/notifications">See all · {unread} unread</a></div>{notices.length?<div className={styles.list}>{notices.slice(0,6).map(n=><button className={`${styles.row} ${!n.read_at?styles.notificationUnread:''}`} key={n.id} onClick={()=>openNotice(n)}>{!n.read_at?<span className={styles.dot}/>:<Bell size={17}/>}<span className={styles.rowMain}><b>{n.title}</b><small>{n.body||notificationTimeLabel(n.created_at)}</small></span><ChevronRight size={17}/></button>)}</div>:<div className={styles.empty}>No notifications yet. Schedule updates and staff decisions will appear here.</div>}</section>
  <div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>load()}><RefreshCw size={15}/> Refresh</button><button className={`${styles.button} ${styles.secondary}`} onClick={signOut}><LogOut size={15}/> Sign out</button></div>
  <nav className={styles.tabs} aria-label="Staff navigation"><a className={`${styles.tab} ${styles.tabActive}`} href="/employee"><Home size={19}/>Home</a><a className={styles.tab} href="/employee/schedule"><CalendarDays size={19}/>Schedule</a><a className={styles.tab} href="/schedule/requests"><Clock3 size={19}/>Requests</a><a className={styles.tab} href="/team"><MessageSquare size={19}/>Team</a><a className={styles.tab} href="/account"><UserRound size={19}/>More</a></nav>
 </main>
}
