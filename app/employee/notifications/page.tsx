'use client';

import {useEffect,useMemo,useState} from 'react';
import {ArrowLeft,Bell,CheckCheck,ChevronRight,Filter,Settings2} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {employeeNotificationHref,normalizeEmployeeNotificationCategory,notificationTimeLabel,type EmployeeNotificationCategory} from '@/lib/employee-notifications';
import {useI18n} from '@/lib/i18n';
import styles from '../employee.module.css';

type Profile={app_role:'admin'|'manager'|'employee'};
type Notice={id:string;title:string;body:string|null;href:string|null;read_at:string|null;created_at:string;type:string;category:string;event_key:string;priority:string;data:Record<string,unknown>};
type FilterKey='all'|EmployeeNotificationCategory;

const labels={
 en:{schedule:'Schedule',requests:'Requests',shift_pool:'Shift Pool',team:'Team',training:'Training',time_clock:'Time Clock',tips:'Tips',account:'Account',general:'General'},
 es:{schedule:'Horario',requests:'Solicitudes',shift_pool:'Bolsa de Turnos',team:'Equipo',training:'Capacitación',time_clock:'Reloj de tiempo',tips:'Propinas',account:'Cuenta',general:'General'}
} as const;

export default function EmployeeNotificationCenter(){
 const {locale}=useI18n();
 const c=locale==='es'?{
  loadError:'No se pudo cargar tu cuenta del personal.',refreshError:'No se pudieron actualizar las notificaciones.',markError:'No se pudieron marcar las notificaciones como leídas.',opening:'Abriendo notificaciones…',back:'Volver al inicio del personal',staff:'Personal de El Molino',title:'Notificaciones',settings:'Configuración de notificaciones',center:'Centro de Notificaciones',unread:'sin leer',body:'Los cambios de horario, solicitudes, novedades del equipo, capacitación y otros eventos del personal permanecen aquí incluso después de leerlos.',mark:'Marcar',all:'todas',filtered:'filtradas',read:'como leídas',preferences:'Preferencias',filters:'Filtros de notificaciones',allLabel:'Todas',critical:'Crítico',important:'Importante',details:'Abrir para ver detalles.',empty:'Aún no hay notificaciones.',emptyCategory:'Aún no hay nada en esta categoría.'
 }:{
  loadError:'Could not load your staff account.',refreshError:'Notifications could not be refreshed.',markError:'Could not mark notifications as read.',opening:'Opening notifications…',back:'Back to staff home',staff:'El Molino Staff',title:'Notifications',settings:'Notification settings',center:'Notification Center',unread:'unread',body:'Schedule changes, requests, team updates, training and other staff events stay here even after you read them.',mark:'Mark',all:'all',filtered:'filtered',read:'read',preferences:'Preferences',filters:'Notification filters',allLabel:'All',critical:'Critical',important:'Important',details:'Open for details.',empty:'No notifications yet.',emptyCategory:'Nothing in this category yet.'
 };
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[notices,setNotices]=useState<Notice[]>([]),[filter,setFilter]=useState<FilterKey>('all');
 useEffect(()=>{void load()},[]);
 async function load(){
  setBusy(true);setMessage('');
  const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('app_role').eq('id',u.user.id).single();
  if(p.error||!p.data){setMessage(c.loadError);setReady(true);setBusy(false);return}
  if((p.data as Profile).app_role!=='employee'){location.href='/manager';return}
  const setup=await supabase.rpc('employee_self_setup_status',{});if(setup.error||setup.data?.status!=='approved'){location.href='/employee/setup';return}
  const n=await supabase.from('notifications').select('id,title,body,href,read_at,created_at,type,category,event_key,priority,data').order('created_at',{ascending:false}).limit(200);
  if(n.error)setMessage(c.refreshError);
  setNotices((n.data??[]) as Notice[]);setReady(true);setBusy(false)
 }
 async function openNotice(n:Notice){
  if(!n.read_at)await supabase.rpc('mark_my_notification_read',{p_notification_id:n.id});
  location.href=employeeNotificationHref(n.href,n.id)
 }
 async function markAll(){
  if(busy)return;setBusy(true);const {error}=await supabase.rpc('mark_all_my_notifications_read',{p_category:filter==='all'?null:filter});
  if(error)setMessage(c.markError);else await load();setBusy(false)
 }
 const filtered=useMemo(()=>filter==='all'?notices:notices.filter(n=>normalizeEmployeeNotificationCategory(n.category)===filter),[filter,notices]);
 const unread=notices.filter(n=>!n.read_at).length;
 const categories=useMemo(()=>Array.from(new Set(notices.map(n=>normalizeEmployeeNotificationCategory(n.category)))),[notices]);
 const categoryLabels=labels[locale];
 if(!ready)return <main className={styles.page}>{c.opening}</main>;
 return <main className={styles.page}>
  <header className={styles.header}><a className={styles.iconButton} href="/employee" aria-label={c.back}><ArrowLeft size={20}/></a><div className={styles.brand}><small>{c.staff}</small><strong>{c.title}</strong></div><a className={styles.iconButton} href="/employee/notifications/preferences" aria-label={c.settings}><Settings2 size={20}/></a></header>
  {message&&<div className={styles.error}>{message}</div>}
  <section className={styles.setupCard}><div className={styles.sectionHead}><h2>{c.center}</h2><span>{unread} {c.unread}</span></div><p className={styles.muted}>{c.body}</p><div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={busy||!filtered.some(n=>!n.read_at)} onClick={markAll}><CheckCheck size={16}/> {c.mark} {filter==='all'?c.all:c.filtered} {c.read}</button><a className={`${styles.button} ${styles.secondary}`} href="/employee/notifications/preferences"><Settings2 size={16}/> {c.preferences}</a></div></section>
  <section className={styles.section}><div className={styles.filterBar} aria-label={c.filters}><button className={`${styles.filterChip} ${filter==='all'?styles.filterChipActive:''}`} onClick={()=>setFilter('all')}><Filter size={14}/> {c.allLabel}</button>{categories.map(cat=><button key={cat} className={`${styles.filterChip} ${filter===cat?styles.filterChipActive:''}`} onClick={()=>setFilter(cat)}>{categoryLabels[cat]}</button>)}</div></section>
  <section className={styles.section}>{filtered.length?<div className={styles.list}>{filtered.map(n=>{const cat=normalizeEmployeeNotificationCategory(n.category);return <button className={`${styles.row} ${!n.read_at?styles.notificationUnread:''}`} key={n.id} onClick={()=>openNotice(n)}><span className={styles.notificationIcon}>{!n.read_at?<span className={styles.dot}/>:<Bell size={17}/>}</span><span className={styles.rowMain}><span className={styles.notificationMeta}><span>{categoryLabels[cat]}</span><span>{notificationTimeLabel(n.created_at)}</span>{n.priority==='critical'&&<span className={styles.criticalText}>{c.critical}</span>}{n.priority==='high'&&<span>{c.important}</span>}</span><b>{n.title}</b><small>{n.body||c.details}</small></span><ChevronRight size={17}/></button>})}</div>:<div className={styles.empty}>{filter==='all'?c.empty:c.emptyCategory}</div>}</section>
 </main>
}
