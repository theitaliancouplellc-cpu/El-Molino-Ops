'use client';

import {useEffect,useState} from 'react';
import {CalendarDays,CheckCircle2,ChevronRight,Clock3,HelpCircle,Loader2,MessageSquare,Repeat2,ShieldCheck,UserRoundCog} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {useI18n} from '@/lib/i18n';
import ManagerTour from './manager-tour';

type Profile={app_role:'admin'|'manager'|'employee';location_id:string|null};

export default function ManagerWorkspacePage(){
 const {locale}=useI18n();
 const es=locale==='es';
 const [ready,setReady]=useState(false);
 const [profile,setProfile]=useState<Profile|null>(null);
 const [message,setMessage]=useState('');
 useEffect(()=>{void init()},[]);
 async function init(){
  const {data:u}=await supabase.auth.getUser();
  if(!u.user){location.href='/';return}
  const {data,error}=await supabase.from('profiles').select('app_role,location_id').eq('id',u.user.id).single();
  if(error||!data){setMessage(es?'No se pudo verificar tu acceso de gerencia.':'Could not verify your manager access.');setReady(true);return}
  const p=data as Profile;setProfile(p);
  if(p.app_role==='admin'){location.replace('/');return}
  if(p.app_role!=='manager'){location.replace('/employee');return}
  setReady(true);
 }
 if(!ready)return <div className="full-loader"><Loader2 className="spin"/><span>{es?'Preparando tu espacio de gerencia…':'Preparing your manager workspace…'}</span></div>;
 if(!profile||profile.app_role!=='manager')return null;
 const cards=[
  {href:'/schedule',icon:CalendarDays,title:es?'Crear y editar horarios':'Create & edit schedules',body:es?'Construye la semana, asigna turnos y haz cambios para el equipo.':'Build the week, assign shifts and make team schedule changes.',tour:'manage-schedule'},
  {href:'/schedule/publish',icon:CheckCircle2,title:es?'Publicar horario':'Publish schedule',body:es?'Revisa el horario y publícalo para que el personal vea la versión vigente.':'Review the schedule and publish the current version to Staff.',tour:'publish-schedule'},
  {href:'/schedule/requests',icon:Clock3,title:es?'Solicitudes':'Requests',body:es?'Revisa tiempo libre, disponibilidad y solicitudes relacionadas con horarios.':'Review time off, availability and schedule-related requests.',tour:'requests'},
  {href:'/schedule/pool',icon:Repeat2,title:es?'Cobertura e intercambios':'Coverage & trades',body:es?'Administra turnos abiertos, cobertura e intercambios disponibles.':'Manage open shifts, coverage and available trades.',tour:'coverage'},
  {href:'/employee/team',icon:MessageSquare,title:es?'Mensajes del equipo':'Team messages',body:es?'Comunícate con el personal y revisa anuncios y conversaciones del equipo.':'Communicate with Staff and review team announcements and conversations.',tour:'messages'},
  {href:'/manager/tutorials',icon:HelpCircle,title:es?'Guía de la app':'App guide',body:es?'Repasa cómo usar tus funciones de gerencia cuando lo necesites.':'Review how to use your manager tools whenever you need it.',tour:'guide'},
  {href:'/employee/support',icon:ShieldCheck,title:es?'Reportar un problema':'Report a problem',body:es?'Envía un problema de la app con la información necesaria para revisarlo.':'Send an app problem with the information needed for review.',tour:'support'},
  {href:'/account',icon:UserRoundCog,title:es?'Cuenta y seguridad':'Account & security',body:es?'Administra tu cuenta, sesión e idioma.':'Manage your account, session and language.',tour:'account'},
 ];
 return <div className="app-shell"><ManagerTour/><header className="topbar"><div style={{flex:1}}><div className="brand-kicker">El Molino Ops</div><div className="brand-title">{es?'Gerencia':'Manager'}</div></div></header><main className="page" style={{maxWidth:920,margin:'0 auto'}}>
  {message&&<div className="toast-message">{message}</div>}
  <div className="page-heading"><h1>{es?'Tu espacio de trabajo':'Your workspace'}</h1><p>{es?'Administra las funciones del personal que necesitas para dirigir horarios, solicitudes, cobertura y comunicación del equipo.':'Manage the Staff functions you need for schedules, requests, coverage and team communication.'}</p></div>
  <div className="quick-grid">{cards.map(({href,icon:Icon,title,body,tour})=><a className="quick-card" href={href} key={href} data-manager-tour={tour}><Icon/><b>{title}</b><small>{body}</small><ChevronRight style={{marginLeft:'auto'}}/></a>)}</div>
 </main></div>;
}
