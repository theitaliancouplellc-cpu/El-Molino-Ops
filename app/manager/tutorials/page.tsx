'use client';

import {ArrowLeft,BookOpen,CalendarDays,CheckCircle2,Clock3,MessageSquare,Repeat2,ShieldCheck} from 'lucide-react';
import {useI18n} from '@/lib/i18n';

export default function ManagerTutorialsPage(){
 const {locale}=useI18n();const es=locale==='es';
 const items=[
  {icon:CalendarDays,title:es?'Crear y editar horarios':'Create and edit schedules',body:es?'Abre Horario para asignar turnos, ajustar horas y mantener la semana correcta antes de publicarla.':'Open Schedule to assign shifts, adjust times and keep the week correct before publishing.'},
  {icon:CheckCircle2,title:es?'Publicar el horario':'Publish the schedule',body:es?'Cuando termines la revisión, usa Publicar horario para poner la versión aprobada a disposición del personal.':'After review, use Publish schedule to make the approved version available to Staff.'},
  {icon:Clock3,title:es?'Solicitudes':'Requests',body:es?'Revisa solicitudes de tiempo libre, disponibilidad y otras acciones relacionadas con el horario.':'Review time-off, availability and other schedule-related requests.'},
  {icon:Repeat2,title:es?'Cobertura e intercambios':'Coverage and trades',body:es?'Administra turnos abiertos y cambios elegibles cuando el equipo necesite cobertura.':'Manage open shifts and eligible changes when the team needs coverage.'},
  {icon:MessageSquare,title:es?'Mensajes':'Messages',body:es?'Usa Mensajes para comunicación operativa, conversaciones del equipo y anuncios.':'Use Messages for operational communication, team conversations and announcements.'},
  {icon:ShieldCheck,title:es?'Reportar un problema':'Report a problem',body:es?'Si algo no funciona como debería, usa Reportar un problema desde tu espacio de trabajo.':'If something does not work as expected, use Report a problem from your workspace.'},
 ];
 return <div className="app-shell"><header className="topbar"><a className="round-button" href="/manager/workspace" aria-label={es?'Atrás':'Back'}><ArrowLeft/></a><div style={{flex:1}}><div className="brand-kicker">El Molino Ops</div><div className="brand-title">{es?'Guía de gerencia':'Manager guide'}</div></div></header><main className="page" style={{maxWidth:820,margin:'0 auto'}}><div className="page-heading"><h1>{es?'Cómo usar tu espacio de trabajo':'How to use your workspace'}</h1><p>{es?'Esta guía cubre las funciones que usas para administrar al personal y sus horarios.':'This guide covers the tools you use to manage Staff and their schedules.'}</p></div><div className="quick-grid">{items.map(({icon:Icon,title,body})=><section className="quick-card" key={title}><Icon/><b>{title}</b><small>{body}</small></section>)}</div><section className="card" style={{marginTop:18}}><BookOpen/><h2>{es?'Recorrido interactivo':'Interactive walkthrough'}</h2><p className="muted">{es?'Abre el recorrido para que la app te muestre cada área directamente en tu espacio de trabajo.':'Open the walkthrough and the app will point out each area directly in your workspace.'}</p><a className="btn primary" href="/manager/workspace?tour=1">{es?'Iniciar recorrido':'Start walkthrough'}</a></section></main></div>;
}
