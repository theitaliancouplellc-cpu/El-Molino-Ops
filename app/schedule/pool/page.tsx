'use client';

import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';
import styles from '../../ops-tools.module.css';

type Profile={app_role:'admin'|'manager'|'employee';location_id:string|null};
type Employee={id:string;full_name:string;user_id:string|null;active:boolean};
type Role={id:string;name:string;department?:string};
type Shift={id:string;employee_id:string|null;role_id:string|null;starts_at:string;ends_at:string;status:string;notes:string|null;source:string|null;schedule_period_id:string|null};
type Offer={id:string;shift_id:string;offered_by_employee_id:string;offer_type:'full'|'partial';offered_starts_at:string;offered_ends_at:string;audience:'role'|'selected';comment:string|null;status:'open'|'assigned'|'withdrawn'|'expired';assigned_to_employee_id:string|null;created_at:string};
type Bid={id:string;offer_id:string;employee_id:string;status:'pending'|'approved'|'denied'|'withdrawn';comment:string|null;created_at:string};
type Claim={id:string;shift_id:string;employee_id:string;status:string;created_at:string};
type ChangeReq={id:string;shift_id:string;target_shift_id:string|null;request_type:string;requested_by_employee_id:string|null;target_employee_id:string|null;reason:string|null;status:string;created_at:string};
type Tab='requests'|'grabs'|'mine'|'trades';
type Warning={code:string;severity:'error'|'warning'|'info';message:string;projected_hours?:number};

const fmt=(iso:string)=>new Date(iso).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});

