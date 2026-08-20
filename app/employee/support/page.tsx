'use client';

import {FormEvent,useEffect,useRef,useState} from 'react';
import {ArrowLeft,BookOpen,CheckCircle2,HelpCircle,RefreshCw,Send,ShieldAlert} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {useI18n} from '@/lib/i18n';
import styles from '../employee.module.css';

type Category='account'|'schedule'|'requests'|'messages'|'notifications'|'app_error'|'other';
type Report={id:string;category:Category;summary:string;status:'open'|'acknowledged'|'resolved'|'closed';manager_note:string|null;submitted_at:string;reviewed_at:string|null};
type Diagnostics={route:string|null;release_sha:string|null;platform:'web'|'ios'|'android'|'unknown';app_version:string|null;connectivity:'online'|'offline'|'unknown';error_id:string|null};
type PendingAttempt={id:string;diagnostics:Diagnostics};
type Profile={app_role:'admin'|'manager'|'employee'};

const SHA=/^[0-9a-f]{40}$/;
function platformFromNavigator():Diagnostics['platform']{
 const ua=typeof navigator==='undefined'?'':navigator.userAgent.toLowerCase();
 if(/iphone|ipad|ipod/.test(ua))return 'ios';
 if(/android/.test(ua))return 'android';
 return ua?'web':'unknown';
}
function safeRoute():string|null{
 if(typeof window==='undefined')return null;
 const route=window.location.pathname;
 return /^\/[A-Za-z0-9/_-]*$/.test(route)&&route.length<=240?route:null;
}
function statusTone(status:Report['status']){return status==='resolved'||status==='closed'?'true':'false'}

