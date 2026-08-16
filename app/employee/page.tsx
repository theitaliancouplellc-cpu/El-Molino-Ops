'use client';

import {useEffect,useMemo,useState} from 'react';
import {Bell,CalendarDays,ChevronRight,Clock3,Coins,GraduationCap,Home,LogOut,MessageSquare,RefreshCw,Repeat2,UserRound} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import styles from './employee.module.css';

type Profile={full_name:string|null;app_role:'admin'|'manager'|'employee';location_id:string|null};
type Setup={status:string;employee_id?:string|null;full_name?:string|null};
type Shift={id:string;starts_at:string;ends_at:string;break_minutes:number;role_id:string|null;status:string};
type Role={id:string;name:string};
type Notice={id:string;title:string;body:string|null;href:string|null;read_at:string|null;created_at:string;type:string};

const safeHref=(v:string|null)=>v&&v.startsWith('/')&&!v.startsWith('//')?v:'/employee';
const hours=(s:Shift)=>Math.max(0,(new Date(s.ends_at).getTime()-new Date(s.starts_at).getTime())/3600000-(Number(s.break_minutes)||0)/60);

export default function EmployeeHome(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[profile,setProfile]=useState<Profile|null>(null),[setup,setSetup]=useState<Setup|null>(null),[shifts,setShifts]=useState<Shift[]>([]),[roles,setRoles]=useState<Role[]>([]),[notices,setNotices]=useState<Notice[]>([]);
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
  const now=new Date().toISOString(),future=new Date(Date.now()+21*86400000).toISOString();
  const [s,r,n]=await Promise.all([
    supabase.from('schedule_shifts').select('id,starts_at,ends_at,break_minutes,role_id,status').eq('employee_id',status.employee_id).in('status',['scheduled','covered']).gte('ends_at',now).lt('starts_at',future).order('starts_at').limit(40),
    supabase.from('employee_roles').select('id,name').order('name'),
    supabase.from('notifications').select('id,title,body,href,read_at,created_at,type').order('created_at',{ascending:false}).limit(12)
  ]);
  if(s.error||r.error||n.error)setMessage('Some staff-app data could not be loaded.');
  setShifts((s.data??[]) as Shift[]);setRoles((r.data??[]) as Role[]);setNotices((n.data??[]) as Notice[]);setBusy(false);setReady(true)
 }
 async function openNotice(n:Notice){if(!n.read_at)await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',n.id).is('read_at',null);location.href=safeHref(n.href)}
 async function signOut(){await supabase.auth.signOut();location.href='/'}
 const next=shifts[0]||null,upcomingHours=useMemo(()=>shifts.reduce((a,s)=>a+hours(s),0),[shifts]),unread=notices.filter(n=>!n.read_at).length;
 const roleName=(id:string|null)=>roles.find(r=>r.id===id)?.name||'Shift';
 if(!ready)return <main className={styles.page}>Opening staff app…</main>;
 if(!profile||setup?.status!=='approved')return null;
 const first=(profile.full_name||setup.full_name||'Team member').trim().split(/\s+/)[0];
 return <main className={styles.page}>
  <header className={styles.header}><div className={styles.brand}><small>El Molino · Johns Island</small><strong>Staff</strong></div><button className={styles.avatar} aria-label="Sign out" onClick={signOut}>{first.slice(0,1).toUpperCase()}</button></header>
  {message&&<div className={styles.notice}>{message}</div>}
  <section className={styles.hero}><small>Employee app</small><h1>Hi, {first}.</h1><p>Your shifts, requests, team updates and staff tools are all here.</p>{next?<div className={styles.next}><span>Next shift</span><b>{roleName(next.role_id)} · {new Date(next.starts_at).toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'})}</b><span>{new Date(next.starts_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} – {new Date(next.ends_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</span></div>:<div className={styles.next}><b>No upcoming published shifts</b><span>When management publishes your schedule, it will appear here automatically.</span></div>}</section>
  <section className={styles.section}><div className={styles.sectionHead}><h2>This is your app</h2><span>{shifts.length} upcoming · {upcomingHours.toFixed(1)} hrs</span></div><div className={styles.grid}>
   <a className={styles.card} href="/employee/schedule"><CalendarDays/><b>My Schedule</b><small>See only your published shifts and manage coverage.</small></a>
   <a className={styles.card} href="/schedule/pool"><Repeat2/><b>Shift Pool</b><small>Pick up eligible open shifts and view offers.</small></a>
   <a className={styles.card} href="/schedule/requests"><Clock3/><b>Availability & Time Off</b><small>Set availability and submit time-off requests.</small></a>
   <a className={styles.card} href="/team"><MessageSquare/><b>Team Hub</b><small>Announcements, recognition and team communication.</small></a>
   <a className={styles.card} href="/training/courses"><GraduationCap/><b>Training</b><small>Your assigned courses, quizzes and completion progress.</small></a>
   <a className={styles.card} href="/time-clock"><Clock3/><b>Time Clock</b><small>Clock tools remain available while Toast access is pending.</small></a>
   <a className={styles.card} href="/tips"><Coins/><b>My Tips</b><small>See finalized tip distributions when available.</small></a>
   <a className={styles.card} href="/account"><UserRound/><b>My Account</b><small>Profile, password and personal settings.</small></a>
  </div></section>
  <section className={styles.section}><div className={styles.sectionHead}><h2>Notifications</h2><span>{unread} unread</span></div>{notices.length?<div className={styles.list}>{notices.slice(0,6).map(n=><button className={styles.row} key={n.id} onClick={()=>openNotice(n)}>{!n.read_at?<span className={styles.dot}/>:<Bell size={17}/>}<span className={styles.rowMain}><b>{n.title}</b><small>{n.body||new Date(n.created_at).toLocaleString()}</small></span><ChevronRight size={17}/></button>)}</div>:<div className={styles.empty}>No notifications yet.</div>}</section>
  <div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>load()}><RefreshCw size={15}/> Refresh</button><button className={`${styles.button} ${styles.secondary}`} onClick={signOut}><LogOut size={15}/> Sign out</button></div>
  <nav className={styles.tabs} aria-label="Staff navigation"><a className={`${styles.tab} ${styles.tabActive}`} href="/employee"><Home size={19}/>Home</a><a className={styles.tab} href="/employee/schedule"><CalendarDays size={19}/>Schedule</a><a className={styles.tab} href="/schedule/requests"><Clock3 size={19}/>Requests</a><a className={styles.tab} href="/team"><MessageSquare size={19}/>Team</a><a className={styles.tab} href="/account"><UserRound size={19}/>More</a></nav>
 </main>
}
