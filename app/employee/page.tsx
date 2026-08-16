'use client';

import {useEffect,useMemo,useState} from 'react';
import {Bell,CalendarDays,ChevronRight,Clock3,Coins,GraduationCap,Home,LogOut,MessageSquare,RefreshCw,Repeat2,UserRound} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {employeeNotificationHref,notificationTimeLabel} from '@/lib/employee-notifications';
import styles from './employee.module.css';

type Profile={full_name:string|null;app_role:'admin'|'manager'|'employee';location_id:string|null};
type Setup={status:string;employee_id?:string|null;full_name?:string|null};
type Shift={id:string;starts_at:string;ends_at:string;break_minutes:number;role_id:string|null;status:string;notes:string|null};
type Role={id:string;name:string};
type Notice={id:string;title:string;body:string|null;href:string|null;read_at:string|null;created_at:string;type:string;category:string;event_key:string;priority:string};
type Priority={pending_requests:number;training_open:number;training_overdue:number;unread_announcements:number;required_acknowledgments:number;urgent_announcements:number;unread_messages:number;top_priority:'announcement_ack'|'urgent_announcement'|'training_overdue'|'team_message'|'pending_request'|'none'};
type PoolSnapshot={up_for_grabs_count:number};
type Signals={pendingRequests:number;trainingDue:number;unreadAnnouncements:number;unreadMessages:number;shiftPool:number;requiredAcknowledgments:number};

const emptyPriority:Priority={pending_requests:0,training_open:0,training_overdue:0,unread_announcements:0,required_acknowledgments:0,urgent_announcements:0,unread_messages:0,top_priority:'none'};
const hours=(s:Shift)=>Math.max(0,(new Date(s.ends_at).getTime()-new Date(s.starts_at).getTime())/3600000-(Number(s.break_minutes)||0)/60);
const countdown=(iso:string)=>{const mins=Math.max(0,Math.floor((new Date(iso).getTime()-Date.now())/60000));if(mins<60)return `in ${mins} min`;const h=Math.floor(mins/60),m=mins%60;if(h<24)return `in ${h}h${m?` ${m}m`:''}`;const d=Math.floor(h/24);return `in ${d} day${d===1?'':'s'}`};
const attentionFor=(p:Priority)=>{
 if(p.top_priority==='announcement_ack')return {title:'Announcement needs your acknowledgment',body:`${p.required_acknowledgments} team announcement${p.required_acknowledgments===1?'':'s'} still require your acknowledgment.`,href:'/employee/team',label:'Required'};
 if(p.top_priority==='urgent_announcement')return {title:'Urgent team announcement',body:`${p.urgent_announcements} urgent announcement${p.urgent_announcements===1?'':'s'} are unread.`,href:'/employee/team',label:'Urgent'};
 if(p.top_priority==='training_overdue')return {title:'Training is overdue',body:`${p.training_overdue} training assignment${p.training_overdue===1?'':'s'} need completion.`,href:'/employee/training',label:'Overdue'};
 if(p.top_priority==='team_message')return {title:'Unread team message',body:`${p.unread_messages} private team message${p.unread_messages===1?'':'s'} are waiting.`,href:'/employee/team',label:'Message'};
 if(p.top_priority==='pending_request')return {title:'Request awaiting review',body:`${p.pending_requests} scheduling request${p.pending_requests===1?'':'s'} are still pending.`,href:'/employee/requests',label:'Pending'};
 return null;
};

