'use client';

import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,Bell,CheckCheck,ChevronRight,Filter,Settings2} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {EMPLOYEE_NOTIFICATION_CATEGORY_LABELS,employeeNotificationHref,normalizeEmployeeNotificationCategory,notificationTimeLabel,type EmployeeNotificationCategory} from '@/lib/employee-notifications';
import styles from '../employee.module.css';

type Profile={app_role:'admin'|'manager'|'employee'};
type Notice={id:string;title:string;body:string|null;href:string|null;read_at:string|null;created_at:string;type:string;category:string;event_key:string;priority:string;data:Record<string,unknown>};
type FilterKey='all'|EmployeeNotificationCategory;

export default function EmployeeNotificationCenter(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[notices,setNotices]=useState<Notice[]>([]),[filter,setFilter]=useState<FilterKey>('all');
 useEffect(()=>{void load()},[]);
 async function load(){
  setBusy(true);setMessage('');
  const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('app_role').eq('id',u.user.id).single();
  if(p.error||!p.data){setMessage('Could not load your staff account.');setReady(true);setBusy(false);return}
  if((p.data as Profile).app_role!=='employee'){location.href='/manager';return}
  const setup=await supabase.rpc('employee_self_setup_status',{});if(setup.error||setup.data?.status!=='approved'){location.href='/employee/setup';return}
  const n=await supabase.from('notifications').select('id,title,body,href,read_at,created_at,type,category,event_key,priority,data').order('created_at',{ascending:false}).limit(200);
  if(n.error)setMessage('Notifications could not be refreshed.');
  setNotices((n.data??[]) as Notice[]);setReady(true);setBusy(false)
 }
 async function openNotice(n:Notice){
  if(!n.read_at)await supabase.rpc('mark_my_notification_read',{p_notification_id:n.id});
  location.href=employeeNotificationHref(n.href,n.id)
 }
 async function markAll(){
  if(busy)return;setBusy(true);const {error}=await supabase.rpc('mark_all_my_notifications_read',{p_category:filter==='all'?null:filter});
  if(error)setMessage('Could not mark notifications as read.');else await load();setBusy(false)
 }
 const filtered=useMemo(()=>filter==='all'?notices:notices.filter(n=>normalizeEmployeeNotificationCategory(n.category)===filter),[filter,notices]);
 const unread=notices.filter(n=>!n.read_at).length;
 const categories=useMemo(()=>Array.from(new Set(notices.map(n=>normalizeEmployeeNotificationCategory(n.category)))),[notices]);
 if(!ready)return <main className={styles.page}>Opening notifications…</main>;
 return <main className={styles.page}>
  <header className={styles.header}><a className={styles.iconButton} href="/employee" aria-label="Back to staff home"><ArrowLeft size={20}/></a><div className={styles.brand}><small>El Molino Staff</small><strong>Notifications</strong></div><a className={styles.iconButton} href="/employee/notifications/preferences" aria-label="Notification settings"><Settings2 size={20}/></a></header>
  {message&&<div className={styles.error}>{message}</div>}
  <section className={styles.setupCard}><div className={styles.sectionHead}><h2>Notification Center</h2><span>{unread} unread</span></div><p className={styles.muted}>Schedule changes, requests, team updates, training and other staff events stay here even after you read them.</p><div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={busy||!filtered.some(n=>!n.read_at)} onClick={markAll}><CheckCheck size={16}/> Mark {filter==='all'?'all':'filtered'} read</button><a className={`${styles.button} ${styles.secondary}`} href="/employee/notifications/preferences"><Settings2 size={16}/> Preferences</a></div></section>
  <section className={styles.section}><div className={styles.filterBar} aria-label="Notification filters"><button className={`${styles.filterChip} ${filter==='all'?styles.filterChipActive:''}`} onClick={()=>setFilter('all')}><Filter size={14}/> All</button>{categories.map(cat=><button key={cat} className={`${styles.filterChip} ${filter===cat?styles.filterChipActive:''}`} onClick={()=>setFilter(cat)}>{EMPLOYEE_NOTIFICATION_CATEGORY_LABELS[cat]}</button>)}</div></section>
  <section className={styles.section}>{filtered.length?<div className={styles.list}>{filtered.map(n=>{const cat=normalizeEmployeeNotificationCategory(n.category);return <button className={`${styles.row} ${!n.read_at?styles.notificationUnread:''}`} key={n.id} onClick={()=>openNotice(n)}><span className={styles.notificationIcon}>{!n.read_at?<span className={styles.dot}/>:<Bell size={17}/>}</span><span className={styles.rowMain}><span className={styles.notificationMeta}><span>{EMPLOYEE_NOTIFICATION_CATEGORY_LABELS[cat]}</span><span>{notificationTimeLabel(n.created_at)}</span>{n.priority==='critical'&&<span className={styles.criticalText}>Critical</span>}{n.priority==='high'&&<span>Important</span>}</span><b>{n.title}</b><small>{n.body||'Open for details.'}</small></span><ChevronRight size={17}/></button>})}</div>:<div className={styles.empty}>{filter==='all'?'No notifications yet.':'Nothing in this category yet.'}</div>}</section>
 </main>
}
