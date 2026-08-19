'use client';

import {useEffect,useMemo,useState} from 'react';
import {Bell,CalendarDays,ChevronRight,Clock3,Home,LogOut,MessageSquare,RefreshCw,Repeat2,UserRound} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {employeeNotificationHref,notificationTimeLabel} from '@/lib/employee-notifications';
import {isStaffNotificationReleased} from '@/lib/staff-features';
import {useI18n} from '@/lib/i18n';
import styles from './employee.module.css';

type Profile={full_name:string|null;app_role:'admin'|'manager'|'employee';location_id:string|null};
type Setup={status:string;employee_id?:string|null;full_name?:string|null};
type Shift={id:string;starts_at:string;ends_at:string;break_minutes:number;role_id:string|null;status:string;notes:string|null};
type Role={id:string;name:string};
type Notice={id:string;title:string;body:string|null;href:string|null;read_at:string|null;created_at:string;type:string;category:string;event_key:string;priority:string};
type Priority={pending_requests:number;training_open:number;training_overdue:number;unread_announcements:number;required_acknowledgments:number;urgent_announcements:number;unread_messages:number;top_priority:'announcement_ack'|'urgent_announcement'|'training_overdue'|'team_message'|'pending_request'|'none'};
type PoolSnapshot={up_for_grabs_count:number};
type Signals={pendingRequests:number;unreadAnnouncements:number;unreadMessages:number;shiftPool:number;requiredAcknowledgments:number};

const emptyPriority:Priority={pending_requests:0,training_open:0,training_overdue:0,unread_announcements:0,required_acknowledgments:0,urgent_announcements:0,unread_messages:0,top_priority:'none'};
const hours=(s:Shift)=>Math.max(0,(new Date(s.ends_at).getTime()-new Date(s.starts_at).getTime())/3600000-(Number(s.break_minutes)||0)/60);

