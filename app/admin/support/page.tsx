'use client';

import {useEffect,useState} from 'react';
import {ArrowLeft,CheckCircle2,Loader2,RefreshCw,ShieldAlert} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {useI18n} from '@/lib/i18n';

type Role='admin'|'manager'|'employee';
type Status='open'|'acknowledged'|'resolved'|'closed';
type Profile={app_role:Role};
type Report={id:string;employee_id:string;employee_name:string|null;category:string;summary:string;description:string;route:string|null;release_sha:string|null;platform:string;app_version:string|null;connectivity:string;error_id:string|null;status:Status;manager_note:string|null;submitted_at:string;reviewed_at:string|null;reviewed_by:string|null};

export default function AdminSupportPage(){
 const {locale}=useI18n();
 const c=locale==='es'?{
  opening:'Abriendo reportes…',denied:'Se requiere acceso de gerencia.',back:'Volver',title:'Reportes del equipo',body:'Problemas enviados desde la aplicación del personal. El contenido es escrito por el empleado; los datos de diagnóstico están limitados a campos seguros.',filter:'Estado',all:'Todos',refresh:'Actualizar',loadError:'No se pudieron cargar los reportes.',saveError:'No se pudo actualizar el reporte.',saved:'Reporte actualizado.',none:'No hay reportes en este estado.',submitted:'Enviado',diagnostics:'Diagnóstico',route:'Sección',release:'Lanzamiento',platform:'Plataforma',connection:'Conexión',errorRef:'Referencia de error',note:'Nota para el empleado',noteHint:'Explica el resultado o el siguiente paso sin incluir información privada de otras personas.',save:'Guardar revisión',statuses:{open:'Abierto',acknowledged:'Recibido',resolved:'Resuelto',closed:'Cerrado'}
 }:{
  opening:'Opening reports…',denied:'Management access required.',back:'Back',title:'Staff problem reports',body:'Problems submitted from the Staff app. Report text is employee-authored; diagnostic data is limited to safe fields.',filter:'Status',all:'All',refresh:'Refresh',loadError:'Reports could not be loaded.',saveError:'The report could not be updated.',saved:'Report updated.',none:'No reports in this status.',submitted:'Submitted',diagnostics:'Diagnostics',route:'Section',release:'Release',platform:'Platform',connection:'Connection',errorRef:'Error reference',note:'Note for the employee',noteHint:'Explain the result or next step without including another person’s private information.',save:'Save review',statuses:{open:'Open',acknowledged:'Acknowledged',resolved:'Resolved',closed:'Closed'}
 };
 const [role,setRole]=useState<Role|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[filter,setFilter]=useState<'all'|Status>('all'),[reports,setReports]=useState<Report[]>([]),[draftStatus,setDraftStatus]=useState<Record<string,Status>>({}),[draftNote,setDraftNote]=useState<Record<string,string>>({});
 useEffect(()=>{void load()},[filter]);
 async function load(){
  setBusy(true);setMessage('');
  const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('app_role').eq('id',u.user.id).single();
  const appRole=(p.data as Profile|undefined)?.app_role??null;setRole(appRole);
  if(p.error||!appRole||!['admin','manager'].includes(appRole)){setReady(true);setBusy(false);return}
  const r=await supabase.rpc('employee_support_reports_for_manager',{p_status:filter==='all'?null:filter,p_limit:200});
  if(r.error)setMessage(c.loadError);else{
   const rows=(r.data??[]) as Report[];setReports(rows);
   setDraftStatus(Object.fromEntries(rows.map(x=>[x.id,x.status])) as Record<string,Status>);
   setDraftNote(Object.fromEntries(rows.map(x=>[x.id,x.manager_note??''])));
  }
  setReady(true);setBusy(false)
 }
 async function save(report:Report){
  if(busy)return;setBusy(true);setMessage('');
  const status=draftStatus[report.id]??report.status,note=(draftNote[report.id]??'').trim();
  const r=await supabase.rpc('review_employee_support_report',{p_report_id:report.id,p_status:status,p_manager_note:note||null});
  if(r.error){setMessage(c.saveError);setBusy(false);return}
  await load();setMessage(c.saved);setBusy(false)
 }
 if(!ready)return <div className="full-loader"><Loader2 className="spin"/><span>{c.opening}</span></div>;
 if(!role||!['admin','manager'].includes(role))return <main className="page"><a href="/">‹ {c.back}</a><div className="empty-state"><ShieldAlert/><b>{c.denied}</b></div></main>;
 const back=role==='admin'?'/admin':'/manager';
 return <div className="app-shell"><header className="topbar"><a className="round-button" href={back} aria-label={c.back}><ArrowLeft/></a><div className="brand-title">{c.title}</div><button className="round-button" disabled={busy} onClick={load} aria-label={c.refresh}><RefreshCw/></button></header><main className="page">{message&&<div className="toast-message" role="status">{message}</div>}<div className="page-heading"><h1>{c.title}</h1><p>{c.body}</p></div><div className="card"><label className="field"><span>{c.filter}</span><select className="select" value={filter} disabled={busy} onChange={e=>setFilter(e.target.value as 'all'|Status)}><option value="all">{c.all}</option>{(Object.keys(c.statuses) as Status[]).map(s=><option key={s} value={s}>{c.statuses[s]}</option>)}</select></label></div><div className="list" style={{marginTop:14}}>{reports.map(report=><article className="card" key={report.id}><div className="card-title-row"><div><h3>{report.summary}</h3><small>{report.employee_name||report.employee_id.slice(0,8)} · {c.submitted} {new Date(report.submitted_at).toLocaleString(locale==='es'?'es-US':'en-US')}</small></div><span className="pill">{c.statuses[report.status]}</span></div><p style={{whiteSpace:'pre-wrap'}}>{report.description}</p><details><summary><b>{c.diagnostics}</b></summary><div className="list" style={{marginTop:8}}>{report.route&&<small><b>{c.route}:</b> {report.route}</small>}{report.release_sha&&<small><b>{c.release}:</b> {report.release_sha.slice(0,12)}</small>}<small><b>{c.platform}:</b> {report.platform}</small><small><b>{c.connection}:</b> {report.connectivity}</small>{report.error_id&&<small><b>{c.errorRef}:</b> {report.error_id}</small>}</div></details><div className="form" style={{marginTop:14}}><label className="field"><span>{c.filter}</span><select className="select" value={draftStatus[report.id]??report.status} disabled={busy} onChange={e=>setDraftStatus({...draftStatus,[report.id]:e.target.value as Status})}>{(Object.keys(c.statuses) as Status[]).map(s=><option key={s} value={s}>{c.statuses[s]}</option>)}</select></label><label className="field"><span>{c.note}</span><textarea className="input" rows={4} maxLength={2000} value={draftNote[report.id]??''} placeholder={c.noteHint} disabled={busy} onChange={e=>setDraftNote({...draftNote,[report.id]:e.target.value})}/></label><button className="btn" disabled={busy} onClick={()=>save(report)}><CheckCircle2/> {c.save}</button></div></article>)}{!reports.length&&<div className="empty-state">{c.none}</div>}</div></main></div>
}
