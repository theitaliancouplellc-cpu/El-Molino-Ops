'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,X} from 'lucide-react';
import {usePathname} from 'next/navigation';
import {useI18n} from '@/lib/i18n';
import styles from '../../employee/staff-tour.module.css';

export const MANAGER_TOUR_COMPLETION_KEY='el-molino-manager-tour-v1';

const STEPS=[
 {selector:'[data-manager-tour="manage-schedule"]',en:{title:'Build the schedule',body:'Create and edit the team schedule, assign shifts and make changes before publication.'},es:{title:'Arma el horario',body:'Crea y edita el horario del equipo, asigna turnos y haz cambios antes de publicarlo.'}},
 {selector:'[data-manager-tour="publish-schedule"]',en:{title:'Publish for Staff',body:'When the schedule is ready, review and publish it so Staff sees the current approved version.'},es:{title:'Publícalo para el personal',body:'Cuando esté listo, revísalo y publícalo para que el personal vea la versión vigente.'}},
 {selector:'[data-manager-tour="requests"]',en:{title:'Review requests',body:'Handle time off, availability and schedule-related requests from Staff.'},es:{title:'Revisa solicitudes',body:'Gestiona tiempo libre, disponibilidad y solicitudes relacionadas con el horario.'}},
 {selector:'[data-manager-tour="coverage"]',en:{title:'Coverage and trades',body:'Use coverage tools for open shifts and eligible shift changes or trades.'},es:{title:'Cobertura e intercambios',body:'Usa las herramientas de cobertura para turnos abiertos y cambios o intercambios elegibles.'}},
 {selector:'[data-manager-tour="messages"]',en:{title:'Team communication',body:'Use team messages for operational communication and announcements with Staff.'},es:{title:'Comunicación del equipo',body:'Usa los mensajes del equipo para comunicación operativa y anuncios con el personal.'}},
 {selector:'[data-manager-tour="guide"]',en:{title:'App guide',body:'You can reopen this manager guide anytime from your workspace.'},es:{title:'Guía de la app',body:'Puedes volver a abrir esta guía de gerencia en cualquier momento desde tu espacio de trabajo.'}},
 {selector:'[data-manager-tour="support"]',en:{title:'Report a problem',body:'If something in the app is not working, report it here with enough detail for review.'},es:{title:'Reporta un problema',body:'Si algo en la app no funciona, repórtalo aquí con suficiente detalle para revisarlo.'}},
] as const;

function clear(){document.querySelectorAll<HTMLElement>('[data-staff-tour-active="true"]').forEach(n=>delete n.dataset.staffTourActive)}

export default function ManagerTour(){
 const pathname=usePathname();const {locale}=useI18n();const panelRef=useRef<HTMLElement|null>(null);const [active,setActive]=useState(false);const [index,setIndex]=useState(0);const last=STEPS.length-1;
 const finish=useCallback((completed:boolean)=>{clear();if(completed)localStorage.setItem(MANAGER_TOUR_COMPLETION_KEY,'complete');setActive(false);const u=new URL(location.href);u.searchParams.delete('tour');history.replaceState(history.state,'',`${u.pathname}${u.search}${u.hash}`)},[]);
 useEffect(()=>{if(pathname!=='/manager/workspace'){clear();setActive(false);return}const requested=new URLSearchParams(location.search).get('tour')==='1';if(requested){setIndex(0);setActive(true)}},[pathname]);
 useEffect(()=>{if(!active||pathname!=='/manager/workspace')return;clear();const target=document.querySelector<HTMLElement>(STEPS[index].selector);if(target){target.dataset.staffTourActive='true';target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}return clear},[active,index,pathname]);
 useEffect(()=>{if(active)panelRef.current?.focus()},[active]);
 if(!active||pathname!=='/manager/workspace')return null;const step=STEPS[index];const text=locale==='es'?step.es:step.en;const c=locale==='es'?{guide:'Guía de gerencia',close:'Cerrar guía',back:'Atrás',next:'Siguiente',done:'Terminar'}:{guide:'Manager app guide',close:'Close guide',back:'Back',next:'Next',done:'Finish'};const progress=Math.round(((index+1)/STEPS.length)*100);
 return <aside ref={panelRef} className={styles.panel} role="region" aria-label={c.guide} aria-live="polite" tabIndex={-1}><div className={styles.top}><span className={styles.kicker}>{c.guide} · {index+1}/{STEPS.length}</span><button className={styles.close} type="button" aria-label={c.close} onClick={()=>finish(false)}><X size={19}/></button></div><h2>{text.title}</h2><p>{text.body}</p><div className={styles.progress} role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={index+1}><span style={{width:`${progress}%`}}/></div><div className={styles.actions}><button type="button" disabled={index===0} onClick={()=>setIndex(v=>Math.max(0,v-1))}><ChevronLeft size={17}/>{c.back}</button>{index===last?<button type="button" onClick={()=>finish(true)}>{c.done}</button>:<button type="button" onClick={()=>setIndex(v=>Math.min(last,v+1))}>{c.next}<ChevronRight size={17}/></button>}</div></aside>;
}