export default function EmployeeHome(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[profile,setProfile]=useState<Profile|null>(null),[setup,setSetup]=useState<Setup|null>(null),[shifts,setShifts]=useState<Shift[]>([]),[roles,setRoles]=useState<Role[]>([]),[notices,setNotices]=useState<Notice[]>([]),[priority,setPriority]=useState<Priority>(emptyPriority),[signals,setSignals]=useState<Signals>({pendingRequests:0,trainingDue:0,unreadAnnouncements:0,unreadMessages:0,shiftPool:0,requiredAcknowledgments:0});
 useEffect(()=>{void load()},[]);
 async function load(){
  setBusy(true);setMessage('');
  const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('full_name,app_role,location_id').eq('id',u.user.id).single();
  if(p.error||!p.data){setMessage('Could not load your staff account.');setBusy(false);setReady(true);return}
  const pr=p.data as Profile;setProfile(pr);if(pr.app_role!=='employee'){location.href='/manager';return}
  const st=await supabase.rpc('employee_self_setup_status',{});if(st.error){setMessage(st.error.message);setBusy(false);setReady(true);return}
  const status=(st.data||{status:'not_started'}) as Setup;setSetup(status);if(status.status!=='approved'||!status.employee_id){location.href='/employee/setup';return}
  const emp=status.employee_id,now=new Date().toISOString(),future=new Date(Date.now()+21*86400000).toISOString();
  const [s,r,n,pSnapshot,pool]=await Promise.all([
    supabase.from('schedule_shifts').select('id,starts_at,ends_at,break_minutes,role_id,status,notes').eq('employee_id',emp).in('status',['scheduled','covered']).gte('ends_at',now).lt('starts_at',future).order('starts_at').limit(40),
    supabase.from('employee_roles').select('id,name').order('name'),
    supabase.from('notifications').select('id,title,body,href,read_at,created_at,type,category,event_key,priority').order('created_at',{ascending:false}).limit(20),
    supabase.rpc('employee_home_priority_snapshot',{}),
    supabase.rpc('employee_shift_pool_snapshot',{})
  ]);
  if([s,r,n,pSnapshot,pool].some(x=>x.error))setMessage('Some staff-app details could not be refreshed.');
  const pri=(pSnapshot.data||emptyPriority) as Priority;const ps=(pool.data||{up_for_grabs_count:0}) as PoolSnapshot;
  setShifts((s.data??[]) as Shift[]);setRoles((r.data??[]) as Role[]);setNotices((n.data??[]) as Notice[]);setPriority(pri);
  setSignals({pendingRequests:pri.pending_requests||0,trainingDue:pri.training_open||0,unreadAnnouncements:pri.unread_announcements||0,unreadMessages:pri.unread_messages||0,shiftPool:Number(ps.up_for_grabs_count||0),requiredAcknowledgments:pri.required_acknowledgments||0});
  setBusy(false);setReady(true)
 }
 async function openNotice(n:Notice){if(!n.read_at)await supabase.rpc('mark_my_notification_read',{p_notification_id:n.id});location.href=employeeNotificationHref(n.href,n.id)}
 async function signOut(){await supabase.auth.signOut();location.href='/'}
 const next=shifts[0]||null,upcomingHours=useMemo(()=>shifts.reduce((a,s)=>a+hours(s),0),[shifts]),unread=notices.filter(n=>!n.read_at).length;
 const important=notices.find(n=>!n.read_at&&(n.priority==='critical'||n.priority==='high'))||null,attention=attentionFor(priority);
 const roleName=(id:string|null)=>roles.find(r=>r.id===id)?.name||'Shift';
 if(!ready)return <main className={styles.page}>Opening staff app…</main>;if(!profile||setup?.status!=='approved')return null;
 const first=(profile.full_name||setup.full_name||'Team member').trim().split(/\s+/)[0],teamUpdates=signals.unreadAnnouncements+signals.unreadMessages;
 return <main className={styles.page}>
  <header className={styles.header}><div className={styles.brand}><small>El Molino · Johns Island</small><strong>Staff</strong></div><div className={styles.headerActions}><a className={styles.iconButton} href="/employee/notifications" aria-label={`${unread} unread notifications`}><Bell size={20}/>{unread>0&&<span className={styles.badge}>{unread>99?'99+':unread}</span>}</a><button className={styles.avatar} aria-label="Sign out" onClick={signOut}>{first.slice(0,1).toUpperCase()}</button></div></header>
  {message&&<div className={styles.notice}>{message}</div>}
  <section className={styles.hero}><small>Employee app</small><h1>Hi, {first}.</h1><p>Your shifts, requests, team updates and staff tools are all here.</p>{next?<div className={styles.next}><span>Next shift · {countdown(next.starts_at)}</span><b>{roleName(next.role_id)} · {new Date(next.starts_at).toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'})}</b><span>{new Date(next.starts_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} – {new Date(next.ends_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} · {hours(next).toFixed(1)} scheduled hrs · {next.break_minutes?`${next.break_minutes} min break`:'no scheduled break'}</span>{next.notes&&<span>Shift note · {next.notes}</span>}</div>:<div className={styles.next}><b>No upcoming published shifts</b><span>When management publishes your schedule, it will appear here automatically.</span></div>}</section>
  {attention?<section className={styles.section}><div className={styles.sectionHead}><h2>Needs your attention</h2><a className={styles.sectionLink} href={attention.href}>Open</a></div><a className={`${styles.row} ${styles.notificationUnread}`} href={attention.href}><span className={styles.notificationIcon}><span className={styles.dot}/></span><span className={styles.rowMain}><span className={styles.notificationMeta}><span>{attention.label}</span><span>Priority</span></span><b>{attention.title}</b><small>{attention.body}</small></span><ChevronRight size={17}/></a></section>:important&&<section className={styles.section}><div className={styles.sectionHead}><h2>Needs your attention</h2><a className={styles.sectionLink} href="/employee/notifications">Notification Center</a></div><button className={`${styles.row} ${styles.notificationUnread}`} onClick={()=>openNotice(important)}><span className={styles.notificationIcon}><span className={styles.dot}/></span><span className={styles.rowMain}><span className={styles.notificationMeta}><span>{important.priority==='critical'?'Critical':'Important'}</span><span>{notificationTimeLabel(important.created_at)}</span></span><b>{important.title}</b><small>{important.body||'Open for details.'}</small></span><ChevronRight size={17}/></button></section>}
  <section className={styles.section}><div className={styles.sectionHead}><h2>Right now</h2><span>Only your staff activity</span></div><div className={styles.signalGrid}><a className={styles.signal} href="/employee/requests"><b>{signals.pendingRequests}</b><span>pending request{signals.pendingRequests===1?'':'s'}</span></a><a className={styles.signal} href="/employee/shift-pool"><b>{signals.shiftPool}</b><span>Shift Pool option{signals.shiftPool===1?'':'s'}</span></a><a className={styles.signal} href="/employee/team"><b>{teamUpdates}</b><span>unread team update{teamUpdates===1?'':'s'}{signals.requiredAcknowledgments?` · ${signals.requiredAcknowledgments} ack`:''}</span></a><a className={styles.signal} href="/employee/training"><b>{signals.trainingDue}</b><span>training assignment{signals.trainingDue===1?'':'s'} open</span></a></div></section>
  <section className={styles.section}><div className={styles.sectionHead}><h2>This is your app</h2><span>{shifts.length} upcoming · {upcomingHours.toFixed(1)} hrs</span></div><div className={styles.grid}>
   <a className={styles.card} href="/employee/schedule"><CalendarDays/><b>My Schedule</b><small>See only your published shifts and manage coverage.</small></a>
   <a className={styles.card} href="/employee/shift-pool"><Repeat2/><b>Shift Pool</b><small>Pick up eligible shifts and track your own offers, bids and trades.</small></a>
   <a className={styles.card} href="/employee/requests"><Clock3/><b>Availability & Time Off</b><small>Set availability and submit time-off requests.</small></a>
   <a className={styles.card} href="/employee/team"><MessageSquare/><b>Team Hub</b><small>Announcements, manager contact and private team messages.</small></a>
   <a className={styles.card} href="/employee/training"><GraduationCap/><b>Training</b><small>Your assigned courses, quizzes and completion progress.</small></a>
   <a className={styles.card} href="/employee/time-clock"><Clock3/><b>Time Clock</b><small>Your clock status, punches and attestations.</small></a>
   <a className={styles.card} href="/employee/tips"><Coins/><b>My Tips</b><small>Your finalized tip information when available.</small></a>
   <a className={styles.card} href="/account"><UserRound/><b>My Account</b><small>Profile, security, verified roles and preferences.</small></a>
  </div></section>
  <section className={styles.section}><div className={styles.sectionHead}><h2>Notifications</h2><a className={styles.sectionLink} href="/employee/notifications">See all · {unread} unread</a></div>{notices.length?<div className={styles.list}>{notices.slice(0,6).map(n=><button className={`${styles.row} ${!n.read_at?styles.notificationUnread:''}`} key={n.id} onClick={()=>openNotice(n)}>{!n.read_at?<span className={styles.dot}/>:<Bell size={17}/>}<span className={styles.rowMain}><b>{n.title}</b><small>{n.body||notificationTimeLabel(n.created_at)}</small></span><ChevronRight size={17}/></button>)}</div>:<div className={styles.empty}>No notifications yet. Schedule updates and staff decisions will appear here.</div>}</section>
  <div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>load()}><RefreshCw size={15}/> Refresh</button><button className={`${styles.button} ${styles.secondary}`} onClick={signOut}><LogOut size={15}/> Sign out</button></div>
  <nav className={styles.tabs} aria-label="Staff navigation"><a className={`${styles.tab} ${styles.tabActive}`} href="/employee"><Home size={19}/>Home</a><a className={styles.tab} href="/employee/schedule"><CalendarDays size={19}/>Schedule</a><a className={styles.tab} href="/employee/requests"><Clock3 size={19}/>Requests</a><a className={styles.tab} href="/employee/team"><MessageSquare size={19}/>Team</a><a className={styles.tab} href="/account"><UserRound size={19}/>More</a></nav>
 </main>
}
