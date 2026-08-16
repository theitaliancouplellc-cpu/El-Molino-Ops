'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {AlertTriangle,ArrowLeft,CheckCircle2,ClipboardCheck,Clock3,DollarSign,GraduationCap,Loader2,PackageX,Users,Wrench} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {businessDateInZone,cappedExactLabel,chooseLatestRun,isOverdue,isOpenStatus,safeKindQuery,safeMessage,validPriority} from '@/lib/intermediate-hardening';

type Profile={app_role:'admin'|'manager'|'employee';location_id:string|null};
type Task={id:string;title:string;status:string;priority:string;due_at:string|null};
type Ops={id:string;kind:string;title:string;status:string;priority:string;due_at:string|null;data:Record<string,unknown>};
type Run={id:string;checklist_template_id:string;business_date:string;completed_at:string|null;created_at:string;started_at?:string|null};
type Template={id:string;title:string;period:string};
type Working={punch_id:string;employee_id:string;employee_name:string;clock_in:string;source:string;on_break:boolean;break_started_at:string|null};
const TASK_CAP=500,OPS_CAP=750;

export default function ManagerPage(){
 const [loading,setLoading]=useState(true),[profile,setProfile]=useState<Profile|null>(null),[tasks,setTasks]=useState<Task[]>([]),[ops,setOps]=useState<Ops[]>([]),[runs,setRuns]=useState<Run[]>([]),[templates,setTemplates]=useState<Template[]>([]),[employees,setEmployees]=useState(0),[working,setWorking]=useState<Working[]>([]),[timecardsToReview,setTimecardsToReview]=useState(0),[draftTipRuns,setDraftTipRuns]=useState(0),[message,setMessage]=useState(''),[lastUpdated,setLastUpdated]=useState<Date|null>(null);
 const req=useRef(0);
 useEffect(()=>{void load();const onFocus=()=>void load();window.addEventListener('focus',onFocus);return()=>window.removeEventListener('focus',onFocus)},[]);
 async function load(){
  const id=++req.current;setLoading(true);
  const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('app_role,location_id').eq('id',u.user.id).single();if(id!==req.current)return;
  if(!p.data){setMessage(safeMessage(p.error?.message,'Profile unavailable.'));setLoading(false);return}
  const me=p.data as Profile;setProfile(me);if(!['admin','manager'].includes(me.app_role)){location.href='/my-work';return}
  if(!me.location_id){setMessage('No restaurant location is assigned.');setLoading(false);return}
  const today=businessDateInZone(),locationId=me.location_id;
  const [t,o,r,ct,e,w,tc,tp]=await Promise.all([
   supabase.from('tasks').select('id,title,status,priority,due_at').is('deleted_at',null).order('due_at',{ascending:true,nullsFirst:false}).limit(TASK_CAP),
   supabase.from('ops_records').select('id,kind,title,status,priority,due_at,data').is('deleted_at',null).is('archived_at',null).order('updated_at',{ascending:false}).limit(OPS_CAP),
   supabase.from('checklist_runs').select('id,checklist_template_id,business_date,completed_at,created_at,started_at').eq('business_date',today).limit(500),
   supabase.from('checklist_templates').select('id,title,period').eq('active',true).order('title').limit(500),
   supabase.from('employees').select('id',{count:'exact',head:true}).eq('active',true).is('deleted_at',null),
   supabase.rpc('time_clock_whos_working',{}),
   supabase.from('time_clock_punches').select('id',{count:'exact',head:true}).eq('location_id',locationId).not('clock_out','is',null).is('manager_approved_at',null),
   supabase.from('tip_pool_runs').select('id',{count:'exact',head:true}).eq('location_id',locationId).eq('status','draft')
  ]);
  if(id!==req.current)return;
  const errors=[t.error,o.error,r.error,ct.error,e.error,w.error,tc.error,tp.error].filter(Boolean);
  setMessage(errors.length?safeMessage(errors[0]?.message,'Some manager data could not be loaded.'):'');
  setTasks(((t.data??[]) as Task[]).filter(x=>isOpenStatus(x.status)));setOps(((o.data??[]) as Ops[]).filter(x=>isOpenStatus(x.status)));setRuns((r.data??[]) as Run[]);setTemplates((ct.data??[]) as Template[]);setEmployees(e.count??0);setWorking((w.data??[]) as Working[]);setTimecardsToReview(tc.count??0);setDraftTipRuns(tp.count??0);setLastUpdated(new Date());setLoading(false)
 }
 const now=Date.now(),overdue=tasks.filter(t=>isOverdue(t.due_at,now)),urgent=ops.filter(o=>['urgent','high'].includes(validPriority(o.priority))),maintenance=ops.filter(o=>o.kind==='maintenance_ticket'),stock=ops.filter(o=>o.kind==='stock_flag'||o.kind==='menu_availability'),incidents=ops.filter(o=>o.kind==='incident'),urgentOther=urgent.filter(o=>o.kind!=='incident');
 const checklistProgress=useMemo(()=>templates.map(t=>({template:t,run:chooseLatestRun(runs.filter(r=>r.checklist_template_id===t.id))})),[templates,runs]);
 if(loading)return <div className="full-loader"><Loader2 className="spin"/><span>Building manager view…</span></div>;if(!profile||!['admin','manager'].includes(profile.app_role))return null;
 const today=businessDateInZone(),attention=urgentOther.length+overdue.length+incidents.length+timecardsToReview;
 return <div className="app-shell"><header className="topbar"><a className="round-button" href="/" aria-label="Back"><ArrowLeft/></a><div style={{flex:1}}><div className="brand-kicker">El Molino Ops</div><div className="brand-title">Manager</div></div></header><main className="page">
  {message&&<div className="toast-message">{message}</div>}
  <div className="page-heading"><h1>Manager overview</h1><p>Exceptions, staffing, timekeeping and daily operating systems in one command view.{lastUpdated&&<> Last refreshed {lastUpdated.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}.</>}</p></div>
  <div className="metric-grid"><div className="metric"><strong>{working.length}</strong><span>working now</span></div><div className="metric"><strong>{timecardsToReview}</strong><span>timecards to review</span></div><div className="metric"><strong>{draftTipRuns}</strong><span>draft tip runs</span></div><div className="metric"><strong>{employees}</strong><span>active team</span></div></div>
  <div className="section-title"><h2>People & pay</h2><span>live controls</span></div><div className="quick-grid"><a className="quick-card" href="/time-clock"><Clock3/><b>Time Clock</b><small>{working.length} working · {timecardsToReview} awaiting manager review</small></a><a className="quick-card" href="/tips"><DollarSign/><b>Tip Pooling</b><small>{draftTipRuns} draft runs · finalized distributions stay locked</small></a><a className="quick-card" href="/team"><Users/><b>Team Hub</b><small>{employees} active employees</small></a><a className="quick-card" href="/training"><GraduationCap/><b>Training</b><small>Assignments, courses & certifications</small></a></div>
  <div className="section-title"><h2>Shift execution</h2><span>{today}</span></div><div className="list">{checklistProgress.map(x=><a className="list-item" href={`/shift?period=${encodeURIComponent(x.template.period)}`} key={x.template.id}><span className="icon-wrap"><ClipboardCheck/></span><span className="list-main"><b>{x.template.title}</b><small>{x.run?.completed_at?'Completed today':x.run?'In progress':'Not started'}</small></span><span className="status">{x.run?.completed_at?'done':x.run?'active':'pending'}</span></a>)}</div>
  <div className="section-title"><h2>Needs attention</h2><span>{attention}</span></div>{attention?<div className="list">{timecardsToReview>0&&<a className="list-item" href="/time-clock"><Clock3/><span className="list-main"><b>{timecardsToReview} timecard{timecardsToReview===1?'':'s'} awaiting review</b><small>Closed punches without manager approval</small></span></a>}{overdue.slice(0,6).map(t=><a className="list-item" href="/tasks" key={`t-${t.id}`}><AlertTriangle/><span className="list-main"><b>{t.title}</b><small>Overdue task · {validPriority(t.priority)}</small></span></a>)}{incidents.slice(0,6).map(o=><a className="list-item" href="/ops?kind=incident" key={`i-${o.id}`}><AlertTriangle/><span className="list-main"><b>{o.title}</b><small>Open incident</small></span></a>)}{urgentOther.slice(0,8).map(o=><a className="list-item" href={`/ops?kind=${encodeURIComponent(safeKindQuery(o.kind))}`} key={`o-${o.id}`}><AlertTriangle/><span className="list-main"><b>{o.title}</b><small>{safeKindQuery(o.kind).replace(/_/g,' ')} · {validPriority(o.priority)}</small></span></a>)}</div>:<div className="empty-state"><CheckCircle2/><b>No urgent exceptions</b><span>No overdue tasks, timecards awaiting review, incidents, or high-priority operational records right now.</span></div>}
  <div className="section-title"><h2>Restaurant command center</h2><span>daily systems</span></div><div className="quick-grid"><a className="quick-card" href="/performance"><ClipboardCheck/><b>Performance</b><small>Sales, labor & Toast</small></a><a className="quick-card" href="/logbook"><ClipboardCheck/><b>MOD Logbook</b><small>Shift handoff & follow-up</small></a><a className="quick-card" href="/schedule"><Users/><b>Schedule</b><small>Shifts, call-outs & time off</small></a><a className="quick-card" href="/inventory"><PackageX/><b>Inventory</b><small>Pars, ordering & food cost</small></a><a className="quick-card" href="/safety"><CheckCircle2/><b>Food Safety</b><small>Checks & temperatures</small></a><a className="quick-card" href="/maintenance"><Wrench/><b>Maintenance</b><small>Equipment & repairs</small></a><a className="quick-card" href="/incidents"><AlertTriangle/><b>Incidents</b><small>Private incident register</small></a><a className="quick-card" href="/cash"><ClipboardCheck/><b>Cash Controls</b><small>Deposits & over/short</small></a><a className="quick-card" href="/vendors"><Wrench/><b>Vendors</b><small>Accounts & service history</small></a></div>
  <div className="section-title"><h2>Quick management</h2><span>jump in</span></div><div className="quick-grid"><a className="quick-card" href="/ops?kind=maintenance_ticket"><Wrench/><b>Maintenance</b><small>{maintenance.length} loaded open records</small></a><a className="quick-card" href="/ops?kind=stock_flag"><PackageX/><b>Stock & 86</b><small>{stock.length} current flags</small></a><a className="quick-card" href="/tasks"><ClipboardCheck/><b>Assignments</b><small>{cappedExactLabel(tasks.length,TASK_CAP)} open tasks</small></a><a className="quick-card" href="/team"><Users/><b>Team</b><small>{employees} active people</small></a></div>
 </main></div>
}