export default function EmployeeSupportPage(){
 const {locale}=useI18n();
 const c=locale==='es'?{
  opening:'Abriendo ayuda…',back:'Volver a Más',staff:'Personal de El Molino',title:'Ayuda',hero:'¿Algo no funciona?',intro:'Revisa la guía o envía un reporte claro para que gerencia pueda darle seguimiento.',guide:'Guía de la aplicación',guideBody:'Consulta el recorrido de las herramientas disponibles para el equipo.',publicHelp:'Ayuda de contacto',publicHelpBody:'Información general de soporte y contacto de El Molino.',report:'Reportar un problema',reportBody:'Describe lo que intentabas hacer, qué pasó y qué esperabas que pasara.',category:'Área',summary:'Resumen corto',summaryHint:'Ejemplo: No puedo abrir mi solicitud de tiempo libre',details:'¿Qué pasó?',detailsHint:'Incluye los pasos que seguiste y lo que viste en pantalla.',privacy:'No incluyas contraseñas, códigos de verificación, claves API, tokens push, información de nómina/RR. HH. ni datos privados de otra persona.',diagnostics:'Diagnóstico seguro incluido',diagBody:'Solo se adjuntan la sección actual de la app, versión de lanzamiento si está disponible, plataforma y estado de conexión. No se envían parámetros de URL ni credenciales.',send:'Enviar reporte',sending:'Enviando…',sent:'Reporte enviado. Gerencia podrá revisarlo en el sistema.',loadError:'No se pudieron cargar tus reportes.',submitError:'No se pudo enviar el reporte. Puedes intentarlo otra vez sin crear un duplicado.',history:'Tus reportes recientes',historyBody:'El estado se actualiza cuando gerencia revisa el problema.',none:'Todavía no has enviado reportes.',manager:'Nota de gerencia',refresh:'Actualizar',categories:{account:'Cuenta',schedule:'Horario',requests:'Solicitudes',messages:'Mensajes',notifications:'Notificaciones',app_error:'Error de la aplicación',other:'Otro'},statuses:{open:'Abierto',acknowledged:'Recibido',resolved:'Resuelto',closed:'Cerrado'}
 }:{
  opening:'Opening help…',back:'Back to More',staff:'El Molino Staff',title:'Help',hero:'Something not working?',intro:'Check the app guide or send a clear problem report so management can follow up.',guide:'App guide',guideBody:'Review the walkthrough for Staff tools that are currently available.',publicHelp:'Contact help',publicHelpBody:'General El Molino support and contact information.',report:'Report a problem',reportBody:'Describe what you were trying to do, what happened, and what you expected.',category:'Area',summary:'Short summary',summaryHint:'Example: I cannot open my time-off request',details:'What happened?',detailsHint:'Include the steps you took and what you saw on screen.',privacy:'Do not include passwords, verification codes, API keys, push tokens, payroll/HR information, or another person’s private details.',diagnostics:'Safe diagnostics included',diagBody:'Only the current app section, release version when available, platform, and connection state are attached. URL parameters and credentials are not sent.',send:'Send report',sending:'Sending…',sent:'Report sent. Management can review it in the system.',loadError:'Your reports could not be loaded.',submitError:'The report could not be sent. You can retry without creating a duplicate.',history:'Your recent reports',historyBody:'The status updates when management reviews the problem.',none:'You have not submitted any reports yet.',manager:'Management note',refresh:'Refresh',categories:{account:'Account',schedule:'Schedule',requests:'Requests',messages:'Messages',notifications:'Notifications',app_error:'App error',other:'Other'},statuses:{open:'Open',acknowledged:'Acknowledged',resolved:'Resolved',closed:'Closed'}
 };
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[reports,setReports]=useState<Report[]>([]);
 const [category,setCategory]=useState<Category>('app_error'),[summary,setSummary]=useState(''),[description,setDescription]=useState(''),[releaseSha,setReleaseSha]=useState<string|null>(null);
 const pending=useRef<PendingAttempt|null>(null);
 useEffect(()=>{void load();void loadRelease()},[]);
 async function loadRelease(){
  try{const r=await fetch('/api/health',{cache:'no-store'});if(!r.ok)return;const body=await r.json();const sha=String(body?.release?.sha||'').toLowerCase();if(SHA.test(sha))setReleaseSha(sha)}catch{}
 }
 async function load(){
  setBusy(true);setMessage('');
  const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('app_role').eq('id',u.user.id).single();
  if(p.error||!p.data){setMessage(c.loadError);setReady(true);setBusy(false);return}
  if((p.data as Profile).app_role!=='employee'){location.href='/manager';return}
  const setup=await supabase.rpc('employee_self_setup_status',{});
  if(setup.error||setup.data?.status!=='approved'||setup.data?.employment_status!=='active'){location.href=setup.data?.status==='approved'?'/employee/access':'/employee/setup';return}
  const result=await supabase.rpc('my_employee_support_reports',{p_limit:20});
  if(result.error)setMessage(c.loadError);else setReports((result.data??[]) as Report[]);
  setReady(true);setBusy(false)
 }
 function invalidateAttempt(){pending.current=null}
 function diagnosticSnapshot():Diagnostics{return {route:safeRoute(),release_sha:releaseSha,platform:platformFromNavigator(),app_version:null,connectivity:typeof navigator==='undefined'?'unknown':navigator.onLine?'online':'offline',error_id:null}}
 async function submit(e:FormEvent){
  e.preventDefault();if(busy)return;
  const cleanSummary=summary.trim(),cleanDescription=description.trim();
  if(cleanSummary.length<5||cleanDescription.length<10)return;
  const attempt=pending.current??{id:crypto.randomUUID(),diagnostics:diagnosticSnapshot()};pending.current=attempt;
  setBusy(true);setMessage('');
  const {error}=await supabase.rpc('submit_employee_support_report',{p_client_request_id:attempt.id,p_category:category,p_summary:cleanSummary,p_description:cleanDescription,p_route:attempt.diagnostics.route,p_release_sha:attempt.diagnostics.release_sha,p_platform:attempt.diagnostics.platform,p_app_version:attempt.diagnostics.app_version,p_connectivity:attempt.diagnostics.connectivity,p_error_id:attempt.diagnostics.error_id});
  if(error){setMessage(c.submitError);setBusy(false);return}
  pending.current=null;setCategory('app_error');setSummary('');setDescription('');setMessage(c.sent);await load();setBusy(false)
 }
 if(!ready)return <main className={styles.page}>{c.opening}</main>;
 return <main className={styles.page}>
  <header className={styles.header}><a className={styles.iconButton} href="/employee/more" aria-label={c.back}><ArrowLeft size={20}/></a><div className={styles.brand}><small>{c.staff}</small><strong>{c.title}</strong></div><button className={styles.iconButton} disabled={busy} onClick={load} aria-label={c.refresh}><RefreshCw size={18}/></button></header>
  {message&&<div className={message===c.sent?styles.notice:styles.error} role="status">{message}</div>}
  <section className={styles.hero}><small>{c.staff}</small><h1>{c.hero}</h1><p>{c.intro}</p></section>
  <section className={styles.section}><div className={styles.grid}><a className={styles.card} href="/employee/tutorials"><BookOpen size={20}/><b>{c.guide}</b><small>{c.guideBody}</small></a><a className={styles.card} href="/support"><HelpCircle size={20}/><b>{c.publicHelp}</b><small>{c.publicHelpBody}</small></a></div></section>
  <section className={styles.section}><div className={styles.setupCard}><div className={styles.sectionHead}><div><h2>{c.report}</h2><span>{c.reportBody}</span></div><Send size={19}/></div><form className={styles.form} onSubmit={submit}><label className={styles.field}><span>{c.category}</span><select value={category} onChange={e=>{setCategory(e.target.value as Category);invalidateAttempt()}}>{(Object.keys(c.categories) as Category[]).map(key=><option key={key} value={key}>{c.categories[key]}</option>)}</select></label><label className={styles.field}><span>{c.summary}</span><input required minLength={5} maxLength={160} value={summary} placeholder={c.summaryHint} onChange={e=>{setSummary(e.target.value);invalidateAttempt()}}/></label><label className={styles.field}><span>{c.details}</span><textarea required minLength={10} maxLength={4000} rows={7} value={description} placeholder={c.detailsHint} onChange={e=>{setDescription(e.target.value);invalidateAttempt()}}/></label><div className={styles.error}><ShieldAlert size={17} aria-hidden="true"/> {c.privacy}</div><div className={styles.notice}><b>{c.diagnostics}</b><br/>{c.diagBody}</div><button className={styles.button} disabled={busy||summary.trim().length<5||description.trim().length<10}><Send size={17}/>{busy?c.sending:c.send}</button></form></div></section>
  <section className={styles.section}><div className={styles.sectionHead}><div><h2>{c.history}</h2><span>{c.historyBody}</span></div><span>{reports.length}</span></div><div className={styles.list}>{reports.map(report=><article className={styles.preferenceRow} key={report.id}><div className={styles.sectionHead}><div><h2>{report.summary}</h2><span>{c.categories[report.category]||report.category}</span></div><span className={styles.pill} data-complete={statusTone(report.status)}>{c.statuses[report.status]||report.status}</span></div><div className={styles.notificationMeta}><span>{new Date(report.submitted_at).toLocaleString(locale==='es'?'es-US':'en-US')}</span><span>#{report.id.slice(0,8)}</span></div>{report.manager_note&&<p className={styles.muted}><b>{c.manager}:</b> {report.manager_note}</p>}{(report.status==='resolved'||report.status==='closed')&&<div className={styles.changedLabel}><CheckCircle2 size={14}/>{c.statuses[report.status]}</div>}</article>)}{!reports.length&&<div className={styles.empty}>{c.none}</div>}</div></section>
 </main>
}
