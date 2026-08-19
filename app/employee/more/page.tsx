'use client';

import {Bell,CalendarDays,Clock3,Home,Languages,MessageSquare,Settings,ShieldCheck,UserRound} from 'lucide-react';
import {LanguageToggle,useI18n} from '@/lib/i18n';
import styles from '../employee.module.css';

export default function EmployeeMorePage(){
 const {locale,t}=useI18n();
 const c=locale==='es'?{
  title:'Más',body:'Tu equipo, notificaciones, idioma y cuenta.',team:'Equipo',teamBody:'Personas, anuncios y contacto con gerencia.',preferences:'Preferencias de notificaciones',preferencesBody:'Elige cómo quieres recibir las actualizaciones disponibles.',account:'Cuenta y seguridad',accountBody:'Perfil, puestos verificados, correo y contraseña.',language:'Idioma',languageBody:'Cambia el idioma de la aplicación.'
 }:{
  title:'More',body:'Your team, notifications, language and account.',team:'Team',teamBody:'People, announcements and manager contact.',preferences:'Notification preferences',preferencesBody:'Choose how you receive available updates.',account:'Account & Security',accountBody:'Profile, verified positions, email and password.',language:'Language',languageBody:'Change the app language.'
 };
 return <main className={styles.page}>
  <header className={styles.header}><div className={styles.brand}><small>El Molino · Johns Island</small><strong>{c.title}</strong></div></header>
  <section className={styles.hero}><small>{t('employee.staff')}</small><h1>{c.title}</h1><p>{c.body}</p></section>
  <section className={styles.section}><div className={styles.list}>
   <a className={styles.row} href="/employee/team"><MessageSquare size={19}/><span className={styles.rowMain}><b>{c.team}</b><small>{c.teamBody}</small></span></a>
   <a className={styles.row} href="/employee/notifications"><Bell size={19}/><span className={styles.rowMain}><b>{t('nav.notifications')}</b><small>{t('employee.noNotifications')}</small></span></a>
   <a className={styles.row} href="/employee/notifications/preferences"><Settings size={19}/><span className={styles.rowMain}><b>{c.preferences}</b><small>{c.preferencesBody}</small></span></a>
   <a className={styles.row} href="/account"><ShieldCheck size={19}/><span className={styles.rowMain}><b>{c.account}</b><small>{c.accountBody}</small></span></a>
  </div></section>
  <section className={styles.section}><div className={styles.sectionHead}><h2><Languages size={18}/> {c.language}</h2><span>{c.languageBody}</span></div><LanguageToggle/></section>
  <nav className={styles.tabs} aria-label={t('employee.staffNav')}><a className={styles.tab} href="/employee"><Home size={19}/>{t('nav.home')}</a><a className={styles.tab} href="/employee/schedule"><CalendarDays size={19}/>{t('nav.schedule')}</a><a className={styles.tab} href="/employee/requests"><Clock3 size={19}/>{t('nav.requests')}</a><a className={styles.tab} href="/employee/team"><MessageSquare size={19}/>{t('nav.messages')}</a><a className={`${styles.tab} ${styles.tabActive}`} href="/employee/more"><UserRound size={19}/>{t('common.more')}</a></nav>
 </main>;
}
