'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from '../ops-tools.module.css';

type Job = { id: string; title: string; description: string; employment_type: string; min_hourly_rate: number | null; max_hourly_rate: number | null; role_name: string | null; location_name: string; published_at: string | null; closes_at: string | null };
type Availability = Record<string, string>;

const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const pretty = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const money = (value: number) => value.toLocaleString([], { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export default function PublicJobsPage() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', workExperience: '', whyInterested: '', authorizedToWork: '', consent: false, companyWebsite: '' });
  const [availability, setAvailability] = useState<Availability>(() => Object.fromEntries(days.map((day) => [day, ''])));
  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) || null, [jobs, selectedJobId]);

  useEffect(() => { void load(); }, []);

  async function load() {
    setBusy(true);
    const { data, error } = await supabase.rpc('public_job_postings', {});
    if (error) setMessage(error.message);
    else {
      const nextJobs = (data ?? []) as Job[];
      setJobs(nextJobs);
      if (!selectedJobId && nextJobs.length) setSelectedJobId(nextJobs[0].id);
    }
    setBusy(false);
    setReady(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedJob || busy) return;
    if (!form.consent) { setMessage('Please confirm the application consent before submitting.'); return; }
    setBusy(true);
    setMessage('');
    const cleanAvailability = Object.fromEntries(Object.entries(availability).filter(([, value]) => value.trim()).map(([key, value]) => [key, value.trim()]));
    const { data, error } = await supabase.rpc('submit_job_application', {
      p_job_posting_id: selectedJob.id,
      p_full_name: form.fullName.trim(),
      p_email: form.email.trim(),
      p_phone: form.phone.trim() || null,
      p_availability: cleanAvailability,
      p_work_experience: form.workExperience.trim() || null,
      p_why_interested: form.whyInterested.trim() || null,
      p_authorized_to_work: form.authorizedToWork === '' ? null : form.authorizedToWork === 'yes',
      p_consent: form.consent,
      p_company_website: form.companyWebsite,
    });
    if (error) setMessage(error.message);
    else if ((data as any)?.ok) {
      setMessage('Application received. Thank you for your interest in El Molino.');
      setForm({ fullName: '', email: '', phone: '', workExperience: '', whyInterested: '', authorizedToWork: '', consent: false, companyWebsite: '' });
      setAvailability(Object.fromEntries(days.map((day) => [day, ''])));
    } else setMessage('The application could not be submitted.');
    setBusy(false);
  }

  if (!ready) return <div className="full-loader"><span>Loading open positions…</span></div>;

  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <div><h1>Work at El Molino</h1><p>View current openings and apply directly to the restaurant.</p></div>
        <Link className={styles.back} href="/">El Molino Ops</Link>
      </div>
      {message && <div className={message.toLowerCase().includes('received') ? styles.notice : styles.error}>{message}</div>}

      <section className={styles.section}>
        <h2>Open positions</h2>
        <div className={styles.list}>
          {jobs.map((job) => <button type="button" key={job.id} className={styles.entry} onClick={() => setSelectedJobId(job.id)} style={{ textAlign: 'left', width: '100%' }}>
            <div className={styles.entryHead}><div><h3>{job.title}</h3><small>{job.location_name} · {pretty(job.employment_type)}{job.role_name ? ` · ${job.role_name}` : ''}</small></div><span className={styles.pill}>{selectedJobId === job.id ? 'SELECTED' : 'OPEN'}</span></div>
            <p style={{ whiteSpace: 'pre-wrap' }}>{job.description}</p>
            {(job.min_hourly_rate != null || job.max_hourly_rate != null) && <small>Posted rate: {job.min_hourly_rate != null ? money(Number(job.min_hourly_rate)) : '—'}{job.max_hourly_rate != null ? ` – ${money(Number(job.max_hourly_rate))}` : ''} / hr</small>}
            {job.closes_at && <small style={{ display: 'block' }}>Applications close {new Date(job.closes_at).toLocaleString()}.</small>}
          </button>)}
          {!jobs.length && <div className={styles.card}><b>No positions are currently posted.</b><p>Check back again soon.</p></div>}
        </div>
      </section>

      {selectedJob && <section className={styles.section}>
        <div className={styles.card}>
          <h2>Apply for {selectedJob.title}</h2>
          <p>Do not submit Social Security numbers, banking information, or other payroll credentials in this application.</p>
          <form onSubmit={submit}>
            <div className={styles.formGrid}>
              <label className={styles.field}><span>Full name</span><input required maxLength={160} autoComplete="name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
              <label className={styles.field}><span>Email</span><input required type="email" maxLength={320} autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <label className={styles.field}><span>Phone · optional</span><input maxLength={80} autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
              <label className={styles.field}><span>Authorized to work in the United States?</span><select value={form.authorizedToWork} onChange={(event) => setForm({ ...form, authorizedToWork: event.target.value })}><option value="">Prefer not to answer</option><option value="yes">Yes</option><option value="no">No</option></select></label>
              <label className={styles.field}><span>Relevant work experience</span><textarea rows={5} maxLength={20000} value={form.workExperience} onChange={(event) => setForm({ ...form, workExperience: event.target.value })} /></label>
              <label className={styles.field}><span>Why are you interested in El Molino?</span><textarea rows={4} maxLength={10000} value={form.whyInterested} onChange={(event) => setForm({ ...form, whyInterested: event.target.value })} /></label>
            </div>
            <h3>Availability</h3>
            <div className={styles.formGrid}>{days.map((day) => <label className={styles.field} key={day}><span>{pretty(day)}</span><input maxLength={160} placeholder="Example: open after 4 PM" value={availability[day]} onChange={(event) => setAvailability({ ...availability, [day]: event.target.value })} /></label>)}</div>
            <label style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }} aria-hidden="true"><span>Company website</span><input tabIndex={-1} autoComplete="off" value={form.companyWebsite} onChange={(event) => setForm({ ...form, companyWebsite: event.target.value })} /></label>
            <label className={styles.detail}><input type="checkbox" checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })} /><span>I confirm this information is accurate and consent to El Molino using it to evaluate my application and contact me about this position.</span></label>
            <div className={styles.actions}><button className={styles.button} disabled={busy || !form.fullName.trim() || !form.email.trim() || !form.consent}>Submit Application</button></div>
          </form>
        </div>
      </section>}
    </main>
  );
}
