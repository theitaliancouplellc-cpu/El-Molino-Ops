'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from '../ops-tools.module.css';

type Profile = { app_role: 'admin' | 'manager' | 'employee'; location_id: string | null };
type Role = { id: string; name: string; department: string | null };
type Job = { id: string; role_id: string | null; title: string; description: string; employment_type: string; min_hourly_rate: number | null; max_hourly_rate: number | null; status: 'draft' | 'published' | 'closed'; published_at: string | null; closes_at: string | null; created_at: string };
type Applicant = { id: string; job_posting_id: string; full_name: string; email: string; phone: string | null; availability: Record<string,string>; work_experience: string | null; why_interested: string | null; authorized_to_work: boolean | null; status: 'applied'|'screening'|'interview'|'offer'|'hired'|'rejected'|'withdrawn'; source: string; employee_id: string | null; hired_at: string | null; created_at: string };
type History = { id: number; applicant_id: string; from_status: string | null; to_status: string; changed_by: string | null; note: string | null; created_at: string };
type Note = { id: string; applicant_id: string; author_user_id: string; body: string; created_at: string };
type Interview = { id: string; applicant_id: string; starts_at: string; ends_at: string; interview_type: string; status: string; interviewer_user_id: string | null; location_note: string | null; outcome_note: string | null };
type Offer = { id: string; applicant_id: string; hourly_rate: number | null; employment_type: string | null; proposed_start_date: string | null; note: string | null; status: 'draft'|'offered'|'accepted'|'declined'|'withdrawn'; offered_at: string | null; decided_at: string | null };

const stages: Applicant['status'][] = ['applied','screening','interview','offer','hired','rejected','withdrawn'];
const pretty = (value: string) => value.replaceAll('_',' ').replace(/\b\w/g,(letter)=>letter.toUpperCase());
const fmt = (value: string | null) => value ? new Date(value).toLocaleString([], { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }) : '—';
const money = (value: number | null) => value == null ? '—' : Number(value).toLocaleString([], { style:'currency', currency:'USD' });