export default function ShiftPoolPage(){
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [profile,setProfile]=useState<Profile|null>(null),[me,setMe]=useState<Employee|null>(null),[employees,setEmployees]=useState<Employee[]>([]),[roles,setRoles]=useState<Role[]>([]),[shifts,setShifts]=useState<Shift[]>([]),[offers,setOffers]=useState<Offer[]>([]),[bids,setBids]=useState<Bid[]>([]),[claims,setClaims]=useState<Claim[]>([]),[changes,setChanges]=useState<ChangeReq[]>([]),[warnings,setWarnings]=useState<Record<string,Warning[]>>({}),[tab,setTab]=useState<Tab>('grabs');
  const canManage=profile?.app_role==='admin'||profile?.app_role==='manager';

  useEffect(()=>{void load()},[]);
  async function load(){
    setBusy(true);setMessage('');
    const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
    const p=await supabase.from('profiles').select('app_role,location_id').eq('id',u.user.id).single();
    if(p.error||!p.data?.location_id){setMessage('Could not load Shift Pool access.');setReady(true);setBusy(false);return}
    const pr=p.data as Profile;setProfile(pr);const loc=pr.location_id!;
    const [e,r,s,o,b,c,ch]=await Promise.all([
      supabase.from('employees').select('id,full_name,user_id,active').eq('location_id',loc).eq('active',true).is('deleted_at',null).order('full_name'),
      supabase.from('employee_roles').select('id,name,department').eq('location_id',loc).order('name'),
      supabase.from('schedule_shifts').select('id,employee_id,role_id,starts_at,ends_at,status,notes,source,schedule_period_id').eq('location_id',loc).gte('ends_at',new Date().toISOString()).order('starts_at').limit(500),
      supabase.from('shift_pool_offers').select('id,shift_id,offered_by_employee_id,offer_type,offered_starts_at,offered_ends_at,audience,comment,status,assigned_to_employee_id,created_at').eq('location_id',loc).order('created_at',{ascending:false}).limit(250),
      supabase.from('shift_pool_bids').select('id,offer_id,employee_id,status,comment,created_at').eq('location_id',loc).order('created_at',{ascending:false}).limit(500),
      supabase.from('shift_claims').select('id,shift_id,employee_id,status,created_at').eq('location_id',loc).order('created_at',{ascending:false}).limit(250),
      supabase.from('shift_change_requests').select('id,shift_id,target_shift_id,request_type,requested_by_employee_id,target_employee_id,reason,status,created_at').eq('location_id',loc).order('created_at',{ascending:false}).limit(250)
    ]);
    const failed=[e,r,s,o,b,c,ch].find(x=>x.error);if(failed?.error)setMessage('Some Shift Pool data could not be loaded.');
    const es=(e.data??[]) as Employee[];setEmployees(es);setMe(es.find(x=>x.user_id===u.user.id)||null);setRoles((r.data??[]) as Role[]);setShifts((s.data??[]) as Shift[]);setOffers((o.data??[]) as Offer[]);setBids((b.data??[]) as Bid[]);setClaims((c.data??[]) as Claim[]);setChanges((ch.data??[]) as ChangeReq[]);setReady(true);setBusy(false);
  }
  const employeeName=(id:string|null)=>employees.find(x=>x.id===id)?.full_name||(id?'Employee':'Open shift');
  const roleName=(id:string|null)=>roles.find(x=>x.id===id)?.name||(id?'Role':'No role');
  const shiftFor=(id:string)=>shifts.find(x=>x.id===id);
  const openOffers=useMemo(()=>offers.filter(x=>x.status==='open'),[offers]);
  const openShifts=useMemo(()=>shifts.filter(x=>x.status==='open'&&!x.employee_id),[shifts]);
  const pendingBids=useMemo(()=>bids.filter(x=>x.status==='pending'),[bids]);
  const pendingClaims=useMemo(()=>claims.filter(x=>x.status==='pending'),[claims]);
  const pendingTrades=useMemo(()=>changes.filter(x=>x.request_type==='swap'&&x.status==='pending'),[changes]);
  const mineOffers=useMemo(()=>me?offers.filter(x=>x.offered_by_employee_id===me.id):[],[offers,me]);
  const mineBids=useMemo(()=>me?bids.filter(x=>x.employee_id===me.id):[],[bids,me]);

  async function act(fn:()=>Promise<{error:any}>|Promise<any>,ok:string){if(busy)return;setBusy(true);try{const res=await fn();if(res?.error)throw res.error;setMessage(ok);await load()}catch(e:any){setMessage(e?.message||'That Shift Pool action could not be completed.')}finally{setBusy(false)}}
  const bid=(offer:Offer)=>act(()=>supabase.rpc('bid_on_shift_pool_offer',{p_offer_id:offer.id,p_comment:null}),'Bid submitted. You are not responsible for the shift unless it is approved.');
  const withdrawOffer=(offer:Offer)=>act(()=>supabase.rpc('withdraw_my_shift_pool_offer',{p_offer_id:offer.id}),'Shift taken back from the pool.');
  const withdrawBid=(bidRow:Bid)=>act(()=>supabase.rpc('withdraw_my_shift_pool_bid',{p_bid_id:bidRow.id}),'Bid withdrawn.');
  const reviewBid=(bidRow:Bid,decision:'approved'|'denied')=>act(()=>supabase.rpc('review_shift_pool_bid',{p_bid_id:bidRow.id,p_decision:decision}),decision==='approved'?'Bid approved and shift reassigned.':'Bid denied.');
  const claimOpen=(shift:Shift)=>act(()=>supabase.rpc('claim_open_shift',{p_shift_id:shift.id}),'Open-shift request submitted.');
  const reviewClaim=(claim:Claim,decision:'approved'|'denied')=>act(()=>supabase.rpc('review_shift_claim',{p_claim_id:claim.id,p_decision:decision}),decision==='approved'?'Open shift assigned.':'Open-shift bid denied.');
  const reviewTrade=(req:ChangeReq,decision:'approved'|'denied')=>act(()=>supabase.rpc('review_shift_change_request',{p_request_id:req.id,p_decision:decision}),decision==='approved'?'Trade approved.':'Trade denied.');
  async function checkBid(b:Bid){setBusy(true);const {data,error}=await supabase.rpc('shift_pool_candidate_warnings',{p_offer_id:b.offer_id,p_employee_id:b.employee_id});if(error)setMessage(error.message);else setWarnings(x=>({...x,[b.id]:(Array.isArray(data)?data:[]) as Warning[]}));setBusy(false)}

  if(!ready)return <div className="full-loader"><span>Opening Shift Pool…</span></div>;
  return <main className={styles.page}>
    <div className={styles.top}><div><h1>Shift Pool</h1><p>Offer shifts, bid on extra shifts, trade with coworkers, and keep every change manager-controlled.</p></div><Link className={styles.back} href="/schedule">Back to Schedule</Link></div>
    {message&&<div className={styles.notice}>{message}</div>}
    <div className={styles.card}>
      <div className={styles.actions} style={{marginTop:0}}>
        <button className={`${styles.button} ${tab==='requests'?'':styles.secondary}`} onClick={()=>setTab('requests')}>Requests ({pendingBids.length+pendingClaims.length})</button>
        <button className={`${styles.button} ${tab==='grabs'?'':styles.secondary}`} onClick={()=>setTab('grabs')}>Up for Grabs ({openOffers.length+openShifts.length})</button>
        <button className={`${styles.button} ${tab==='mine'?'':styles.secondary}`} onClick={()=>setTab('mine')}>Mine</button>
        <button className={`${styles.button} ${tab==='trades'?'':styles.secondary}`} onClick={()=>setTab('trades')}>Trades ({pendingTrades.length})</button>
      </div>
    </div>

    {tab==='grabs'&&<section className={styles.section}><h2>Up for Grabs</h2><div className={styles.list}>
      {openOffers.map(o=>{const s=shiftFor(o.shift_id),already=me&&bids.some(b=>b.offer_id===o.id&&b.employee_id===me.id&&b.status==='pending');return <div className={styles.entry} key={o.id}><div className={styles.entryHead}><div><h3>{roleName(s?.role_id||null)} · {fmt(o.offered_starts_at)}–{new Date(o.offered_ends_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</h3><small>Offered by {employeeName(o.offered_by_employee_id)}{o.comment?` · ${o.comment}`:''}</small></div><span className={styles.pill}>{o.offer_type==='partial'?'PARTIAL':'FULL SHIFT'}</span></div><div className={styles.actions}>{me&&o.offered_by_employee_id!==me.id&&!already&&<button className={styles.button} disabled={busy} onClick={()=>bid(o)}>Bid on Shift</button>}{already&&<span className={styles.pill}>Bid pending</span>}{me&&o.offered_by_employee_id===me.id&&<button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>withdrawOffer(o)}>Take Back</button>}</div></div>})}
      {openShifts.map(s=>{const mine=me&&claims.some(c=>c.shift_id===s.id&&c.employee_id===me.id&&c.status==='pending');return <div className={styles.entry} key={`open-${s.id}`}><div className={styles.entryHead}><div><h3>Open Shift · {roleName(s.role_id)}</h3><small>{fmt(s.starts_at)}–{new Date(s.ends_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</small></div><span className={styles.pill}>OPEN</span></div>{me&&!mine&&<div className={styles.actions}><button className={styles.button} disabled={busy} onClick={()=>claimOpen(s)}>Request to Pick Up</button></div>}{mine&&<span className={styles.pill}>Request pending</span>}</div>})}
      {!openOffers.length&&!openShifts.length&&<div className={styles.empty}>Nothing is up for grabs right now.</div>}
    </div></section>}

    {tab==='requests'&&<section className={styles.section}><h2>{canManage?'Manager requests':'My pending requests'}</h2><div className={styles.list}>
      {(canManage?pendingBids:pendingBids.filter(x=>x.employee_id===me?.id)).map(b=>{const o=offers.find(x=>x.id===b.offer_id),s=o&&shiftFor(o.shift_id),ws=warnings[b.id]||[];return <div className={styles.entry} key={b.id}><div className={styles.entryHead}><div><h3>{employeeName(b.employee_id)} wants {roleName(s?.role_id||null)}</h3><small>{o?fmt(o.offered_starts_at):'Shift'}{b.comment?` · ${b.comment}`:''}</small></div><span className={styles.pill}>BID</span></div>{ws.length>0&&<div className={styles.details}>{ws.map((w,i)=><div className={styles.detail} key={i}><b>{w.severity}</b><span>{w.message}</span></div>)}</div>}{canManage?<div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>checkBid(b)}>Check Conflicts</button><button className={styles.button} disabled={busy||ws.some(w=>w.severity==='error')} onClick={()=>reviewBid(b,'approved')}>Approve</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>reviewBid(b,'denied')}>Deny</button></div>:<div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>withdrawBid(b)}>Withdraw Bid</button></div>}</div>})}
      {canManage&&pendingClaims.map(c=>{const s=shiftFor(c.shift_id);return <div className={styles.entry} key={c.id}><div className={styles.entryHead}><div><h3>{employeeName(c.employee_id)} wants an open {roleName(s?.role_id||null)} shift</h3><small>{s?fmt(s.starts_at):'Open shift'}</small></div><span className={styles.pill}>OPEN SHIFT BID</span></div><div className={styles.actions}><button className={styles.button} disabled={busy} onClick={()=>reviewClaim(c,'approved')}>Approve</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>reviewClaim(c,'denied')}>Deny</button></div></div>})}
      {!(canManage?pendingBids.length+pendingClaims.length:pendingBids.filter(x=>x.employee_id===me?.id).length)&&<div className={styles.empty}>No pending Shift Pool requests.</div>}
    </div></section>}

    {tab==='mine'&&<section className={styles.section}><h2>My Shift Pool</h2><div className={styles.list}>
      {mineOffers.map(o=><div className={styles.entry} key={o.id}><div className={styles.entryHead}><div><h3>My offered shift · {roleName(shiftFor(o.shift_id)?.role_id||null)}</h3><small>{fmt(o.offered_starts_at)} · {bids.filter(b=>b.offer_id===o.id&&b.status==='pending').length} pending bid(s)</small></div><span className={styles.pill}>{o.status}</span></div>{o.status==='open'&&<div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>withdrawOffer(o)}>Take Back</button></div>}</div>)}
      {mineBids.map(b=>{const o=offers.find(x=>x.id===b.offer_id);return <div className={styles.entry} key={b.id}><div className={styles.entryHead}><div><h3>My bid · {roleName(o?shiftFor(o.shift_id)?.role_id||null:null)}</h3><small>{o?fmt(o.offered_starts_at):'Shift Pool'}</small></div><span className={styles.pill}>{b.status}</span></div>{b.status==='pending'&&<div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>withdrawBid(b)}>Withdraw Bid</button></div>}</div>})}
      {!mineOffers.length&&!mineBids.length&&<div className={styles.empty}>You have no Shift Pool activity yet.</div>}
    </div></section>}

    {tab==='trades'&&<section className={styles.section}><h2>Trade Requests</h2><div className={styles.list}>
      {(canManage?pendingTrades:changes.filter(x=>x.request_type==='swap'&&(x.requested_by_employee_id===me?.id||x.target_employee_id===me?.id))).map(r=><div className={styles.entry} key={r.id}><div className={styles.entryHead}><div><h3>{employeeName(r.requested_by_employee_id)} ↔ {employeeName(r.target_employee_id)}</h3><small>{r.reason||'Direct shift trade'} · {r.status}</small></div><span className={styles.pill}>TRADE</span></div>{canManage&&r.status==='pending'&&<div className={styles.actions}><button className={styles.button} disabled={busy} onClick={()=>reviewTrade(r,'approved')}>Approve Trade</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>reviewTrade(r,'denied')}>Deny</button></div>}</div>)}
      {!(canManage?pendingTrades.length:changes.filter(x=>x.request_type==='swap'&&(x.requested_by_employee_id===me?.id||x.target_employee_id===me?.id)).length)&&<div className={styles.empty}>No trade requests.</div>}
    </div></section>}
  </main>
}
