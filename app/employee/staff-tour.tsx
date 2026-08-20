'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,X} from 'lucide-react';
import {usePathname} from 'next/navigation';
import {useI18n} from '@/lib/i18n';
import styles from './staff-tour.module.css';

export const STAFF_TOUR_COMPLETION_KEY='el-molino-staff-tour-v1';

const TOUR_STEPS=[
 {key:'next-shift',selector:'[data-tour="next-shift"]',en:{title:'Your next shift',body:'Start here for the next scheduled shift, role, time, break and any shift note.'},es:{title:'Tu próximo turno',body:'Empieza aquí para ver tu próximo turno, puesto, horario, descanso y cualquier nota del turno.'}},
 {key:'schedule',selector:'[data-tour="schedule"]',en:{title:'Your schedule',body:'Open Schedule to review your published work week and the shifts currently assigned to you.'},es:{title:'Tu horario',body:'Abre Horario para revisar tu semana publicada y los turnos que tienes asignados.'}},
 {key:'requests',selector:'[data-tour="request-time-off"]',en:{title:'Requests and availability',body:'Use Requests for availability and time-off actions. Submitted requests stay visible with their current status.'},es:{title:'Solicitudes y disponibilidad',body:'Usa Solicitudes para disponibilidad y tiempo libre. Tus solicitudes enviadas siguen visibles con su estado actual.'}},
 {key:'messages',selector:'[data-tour="messages"]',en:{title:'Messages and team updates',body:'Messages keeps direct and group conversations, announcements and manager contact in one released Staff area.'},es:{title:'Mensajes y novedades del equipo',body:'Mensajes reúne conversaciones directas y de grupo, anuncios y contacto con gerencia en una sola sección disponible.'}},
 {key:'more',selector:'[data-tour="more"]',en:{title:'More',body:'More is where you can reach notifications, preferences, your account, language settings and this app guide.'},es:{title:'Más',body:'En Más encuentras notificaciones, preferencias, tu cuenta, idioma y esta guía de la aplicación.'}},
] as const;

function clearHighlight(){
 document.querySelectorAll<HTMLElement>('[data-staff-tour-active="true"]').forEach((node)=>delete node.dataset.staffTourActive);
}

export default function StaffTour(){
 const pathname=usePathname();
 const {locale}=useI18n();
 const panelRef=useRef<HTMLElement|null>(null);
 const [active,setActive]=useState(false);
 const [index,setIndex]=useState(0);
 const last=TOUR_STEPS.length-1;

 const finish=useCallback((completed:boolean)=>{
  clearHighlight();
  if(completed)window.localStorage.setItem(STAFF_TOUR_COMPLETION_KEY,'complete');
  setActive(false);
  const url=new URL(window.location.href);
  url.searchParams.delete('tour');
  window.history.replaceState(window.history.state,'',`${url.pathname}${url.search}${url.hash}`);
 },[]);

 useEffect(()=>{
  if(pathname!=='/employee'){clearHighlight();setActive(false);return}
  const requested=new URLSearchParams(window.location.search).get('tour')==='1';
  if(requested){setIndex(0);setActive(true)}
 },[pathname]);

 useEffect(()=>{
  if(!active||pathname!=='/employee')return;
  clearHighlight();
  const target=document.querySelector<HTMLElement>(TOUR_STEPS[index].selector);
  if(target){
   target.dataset.staffTourActive='true';
   const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   target.scrollIntoView({block:'center',behavior:reduced?'auto':'smooth'});
  }
  return clearHighlight;
 },[active,index,pathname]);

 useEffect(()=>{if(active)panelRef.current?.focus()},[active]);

 useEffect(()=>{
  if(!active)return;
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();finish(false);return}
   if(event.key==='ArrowRight'&&index<last){event.preventDefault();setIndex((value)=>Math.min(last,value+1));return}
   if(event.key==='ArrowLeft'&&index>0){event.preventDefault();setIndex((value)=>Math.max(0,value-1))}
  };
  window.addEventListener('keydown',onKey);
  return()=>window.removeEventListener('keydown',onKey);
 },[active,finish,index,last]);

 if(!active||pathname!=='/employee')return null;
 const step=TOUR_STEPS[index];
 const text=locale==='es'?step.es:step.en;
 const copy=locale==='es'?{guide:'Guía del equipo',close:'Cerrar guía',back:'Atrás',next:'Siguiente',done:'Terminar',hint:'Teclas: ← anterior · → siguiente · Esc cerrar'}:{guide:'Staff app guide',close:'Close guide',back:'Back',next:'Next',done:'Finish',hint:'Keys: ← previous · → next · Esc close'};
 const progress=Math.round(((index+1)/TOUR_STEPS.length)*100);

 return <aside ref={panelRef} className={styles.panel} role="region" aria-label={copy.guide} aria-live="polite" tabIndex={-1}>
  <div className={styles.top}><span className={styles.kicker}>{copy.guide} · {index+1}/{TOUR_STEPS.length}</span><button className={styles.close} type="button" aria-label={copy.close} onClick={()=>finish(false)}><X size={19}/></button></div>
  <h2>{text.title}</h2><p>{text.body}</p>
  <div className={styles.progress} role="progressbar" aria-valuemin={1} aria-valuemax={TOUR_STEPS.length} aria-valuenow={index+1} aria-label={copy.guide}><span style={{width:`${progress}%`}}/></div>
  <div className={styles.actions}><button type="button" disabled={index===0} onClick={()=>setIndex((value)=>Math.max(0,value-1))}><ChevronLeft size={17}/>{copy.back}</button>{index===last?<button type="button" onClick={()=>finish(true)}>{copy.done}</button>:<button type="button" onClick={()=>setIndex((value)=>Math.min(last,value+1))}>{copy.next}<ChevronRight size={17}/></button>}</div>
  <small className={styles.hint}>{copy.hint}</small>
 </aside>;
}