export default function EmployeeHome(){
 const {locale,t}=useI18n();
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[profile,setProfile]=useState<Profile|null>(null),[setup,setSetup]=useState<Setup|null>(null),[shifts,setShifts]=useState<Shift[]>([]),[roles,setRoles]=useState<Role[]>([]),[notices,setNotices]=useState<Notice[]>([]),[priority,setPriority]=useState<Priority>(emptyPriority),[signals,setSignals]=useState<Signals>({pendingRequests:0,unreadAnnouncements:0,unreadMessages:0,shiftPool:0,requiredAcknowledgments:0});
 useEffect(()=>{void load()},[]);
 async function load(){
  setBusy(true);setMessage('');
  const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('full_name,app_role,location_id').eq('id',u.user.id).single();
  if(p.error||!p.data){setMessage(t('employee.loadError'));setBusy(false);setReady(true);return}
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
  if([s,r,n,pSnapshot,pool].some(x=>x.error))setMessage(t('employee.partialRefreshError'));
  const pri=(pSnapshot.data||emptyPriority) as Priority;const ps=(pool.data||{up_for_grabs_count:0}) as PoolSnapshot;
  const releasedNotices=((n.data??[]) as Notice[]).filter(isStaffNotificationReleased);
  setShifts((s.data??[]) as Shift[]);setRoles((r.data??[]) as Role[]);setNotices(releasedNotices);setPriority(pri);
  setSignals({pendingRequests:pri.pending_requests||0,unreadAnnouncements:pri.unread_announcements||0,unreadMessages:pri.unread_messages||0,shiftPool:Number(ps.up_for_grabs_count||0),requiredAcknowledgments:pri.required_acknowledgments||0});
  setBusy(false);setReady(true)
 }
 async function openNotice(n:Notice){if(!n.read_at)await supabase.rpc('mark_my_notification_read',{p_notification_id:n.id});location.href=employeeNotificationHref(n.href,n.id)}
 async function signOut(){await supabase.auth.signOut();location.href='/'}
 function countdown(iso:string){const mins=Math.max(0,Math.floor((new Date(iso).getTime()-Date.now())/60000));if(mins<60)return `${t('employee.in')} ${mins} ${t('common.minutes')}`;const h=Math.floor(mins/60),m=mins%60;if(h<24)return `${t('employee.in')} ${h}h${m?` ${m}m`:''}`;const d=Math.floor(h/24);return `${t('employee.in')} ${d} ${d===1?t('employee.day'):t('employee.days')}`}
 function attentionFor(p:Priority){
  if(p.required_acknowledgments>0)return {title:t('employee.attnAckTitle'),body:`${p.required_acknowledgments} ${t('employee.attnAckBody')}`,href:'/employee/team',label:t('employee.required')};
  if(p.urgent_announcements>0)return {title:t('employee.attnUrgentTitle'),body:`${p.urgent_announcements} ${t('employee.attnUrgentBody')}`,href:'/employee/team',label:t('employee.urgent')};
  if(p.unread_messages>0)return {title:t('employee.attnMessageTitle'),body:`${p.unread_messages} ${t('employee.attnMessageBody')}`,href:'/employee/team',label:t('employee.message')};
  if(p.pending_requests>0)return {title:t('employee.attnRequestTitle'),body:`${p.pending_requests} ${t('employee.attnRequestBody')}`,href:'/employee/requests',label:t('employee.pending')};
  return null;
 }
 const next=shifts[0]||null,upcomingHours=useMemo(()=>shifts.reduce((a,s)=>a+hours(s),0),[shifts]),unread=notices.filter(n=>!n.read_at).length;
 const important=notices.find(n=>!n.read_at&&(n.priority==='critical'||n.priority==='high'))||null,attention=attentionFor(priority);
 const roleName=(id:string|null)=>roles.find(r=>r.id===id)?.name||t('common.shift');
 if(!ready)return <main className={styles.page}>{t('employee.opening')}</main>;if(!profile||setup?.status!=='approved')return null;
 const first=(profile.full_name||setup.full_name||t('employee.teamMember')).trim().split(/\s+/)[0],teamUpdates=signals.unreadAnnouncements+signals.unreadMessages;
 const dateLocale=locale==='es'?'es-US':'en-US';
 return <main className={styles.page}>
  <header className={styles.header}><div className={styles.brand}><small>El Molino · Johns Island</small><strong>{t('employee.staff')}</strong></div><div className={styles.headerActions}><a className={styles.iconButton} href="/employee/notifications" aria-label={`${unread} ${t('employee.unreadNotifications')}`}><Bell size={20}/>{unread>0&&<span className={styles.badge}>{unread>99?'99+':unread}</span>}</a><button className={styles.avatar} aria-label={t('employee.signOutLabel')} onClick={signOut}>{first.slice(0,1).toUpperCase()}</button></div></header>
  {message&&<div className={styles.notice}>{message}</div>}
  <section className={styles.hero}><small>{t('employee.app')}</small><h1>{t('employee.hello')}, {first}.</h1><p>{t('employee.heroBody')}</p>{next?<div className={styles.next} data-tour="next-shift"><span>{t('employee.nextShift')} · {countdown(next.starts_at)}</span><b>{roleName(next.role_id)} · {new Date(next.starts_at).toLocaleDateString(dateLocale,{weekday:'long',month:'short',day:'numeric'})}</b><span>{new Date(next.starts_at).toLocaleTimeString(dateLocale,{hour:'numeric',minute:'2-digit'})} – {new Date(next.ends_at).toLocaleTimeString(dateLocale,{hour:'numeric',minute:'2-digit'})} · {hours(next).toFixed(1)} {t('common.hours')} · {next.break_minutes?`${next.break_minutes} ${t('common.minutes')}`:t('common.noScheduledBreak')}</span>{next.notes&&<span>{t('common.shiftNote')} · {next.notes}</span>}</div>:<div className={styles.next} data-tour="next-shift"><b>{t('employee.noUpcoming')}</b><span>{t('employee.noUpcomingBody')}</span></div>}</section>
  {attention?<section className={styles.section}><div className={styles.sectionHead}><h2>{t('employee.attention')}</h2><a className={styles.sectionLink} href={attention.href}>{t('common.open')}</a></div><a className={`${styles.row} ${styles.notificationUnread}`} href={attention.href}><span className={styles.notificationIcon}><span className={styles.dot}/></span><span className={styles.rowMain}><span className={styles.notificationMeta}><span>{attention.label}</span><span>{t('common.priority')}</span></span><b>{attention.title}</b><small>{attention.body}</small></span><ChevronRight size={17}/></a></section>:important&&<section className={styles.section}><div className={styles.sectionHead}><h2>{t('employee.attention')}</h2><a className={styles.sectionLink} href="/employee/notifications">{t('employee.notificationCenter')}</a></div><button className={`${styles.row} ${styles.notificationUnread}`} onClick={()=>openNotice(important)}><span className={styles.notificationIcon}><span className={styles.dot}/></span><span className={styles.rowMain}><span className={styles.notificationMeta}><span>{important.priority==='critical'?t('common.critical'):t('common.important')}</span><span>{notificationTimeLabel(important.created_at)}</span></span><b>{important.title}</b><small>{important.body||t('employee.openDetails')}</small></span><ChevronRight size={17}/></button></section>}
  <section className={styles.section}><div className={styles.sectionHead}><h2>{t('employee.rightNow')}</h2><span>{t('employee.onlyYourActivity')}</span></div><div className={styles.signalGrid}><a className={styles.signal} href="/employee/requests"><b>{signals.pendingRequests}</b><span>{t('employee.pendingRequests')}</span></a><a className={styles.signal} href="/employee/shift-pool"><b>{signals.shiftPool}</b><span>{t('employee.shiftPoolOptions')}</span></a><a className={styles.signal} href="/employee/team"><b>{teamUpdates}</b><span>{t('employee.unreadTeamUpdates')}{signals.requiredAcknowledgments?` · ${signals.requiredAcknowledgments} ${t('employee.ack')}`:''}</span></a></div></section>
  <section className={styles.section}><div className={styles.sectionHead}><h2>{t('employee.yourApp')}</h2><span>{shifts.length} {t('employee.upcoming')} · {upcomingHours.toFixed(1)} {t('common.hours')}</span></div><div className={styles.grid}>
   <a className={styles.card} href="/employee/schedule" data-tour="schedule"><CalendarDays/><b>{t('employee.mySchedule')}</b><small>{t('employee.myScheduleBody')}</small></a>
   <a className={styles.card} href="/employee/shift-pool"><Repeat2/><b>{t('employee.shiftPool')}</b><small>{t('employee.shiftPoolBody')}</small></a>
   <a className={styles.card} href="/employee/requests" data-tour="request-time-off"><Clock3/><b>{t('employee.availability')}</b><small>{t('employee.availabilityBody')}</small></a>
   <a className={styles.card} href="/employee/team" data-tour="messages"><MessageSquare/><b>{t('nav.messages')}</b><small>{t('employee.messagesBody')}</small></a>
   <a className={styles.card} href="/account"><UserRound/><b>{t('employee.myAccount')}</b><small>{t('employee.myAccountBody')}</small></a>
  </div></section>
  <section className={styles.section}><div className={styles.sectionHead}><h2>{t('nav.notifications')}</h2><a className={styles.sectionLink} href="/employee/notifications">{t('employee.seeAll')} · {unread} {t('common.unread')}</a></div>{notices.length?<div className={styles.list}>{notices.slice(0,3).map(n=><button className={`${styles.row} ${!n.read_at?styles.notificationUnread:''}`} key={n.id} onClick={()=>openNotice(n)}>{!n.read_at?<span className={styles.dot}/>:<Bell size={17}/>}<span className={styles.rowMain}><b>{n.title}</b><small>{n.body||notificationTimeLabel(n.created_at)}</small></span><ChevronRight size={17}/></button>)}</div>:<div className={styles.empty}>{t('employee.noNotifications')}</div>}</section>
  <div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>load()}><RefreshCw size={15}/> {t('common.refresh')}</button><button className={`${styles.button} ${styles.secondary}`} onClick={signOut}><LogOut size={15}/> {t('common.signOut')}</button></div>
  <nav className={styles.tabs} aria-label={t('employee.staffNav')}><a className={`${styles.tab} ${styles.tabActive}`} href="/employee"><Home size={19}/>{t('nav.home')}</a><a className={styles.tab} href="/employee/schedule"><CalendarDays size={19}/>{t('nav.schedule')}</a><a className={styles.tab} href="/employee/requests"><Clock3 size={19}/>{t('nav.requests')}</a><a className={styles.tab} href="/employee/team"><MessageSquare size={19}/>{t('nav.messages')}</a><a className={styles.tab} href="/employee/more"><UserRound size={19}/>{t('common.more')}</a></nav>
 </main>
}