'use client';

import {useEffect,useState} from 'react';
import {BookOpen,CalendarDays,CheckCircle2,Clock3,Home,MessageSquare,PlayCircle,UserRound} from 'lucide-react';
import {useI18n} from '@/lib/i18n';
import {STAFF_TOUR_COMPLETION_KEY} from '../staff-tour';
import styles from './tutorials.module.css';

export default function StaffTutorialsPage(){
 const {locale}=useI18n();
 const [complete,setComplete]=useState(false);
 useEffect(()=>{setComplete(window.localStorage.getItem(STAFF_TOUR_COMPLETION_KEY)==='complete')},[]);
 const c=locale==='es'?{
  title:'Guía de la aplicación',eyebrow:'El Molino · Equipo',body:'Una guía corta de las herramientas que están disponibles para el equipo en este momento.',
  complete:'Guía completada',notComplete:'Guía pendiente',start:complete?'Repetir guía':'Empezar guía',areas:'Áreas disponibles',areasBody:'Abre cualquier sección para practicar a tu ritmo.',
  home:'Inicio',homeBody:'Próximo turno, avisos importantes y accesos rápidos.',schedule:'Horario',scheduleBody:'Tus turnos publicados y detalles de trabajo.',requests:'Solicitudes',requestsBody:'Disponibilidad, tiempo libre y estado de solicitudes.',messages:'Mensajes',messagesBody:'Conversaciones, anuncios y contacto con gerencia.',more:'Más',moreBody:'Notificaciones, preferencias, cuenta, idioma y esta guía.',
  note:'Alcance de esta guía',noteBody:'La guía se limita a las herramientas disponibles en tu aplicación de equipo.',back:'Volver a Más'
 }:{
  title:'App guide',eyebrow:'El Molino · Staff',body:'A short guide to the Staff tools that are available right now.',
  complete:'Guide completed',notComplete:'Guide not completed',start:complete?'Restart guided tour':'Start guided tour',areas:'Available areas',areasBody:'Open any section to practice at your own pace.',
  home:'Home',homeBody:'Next shift, important updates and quick actions.',schedule:'Schedule',scheduleBody:'Your published shifts and work details.',requests:'Requests',requestsBody:'Availability, time off and request status.',messages:'Messages',messagesBody:'Conversations, announcements and manager contact.',more:'More',moreBody:'Notifications, preferences, account, language and this guide.',
  note:'What this guide covers',noteBody:'This guide stays within the tools currently available in your Staff app.',back:'Back to More'
 };
 const cards=[
  {href:'/employee',label:c.home,body:c.homeBody,Icon:Home},
  {href:'/employee/schedule',label:c.schedule,body:c.scheduleBody,Icon:CalendarDays},
  {href:'/employee/requests',label:c.requests,body:c.requestsBody,Icon:Clock3},
  {href:'/employee/team',label:c.messages,body:c.messagesBody,Icon:MessageSquare},
  {href:'/employee/more',label:c.more,body:c.moreBody,Icon:UserRound},
 ];
 return <main className={styles.page}>
  <header className={styles.header}><div className={styles.brand}><small>El Molino · Johns Island</small><strong>{c.title}</strong></div><BookOpen size={22} aria-hidden="true"/></header>
  <section className={styles.hero}><small>{c.eyebrow}</small><h1>{c.title}</h1><p>{c.body}</p><span className={styles.status} data-complete={complete?'true':'false'}>{complete?<CheckCircle2 size={16}/>:<BookOpen size={16}/>} {complete?c.complete:c.notComplete}</span><br/><a className={styles.start} href="/employee?tour=1"><PlayCircle size={18}/>{c.start}</a></section>
  <section className={styles.section}><div className={styles.sectionHead}><h2>{c.areas}</h2><span>{c.areasBody}</span></div><div className={styles.grid}>{cards.map(({href,label,body,Icon})=><a className={styles.card} key={href} href={href}><Icon size={20} aria-hidden="true"/><span className={styles.copy}><b>{label}</b><small>{body}</small></span></a>)}</div></section>
  <aside className={styles.note}><b>{c.note}</b>{c.noteBody}</aside>
  <a className={styles.back} href="/employee/more"><UserRound size={17}/>{c.back}</a>
 </main>;
}
