'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from '../ops-tools.module.css';
import { addDateDays } from '@/lib/scheduling-engine';
import { businessDateInZone } from '@/lib/intermediate-hardening';

type Profile = { app_role: 'admin' | 'manager' | 'employee'; location_id: string | null };
type Distribution = { run_id: string; pool_name: string; starts_on: string; ends_on: string; eligible_hours: number; weight: number; amount: number };
type Report = { employee_id: string; starts_on: string; ends_on: string; total: number; distributions: Distribution[] };
const money = (value: number | null | undefined) => Number(value || 0).toLocaleString([], { style: 'currency', currency: 'USD' });

export default function MyTipsPage() {
  const today = businessDateInZone();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [startsOn, setStartsOn] = useState(addDateDays(today, -30));
  const [endsOn, setEndsOn] = useState(today);
  const [report, setReport] = useState<Report | null>(null);
  const canManage = profile?.app_role === 'admin' || profile?.app_role === 'manager';

  useEffect(() => { void init(); }, []);

  async function init() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { location.href = '/'; return; }
    const result = await supabase.from('profiles').select('app_role,location_id').eq('id', userData.user.id).single();
    if (result.error || !result.data?.location_id) {
      setMessage('Could not load tip access.');
      setReady(true);
      return;
    }
    setProfile(result.data as Profile);
    await load(addDateDays(today, -30), today);
    setReady(true);
  }

  async function load(from = startsOn, to = endsOn) {
    if (to < from) { setMessage('End date must be on or after start date.'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('my_tip_report', { p_starts_on: from, p_ends_on: to });
    if (error) { setReport(null); setMessage(error.message); }
    else { setReport(data as Report); setMessage(''); }
    setBusy(false);
  }

  if (!ready) return <div className="full-loader"><span>Opening My Tips…</span></div>;

  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <div><h1>My Tips</h1><p>Finalized tip-pool distributions visible to your employee account.</p></div>
        <div className={styles.actions}>
          {canManage && <Link className={`${styles.button} ${styles.secondary}`} href="/tips/manage">Tip Management</Link>}
          <Link className={styles.back} href="/">Back to Ops</Link>
        </div>
      </div>
      {message && <div className={message.toLowerCase().includes('could not') || message.toLowerCase().includes('disabled') || message.toLowerCase().includes('not linked') ? styles.error : styles.notice}>{message}</div>}
      <section className={styles.section}>
        <div className={styles.card}>
          <div className={styles.formGrid}>
            <label className={styles.field}><span>From</span><input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} /></label>
            <label className={styles.field}><span>Through</span><input type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} /></label>
          </div>
          <div className={styles.actions}><button className={styles.button} disabled={busy} onClick={() => load()}>Refresh Tips</button></div>
        </div>
      </section>
      {report && <>
        <section className={styles.section}><div className={styles.card}><div className={styles.grid}><Metric label="Finalized tips" value={money(report.total)} /><Metric label="Distributions" value={String(report.distributions.length)} /><Metric label="Range" value={`${report.starts_on} – ${report.ends_on}`} /></div></div></section>
        <section className={styles.section}><h2>Finalized distributions</h2><div className={styles.list}>{report.distributions.map((item) => <div className={styles.entry} key={`${item.run_id}-${item.pool_name}`}><div className={styles.entryHead}><div><h3>{item.pool_name}</h3><small>{item.starts_on} – {item.ends_on} · {Number(item.eligible_hours).toFixed(2)} eligible hrs · weight {Number(item.weight).toFixed(2)}×</small></div><strong>{money(item.amount)}</strong></div></div>)}{!report.distributions.length && <div className={styles.card}><b>No finalized tip distributions in this range.</b></div>}</div></section>
      </>}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div>; }