export default function HiringPage() {
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [profile,setProfile]=useState<Profile|null>(null);
  const [roles,setRoles]=useState<Role[]>([]);
  const [jobs,setJobs]=useState<Job[]>([]);
  const [applicants,setApplicants]=useState<Applicant[]>([]);
  const [history,setHistory]=useState<History[]>([]);
  const [notes,setNotes]=useState<Note[]>([]);
  const [interviews,setInterviews]=useState<Interview[]>([]);
  const [offers,setOffers]=useState<Offer[]>([]);
  const [selectedApplicantId,setSelectedApplicantId]=useState('');
  const [stageFilter,setStageFilter]=useState('active');
  const [jobForm,setJobForm]=useState({ id:'',role_id:'',title:'',description:'',employment_type:'either',min_rate:'',max_rate:'',status:'draft' as Job['status'],closes_at:'' });
  const [noteBody,setNoteBody]=useState('');
  const [interviewForm,setInterviewForm]=useState({ starts_at:'',ends_at:'',interview_type:'in_person',location_note:'' });
  const [offerForm,setOfferForm]=useState({ hourly_rate:'',employment_type:'part_time',proposed_start_date:'',note:'',status:'draft' as Offer['status'] });
  const canManage=profile?.app_role==='admin'||profile?.app_role==='manager';
  const selectedApplicant=applicants.find((item)=>item.id===selectedApplicantId)||null;
  const selectedJob=selectedApplicant ? jobs.find((job)=>job.id===selectedApplicant.job_posting_id)||null : null;
  const selectedOffer=selectedApplicant ? offers.find((offer)=>offer.applicant_id===selectedApplicant.id)||null : null;
  const filteredApplicants=useMemo(()=>applicants.filter((item)=> stageFilter==='all' ? true : stageFilter==='active' ? !['hired','rejected','withdrawn'].includes(item.status) : item.status===stageFilter),[applicants,stageFilter]);

  useEffect(()=>{void init();},[]);

  async function init(){
    const {data:userData}=await supabase.auth.getUser();
    if(!userData.user){location.href='/';return;}
    const result=await supabase.from('profiles').select('app_role,location_id').eq('id',userData.user.id).single();
    if(result.error||!result.data?.location_id){setMessage('Could not load Hiring.');setReady(true);return;}
    const next=result.data as Profile;setProfile(next);
    if(next.app_role==='admin'||next.app_role==='manager') await load(next);
    setReady(true);
  }

  async function load(nextProfile=profile){
    if(!nextProfile?.location_id)return;setBusy(true);
    try{
      const [roleResult,jobResult,appResult,historyResult,noteResult,interviewResult,offerResult]=await Promise.all([
        supabase.from('employee_roles').select('id,name,department').eq('location_id',nextProfile.location_id).order('name'),
        supabase.from('hiring_job_postings').select('id,role_id,title,description,employment_type,min_hourly_rate,max_hourly_rate,status,published_at,closes_at,created_at').eq('location_id',nextProfile.location_id).order('created_at',{ascending:false}),
        supabase.from('hiring_applicants').select('id,job_posting_id,full_name,email,phone,availability,work_experience,why_interested,authorized_to_work,status,source,employee_id,hired_at,created_at').eq('location_id',nextProfile.location_id).order('created_at',{ascending:false}),
        supabase.from('hiring_stage_history').select('id,applicant_id,from_status,to_status,changed_by,note,created_at').eq('location_id',nextProfile.location_id).order('created_at',{ascending:false}),
        supabase.from('hiring_manager_notes').select('id,applicant_id,author_user_id,body,created_at').eq('location_id',nextProfile.location_id).order('created_at',{ascending:false}),
        supabase.from('hiring_interviews').select('id,applicant_id,starts_at,ends_at,interview_type,status,interviewer_user_id,location_note,outcome_note').eq('location_id',nextProfile.location_id).order('starts_at',{ascending:true}),
        supabase.from('hiring_offers').select('id,applicant_id,hourly_rate,employment_type,proposed_start_date,note,status,offered_at,decided_at').eq('location_id',nextProfile.location_id),
      ]);
      for(const result of [roleResult,jobResult,appResult,historyResult,noteResult,interviewResult,offerResult]) if(result.error) throw result.error;
      setRoles((roleResult.data??[]) as Role[]);setJobs((jobResult.data??[]) as Job[]);setApplicants((appResult.data??[]) as Applicant[]);setHistory((historyResult.data??[]) as History[]);setNotes((noteResult.data??[]) as Note[]);setInterviews((interviewResult.data??[]) as Interview[]);setOffers((offerResult.data??[]) as Offer[]);
      const nextApplicants=(appResult.data??[]) as Applicant[];
      if(!selectedApplicantId&&nextApplicants.length)setSelectedApplicantId(nextApplicants[0].id);
    }catch(error:any){setMessage(error?.message||'Could not load Hiring.');}finally{setBusy(false);}
  }

  async function saveJob(event:FormEvent){
    event.preventDefault();if(!profile?.location_id||!canManage||busy||!jobForm.title.trim()||!jobForm.description.trim())return;
    const row={location_id:profile.location_id,role_id:jobForm.role_id||null,title:jobForm.title.trim(),description:jobForm.description.trim(),employment_type:jobForm.employment_type,min_hourly_rate:jobForm.min_rate===''?null:Number(jobForm.min_rate),max_hourly_rate:jobForm.max_rate===''?null:Number(jobForm.max_rate),status:jobForm.status,closes_at:jobForm.closes_at?new Date(jobForm.closes_at).toISOString():null};
    setBusy(true);const result=jobForm.id?await supabase.from('hiring_job_postings').update(row).eq('id',jobForm.id):await supabase.from('hiring_job_postings').insert(row);
    setMessage(result.error?result.error.message:jobForm.id?'Job posting updated.':'Job posting created.');if(!result.error)setJobForm({id:'',role_id:'',title:'',description:'',employment_type:'either',min_rate:'',max_rate:'',status:'draft',closes_at:''});await load();setBusy(false);
  }

  async function quickJobStatus(job:Job,status:Job['status']){setBusy(true);const {error}=await supabase.from('hiring_job_postings').update({status}).eq('id',job.id);setMessage(error?error.message:`Job ${status}.`);await load();setBusy(false);}
  async function moveStage(status:Applicant['status']){if(!selectedApplicant||busy||status==='hired')return;const note=window.prompt(`Optional note for ${pretty(status)}:`)?.trim()||null;setBusy(true);const {error}=await supabase.rpc('change_hiring_applicant_stage',{p_applicant_id:selectedApplicant.id,p_status:status,p_note:note});setMessage(error?error.message:`Candidate moved to ${pretty(status)}.`);await load();setBusy(false);}
  async function addNote(event:FormEvent){event.preventDefault();if(!selectedApplicant||!noteBody.trim()||busy)return;setBusy(true);const {error}=await supabase.rpc('add_hiring_manager_note',{p_applicant_id:selectedApplicant.id,p_body:noteBody.trim()});setMessage(error?error.message:'Manager note added.');if(!error)setNoteBody('');await load();setBusy(false);}
  async function scheduleInterview(event:FormEvent){event.preventDefault();if(!selectedApplicant||!interviewForm.starts_at||!interviewForm.ends_at||busy)return;setBusy(true);const {error}=await supabase.rpc('schedule_hiring_interview',{p_applicant_id:selectedApplicant.id,p_starts_at:new Date(interviewForm.starts_at).toISOString(),p_ends_at:new Date(interviewForm.ends_at).toISOString(),p_interview_type:interviewForm.interview_type,p_interviewer_user_id:null,p_location_note:interviewForm.location_note.trim()||null});setMessage(error?error.message:'Interview scheduled.');if(!error)setInterviewForm({starts_at:'',ends_at:'',interview_type:'in_person',location_note:''});await load();setBusy(false);}
  async function saveOffer(event:FormEvent){event.preventDefault();if(!selectedApplicant||busy)return;setBusy(true);const {error}=await supabase.rpc('upsert_hiring_offer',{p_applicant_id:selectedApplicant.id,p_hourly_rate:offerForm.hourly_rate===''?null:Number(offerForm.hourly_rate),p_employment_type:offerForm.employment_type||null,p_proposed_start_date:offerForm.proposed_start_date||null,p_note:offerForm.note.trim()||null,p_status:offerForm.status});setMessage(error?error.message:`Offer saved as ${pretty(offerForm.status)}.`);await load();setBusy(false);}
  async function hire(){if(!selectedApplicant||busy||!window.confirm(`Hire ${selectedApplicant.full_name} and create an active employee record?`))return;setBusy(true);const {data,error}=await supabase.rpc('hire_applicant',{p_applicant_id:selectedApplicant.id});setMessage(error?error.message:`Employee created${(data as any)?.already_hired?' previously':''}. Auth/login can be linked separately.`);await load();setBusy(false);}

  function editJob(job:Job){setJobForm({id:job.id,role_id:job.role_id||'',title:job.title,description:job.description,employment_type:job.employment_type,min_rate:job.min_hourly_rate==null?'':String(job.min_hourly_rate),max_rate:job.max_hourly_rate==null?'':String(job.max_hourly_rate),status:job.status,closes_at:job.closes_at?new Date(job.closes_at).toISOString().slice(0,16):''});window.scrollTo({top:0,behavior:'smooth'});}
  function selectApplicant(id:string){setSelectedApplicantId(id);const offer=offers.find((item)=>item.applicant_id===id);setOfferForm(offer?{hourly_rate:offer.hourly_rate==null?'':String(offer.hourly_rate),employment_type:offer.employment_type||'part_time',proposed_start_date:offer.proposed_start_date||'',note:offer.note||'',status:offer.status}:{hourly_rate:'',employment_type:'part_time',proposed_start_date:'',note:'',status:'draft'});}
  const roleName=(id:string|null)=>id?roles.find((role)=>role.id===id)?.name||'Role':'Any role';
  const jobTitle=(id:string)=>jobs.find((job)=>job.id===id)?.title||'Job';

  if(!ready)return <div className="full-loader"><span>Opening Hiring…</span></div>;
  return <main className={styles.page}>
    <div className={styles.top}><div><h1>Hiring</h1><p>Job postings, applicants, candidate stages, interviews, offers and employee handoff.</p></div><div className={styles.actions}><Link className={`${styles.button} ${styles.secondary}`} href="/jobs" target="_blank">Public Job Board</Link><Link className={styles.back} href="/">Back to Ops</Link></div></div>
    {message&&<div className={message.toLowerCase().includes('could not')?styles.error:styles.notice}>{message}</div>}
    {!canManage?<div className={styles.error}>Manager access is required.</div>:<>
      <section className={styles.section}><div className={styles.card}><h2>{jobForm.id?'Edit job posting':'Create job posting'}</h2><form onSubmit={saveJob}><div className={styles.formGrid}><label className={styles.field}><span>Title</span><input maxLength={160} value={jobForm.title} onChange={(event)=>setJobForm({...jobForm,title:event.target.value})}/></label><label className={styles.field}><span>Role</span><select value={jobForm.role_id} onChange={(event)=>setJobForm({...jobForm,role_id:event.target.value})}><option value="">No linked role</option>{roles.map((role)=><option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label className={styles.field}><span>Employment type</span><select value={jobForm.employment_type} onChange={(event)=>setJobForm({...jobForm,employment_type:event.target.value})}><option value="either">Full or part time</option><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="seasonal">Seasonal</option></select></label><label className={styles.field}><span>Minimum hourly rate</span><input type="number" min="0" step="0.01" value={jobForm.min_rate} onChange={(event)=>setJobForm({...jobForm,min_rate:event.target.value})}/></label><label className={styles.field}><span>Maximum hourly rate</span><input type="number" min="0" step="0.01" value={jobForm.max_rate} onChange={(event)=>setJobForm({...jobForm,max_rate:event.target.value})}/></label><label className={styles.field}><span>Status</span><select value={jobForm.status} onChange={(event)=>setJobForm({...jobForm,status:event.target.value as Job['status']})}><option value="draft">Draft</option><option value="published">Published</option><option value="closed">Closed</option></select></label><label className={styles.field}><span>Close applications at · optional</span><input type="datetime-local" value={jobForm.closes_at} onChange={(event)=>setJobForm({...jobForm,closes_at:event.target.value})}/></label><label className={styles.field}><span>Description</span><textarea rows={6} maxLength={20000} value={jobForm.description} onChange={(event)=>setJobForm({...jobForm,description:event.target.value})}/></label></div><div className={styles.actions}><button className={styles.button} disabled={busy}>Save Job</button>{jobForm.id&&<button type="button" className={`${styles.button} ${styles.secondary}`} onClick={()=>setJobForm({id:'',role_id:'',title:'',description:'',employment_type:'either',min_rate:'',max_rate:'',status:'draft',closes_at:''})}>Cancel Edit</button>}</div></form></div></section>

      <section className={styles.section}><h2>Job postings</h2><div className={styles.list}>{jobs.map((job)=><div className={styles.entry} key={job.id}><div className={styles.entryHead}><div><h3>{job.title}</h3><small>{roleName(job.role_id)} · {pretty(job.employment_type)} · {money(job.min_hourly_rate)}{job.max_hourly_rate!=null?` – ${money(job.max_hourly_rate)}`:''}</small></div><span className={styles.pill}>{job.status.toUpperCase()}</span></div><div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} onClick={()=>editJob(job)}>Edit</button>{job.status!=='published'&&<button className={styles.button} disabled={busy} onClick={()=>quickJobStatus(job,'published')}>Publish</button>}{job.status!=='closed'&&<button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>quickJobStatus(job,'closed')}>Close</button>}</div></div>)}{!jobs.length&&<div className={styles.card}><b>No job postings yet.</b></div>}</div></section>

      <section className={styles.section}><div className={styles.entryHead}><div><h2>Applicants</h2><small>{filteredApplicants.length} shown</small></div><select value={stageFilter} onChange={(event)=>setStageFilter(event.target.value)}><option value="active">Active pipeline</option><option value="all">All</option>{stages.map((stage)=><option key={stage} value={stage}>{pretty(stage)}</option>)}</select></div><div className={styles.list}>{filteredApplicants.map((applicant)=><button type="button" className={styles.entry} style={{textAlign:'left',width:'100%'}} key={applicant.id} onClick={()=>selectApplicant(applicant.id)}><div className={styles.entryHead}><div><h3>{applicant.full_name}</h3><small>{jobTitle(applicant.job_posting_id)} · applied {fmt(applicant.created_at)}</small></div><span className={styles.pill}>{applicant.status.toUpperCase()}</span></div></button>)}{!filteredApplicants.length&&<div className={styles.card}><b>No applicants in this view.</b></div>}</div></section>

      {selectedApplicant&&<section className={styles.section}><div className={styles.card}><div className={styles.entryHead}><div><h2>{selectedApplicant.full_name}</h2><small>{selectedJob?.title||'Job'} · {selectedApplicant.email}{selectedApplicant.phone?` · ${selectedApplicant.phone}`:''}</small></div><span className={styles.pill}>{selectedApplicant.status.toUpperCase()}</span></div><div className={styles.details}><div className={styles.detail}><b>Work authorized</b><span>{selectedApplicant.authorized_to_work==null?'Not answered':selectedApplicant.authorized_to_work?'Yes':'No'}</span></div><div className={styles.detail}><b>Availability</b><span>{Object.entries(selectedApplicant.availability||{}).map(([day,value])=>`${pretty(day)}: ${value}`).join(' · ')||'Not provided'}</span></div><div className={styles.detail}><b>Experience</b><span>{selectedApplicant.work_experience||'Not provided'}</span></div><div className={styles.detail}><b>Why El Molino</b><span>{selectedApplicant.why_interested||'Not provided'}</span></div></div>
        {selectedApplicant.status!=='hired'&&<><h3>Move candidate</h3><div className={styles.actions}>{(['applied','screening','interview','offer','rejected','withdrawn'] as Applicant['status'][]).map((stage)=><button key={stage} className={`${styles.button} ${selectedApplicant.status===stage?'':styles.secondary}`} disabled={busy||selectedApplicant.status===stage} onClick={()=>moveStage(stage)}>{pretty(stage)}</button>)}</div></>}
        {selectedApplicant.status==='hired'&&<div className={styles.notice}>Hired {fmt(selectedApplicant.hired_at)} · employee record {selectedApplicant.employee_id}</div>}
      </div></section>}

      {selectedApplicant&&<section className={styles.section}><div className={styles.card}><h2>Manager notes</h2><form onSubmit={addNote}><label className={styles.field}><span>Private hiring note</span><textarea rows={3} maxLength={5000} value={noteBody} onChange={(event)=>setNoteBody(event.target.value)}/></label><div className={styles.actions}><button className={styles.button} disabled={busy||!noteBody.trim()}>Add Note</button></div></form><div className={styles.details}>{notes.filter((note)=>note.applicant_id===selectedApplicant.id).map((note)=><div className={styles.detail} key={note.id}><b>{fmt(note.created_at)}</b><span>{note.body}</span></div>)}</div></div></section>}

      {selectedApplicant&&selectedApplicant.status!=='hired'&&<section className={styles.section}><div className={styles.card}><h2>Schedule interview</h2><form onSubmit={scheduleInterview}><div className={styles.formGrid}><label className={styles.field}><span>Start</span><input type="datetime-local" value={interviewForm.starts_at} onChange={(event)=>setInterviewForm({...interviewForm,starts_at:event.target.value})}/></label><label className={styles.field}><span>End</span><input type="datetime-local" value={interviewForm.ends_at} onChange={(event)=>setInterviewForm({...interviewForm,ends_at:event.target.value})}/></label><label className={styles.field}><span>Type</span><select value={interviewForm.interview_type} onChange={(event)=>setInterviewForm({...interviewForm,interview_type:event.target.value})}><option value="in_person">In person</option><option value="phone">Phone</option><option value="video">Video</option></select></label><label className={styles.field}><span>Location / link / instructions</span><input maxLength={2000} value={interviewForm.location_note} onChange={(event)=>setInterviewForm({...interviewForm,location_note:event.target.value})}/></label></div><div className={styles.actions}><button className={styles.button} disabled={busy||!interviewForm.starts_at||!interviewForm.ends_at}>Schedule Interview</button></div></form><div className={styles.details}>{interviews.filter((item)=>item.applicant_id===selectedApplicant.id).map((item)=><div className={styles.detail} key={item.id}><b>{pretty(item.interview_type)} · {item.status}</b><span>{fmt(item.starts_at)} → {fmt(item.ends_at)}{item.location_note?` · ${item.location_note}`:''}</span></div>)}</div></div></section>}

      {selectedApplicant&&selectedApplicant.status!=='hired'&&<section className={styles.section}><div className={styles.card}><h2>Offer & hire handoff</h2><p>An accepted offer can transfer the hourly rate into the employee schedule profile. Hiring does not invent a login account; access can be linked separately.</p><form onSubmit={saveOffer}><div className={styles.formGrid}><label className={styles.field}><span>Hourly rate</span><input type="number" min="0" step="0.01" value={offerForm.hourly_rate} onChange={(event)=>setOfferForm({...offerForm,hourly_rate:event.target.value})}/></label><label className={styles.field}><span>Employment type</span><select value={offerForm.employment_type} onChange={(event)=>setOfferForm({...offerForm,employment_type:event.target.value})}><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="seasonal">Seasonal</option></select></label><label className={styles.field}><span>Proposed start date</span><input type="date" value={offerForm.proposed_start_date} onChange={(event)=>setOfferForm({...offerForm,proposed_start_date:event.target.value})}/></label><label className={styles.field}><span>Offer status</span><select value={offerForm.status} onChange={(event)=>setOfferForm({...offerForm,status:event.target.value as Offer['status']})}><option value="draft">Draft</option><option value="offered">Offered</option><option value="accepted">Accepted</option><option value="declined">Declined</option><option value="withdrawn">Withdrawn</option></select></label><label className={styles.field}><span>Offer note</span><textarea rows={3} maxLength={5000} value={offerForm.note} onChange={(event)=>setOfferForm({...offerForm,note:event.target.value})}/></label></div><div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={busy}>Save Offer</button><button type="button" className={styles.button} disabled={busy||!(selectedOffer?.status==='accepted'||offerForm.status==='accepted')} onClick={hire}>Hire & Create Employee</button></div></form></div></section>}

      {selectedApplicant&&<section className={styles.section}><h2>Candidate history</h2><div className={styles.list}>{history.filter((item)=>item.applicant_id===selectedApplicant.id).map((item)=><div className={styles.entry} key={item.id}><div className={styles.entryHead}><div><h3>{item.from_status?`${pretty(item.from_status)} → `:''}{pretty(item.to_status)}</h3><small>{fmt(item.created_at)}{item.note?` · ${item.note}`:''}</small></div></div></div>)}</div></section>}
    </>}
  </main>;
}
