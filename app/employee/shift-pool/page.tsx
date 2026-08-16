'use client';

import {useEffect,useMemo,useState} from 'react';
import {AlertTriangle,CalendarDays,CheckCircle2,ChevronLeft,Clock3,Home,MessageSquare,Repeat2,ShieldCheck,UserRound} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import styles from '../employee.module.css';

type Warning={code:string;severity:'error'|'warning'|'info';message:string;projected_hours?:number};
type Offer={id:string;shift_id:string;offered_by_employee_id:string;offered_by_name:string;offer_type:'full'|'partial';offered_starts_at:string;offered_ends_at:string;comment:string|null;status:string;role_name:string;warnings:Warning[]};
type OpenShift={id:string;role_name:string;starts_at:string;ends_at:string;status:string;warnings:Warning[]};
type MyOffer={id:string;shift_id:string;offer_type:string;offered_starts_at:string;offered_ends_at:string;comment:string|null;status:string;role_name:string;pending_bid_count:number};
type MyBid={id:string;offer_id:string;status:string;comment:string|null;created_at:string;offered_starts_at:string;offered_ends_at:string;role_name:string};
type MyClaim={id:string;shift_id:string;status:string;created_at:string;starts_at:string;ends_at:string;role_name:string};
type Trade={id:string;status:string;reason:string|null;created_at:string;requested_by_employee_id:string|null;requested_by_name:string;target_employee_id:string|null;target_employee_name:string;source_shift_id:string;source_starts_at:string;source_ends_at:string;source_role_name:string;target_shift_id:string|null;target_starts_at:string|null;target_ends_at:string|null;target_role_name:string};
type Snapshot={employee_id:string;visible_offers:Offer[];open_shifts:OpenShift[];my_offers:MyOffer[];my_bids:MyBid[];my_claims:MyClaim[];my_trades:Trade[];up_for_grabs_count:number};
type Tab='grabs'|'activity'|'trades';

const fmt=(iso:string)=>new Date(iso).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const end=(iso:string)=>new Date(iso).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const pretty=(s:string)=>s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const hasError=(warnings:Warning[]|undefined)=>Boolean(warnings?.some(w=>w.severity==='error'));

export default function EmployeeShiftPool(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[snapshot,setSnapshot]=useState<Snapshot|null>(null),[tab,setTab]=useState<Tab>('grabs');
 useEffect(()=>{void load()},[]);
 async function load(){setBusy(true);setNotice('');const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}const p=await supabase.from('profiles').select('app_role').eq('id',u.user.id).single();if(p.error){setNotice('Could not open Shift Pool.');setReady(true);setBusy(false);return}if(p.data?.app_role!=='employee'){location.href='/schedule/pool';return}const {data,error}=await supabase.rpc('employee_shift_pool_snapshot',{});if(error)setNotice(error.message);else setSnapshot(data as Snapshot);setReady(true);setBusy(false)}
 async function act(run:()=>any,success:string){if(busy)return;setBusy(true);setNotice('');try{const result=await run();if(result?.error)throw result.error;setNotice(success);await load()}catch(error:any){setNotice(error?.message||'That Shift Pool action could not be completed.')}finally{setBusy(false)}}
 const bid=(offer:Offer)=>act(()=>supabase.rpc('bid_on_shift_pool_offer',{p_offer_id:offer.id,p_comment:null}),'Bid sent for manager approval. You are not responsible for the shift unless it is approved.');
 const claim=(shift:OpenShift)=>act(()=>supabase.rpc('claim_open_shift',{p_shift_id:shift.id}),'Open-shift request sent. Your schedule changes only after approval when approval is required.');
 const withdrawOffer=(offer:MyOffer)=>act(()=>supabase.rpc('withdraw_my_shift_pool_offer',{p_offer_id:offer.id}),'Your shift was taken back from the pool.');
 const withdrawBid=(bid:MyBid)=>act(()=>supabase.rpc('withdraw_my_shift_pool_bid',{p_bid_id:bid.id}),'Your bid was withdrawn.');
 const pendingActivity=useMemo(()=>snapshot?(snapshot.my_bids.filter(x=>x.status==='pending').length+snapshot.my_claims.filter(x=>x.status==='pending').length+snapshot.my_offers.filter(x=>x.status==='open').length):0,[snapshot]);
 if(!ready)return <main className={styles.page}>Opening Shift Pool…</main>;
 const s=snapshot;
 return <main className={styles.page}>
  <header className={styles.header}><a className={styles.iconButton} href="/employee/schedule" aria-label="Back to my schedule"><ChevronLeft size={20}/></a><div className={styles.brand}><small>El Molino · Staff</small><strong>Shift Pool</strong></div><span className={styles.iconButton} aria-hidden="true"><Repeat2 size={20}/></span></header>
  {notice&&<div className={styles.notice}>{notice}</div>}
  <section className={styles.hero}><small>Schedule flexibility</small><h1>{s?.up_for_grabs_count||0} shift option{(s?.up_for_grabs_count||0)===1?'':'s'} available.</h1><p>Pick up shifts you are actually eligible to work, track your requests, and follow trades without seeing manager controls.</p><div className={styles.next}><b>You keep responsibility for any shift you offer until reassignment is approved.</b><span>Role, overlap, time off, availability, rest and hour limits are checked before pickup.</span></div></section>
  <section className={styles.section}><div className={styles.actions}><button className={`${styles.button} ${tab==='grabs'?'':styles.secondary}`} onClick={()=>setTab('grabs')}>Up for Grabs ({s?.up_for_grabs_count||0})</button><button className={`${styles.button} ${tab==='activity'?'':styles.secondary}`} onClick={()=>setTab('activity')}>My Activity ({pendingActivity})</button><button className={`${styles.button} ${tab==='trades'?'':styles.secondary}`} onClick={()=>setTab('trades')}>Trades ({s?.my_trades.length||0})</button></div></section>

  {tab==='grabs'&&<section className={styles.section}><div className={styles.sectionHead}><h2>Up for Grabs</h2><a className={styles.sectionLink} href="/employee/schedule">Offer or trade my shift</a></div><div className={styles.list}>
   {(s?.visible_offers||[]).filter(o=>o.offered_by_employee_id!==s?.employee_id).map(o=>{const errors=hasError(o.warnings),pending=s?.my_bids.some(b=>b.offer_id===o.id&&b.status==='pending');return <div className={styles.row} key={o.id}><span className={styles.notificationIcon}>{errors?<AlertTriangle size={18}/>:<ShieldCheck size={18}/>}</span><span className={styles.rowMain}><span className={styles.notificationMeta}><span>{o.offer_type==='partial'?'Partial shift':'Coworker shift'}</span><span>{o.offered_by_name}</span></span><b>{o.role_name} · {fmt(o.offered_starts_at)}–{end(o.offered_ends_at)}</b>{o.comment&&<small>{o.comment}</small>}<Eligibility warnings={o.warnings}/></span>{pending?<span className={styles.pill}>Pending</span>:<button className={styles.button} disabled={busy||errors} onClick={()=>bid(o)}>{errors?'Not eligible':'Bid'}</button>}</div>})}
   {(s?.open_shifts||[]).map(x=>{const errors=hasError(x.warnings),pending=s?.my_claims.some(c=>c.shift_id===x.id&&c.status==='pending');return <div className={styles.row} key={x.id}><span className={styles.notificationIcon}>{errors?<AlertTriangle size={18}/>:<CheckCircle2 size={18}/>}</span><span className={styles.rowMain}><span className={styles.notificationMeta}><span>Open shift</span><span>{errors?'Eligibility issue':'Eligible to request'}</span></span><b>{x.role_name} · {fmt(x.starts_at)}–{end(x.ends_at)}</b><Eligibility warnings={x.warnings}/></span>{pending?<span className={styles.pill}>Pending</span>:<button className={styles.button} disabled={busy||errors} onClick={()=>claim(x)}>{errors?'Not eligible':'Request'}</button>}</div>})}
   {!((s?.visible_offers||[]).some(o=>o.offered_by_employee_id!==s?.employee_id)||(s?.open_shifts.length||0))&&<div className={styles.empty}>No eligible shifts are up for grabs right now.</div>}
  </div></section>}

  {tab==='activity'&&<section className={styles.section}><div className={styles.sectionHead}><h2>My Shift Pool Activity</h2><span>Only your requests and offers</span></div><div className={styles.list}>
   {(s?.my_offers||[]).map(o=><div className={styles.row} key={`offer-${o.id}`}><Repeat2 size={18}/><span className={styles.rowMain}><span className={styles.notificationMeta}><span>My offered shift</span><span>{pretty(o.status)}</span></span><b>{o.role_name} · {fmt(o.offered_starts_at)}–{end(o.offered_ends_at)}</b><small>{o.pending_bid_count} pending coworker bid{o.pending_bid_count===1?'':'s'}{o.comment?` · ${o.comment}`:''}</small></span>{o.status==='open'&&<button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>withdrawOffer(o)}>Take Back</button>}</div>)}
   {(s?.my_bids||[]).map(b=><div className={styles.row} key={`bid-${b.id}`}><Clock3 size={18}/><span className={styles.rowMain}><span className={styles.notificationMeta}><span>My bid</span><span>{pretty(b.status)}</span></span><b>{b.role_name} · {fmt(b.offered_starts_at)}–{end(b.offered_ends_at)}</b><small>{b.status==='pending'?'Waiting for manager review.':'This bid has been resolved.'}</small></span>{b.status==='pending'&&<button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>withdrawBid(b)}>Withdraw</button>}</div>)}
   {(s?.my_claims||[]).map(c=><div className={styles.row} key={`claim-${c.id}`}><CalendarDays size={18}/><span className={styles.rowMain}><span className={styles.notificationMeta}><span>Open-shift request</span><span>{pretty(c.status)}</span></span><b>{c.role_name} · {fmt(c.starts_at)}–{end(c.ends_at)}</b><small>{c.status==='pending'?'Waiting for manager review.':'This request has been resolved.'}</small></span></div>)}
   {!((s?.my_offers.length||0)+(s?.my_bids.length||0)+(s?.my_claims.length||0))&&<div className={styles.empty}>You do not have any Shift Pool activity yet.</div>}
  </div></section>}

  {tab==='trades'&&<section className={styles.section}><div className={styles.sectionHead}><h2>My Trades</h2><a className={styles.sectionLink} href="/employee/schedule">Start a trade</a></div><div className={styles.list}>{(s?.my_trades||[]).map(t=><div className={styles.row} key={t.id}><Repeat2 size={18}/><span className={styles.rowMain}><span className={styles.notificationMeta}><span>{pretty(t.status)}</span><span>{t.requested_by_employee_id===s?.employee_id?'You requested':'Requested by coworker'}</span></span><b>{t.requested_by_name} ↔ {t.target_employee_name}</b><small>{t.source_role_name} · {fmt(t.source_starts_at)}{t.target_starts_at?` ↔ ${t.target_role_name} · ${fmt(t.target_starts_at)}`:''}</small>{t.reason&&<small>{t.reason}</small>}</span></div>)}{!s?.my_trades.length&&<div className={styles.empty}>No shift trades yet. Eligible reciprocal trades can be started from My Schedule.</div>}</div></section>}

  <nav className={styles.tabs} aria-label="Staff navigation"><a className={styles.tab} href="/employee"><Home size={19}/>Home</a><a className={`${styles.tab} ${styles.tabActive}`} href="/employee/schedule"><CalendarDays size={19}/>Schedule</a><a className={styles.tab} href="/employee/requests"><Clock3 size={19}/>Requests</a><a className={styles.tab} href="/employee/team"><MessageSquare size={19}/>Team</a><a className={styles.tab} href="/account"><UserRound size={19}/>More</a></nav>
 </main>
}

function Eligibility({warnings}:{warnings:Warning[]}){if(!warnings?.length)return <small>Eligibility check passed.</small>;return <span>{warnings.map((w,i)=><small key={`${w.code}-${i}`} className={w.severity==='error'?styles.criticalText:''}>{w.severity==='warning'?'Heads up: ':''}{w.message}</small>)}</span>}
