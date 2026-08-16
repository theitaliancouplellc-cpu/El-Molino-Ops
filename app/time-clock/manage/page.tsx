'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from '../../ops-tools.module.css';
import { addDateDays, zonedLocalToIso } from '@/lib/scheduling-engine';
import { businessDateInZone } from '@/lib/intermediate-hardening';

type Profile = { app_role: 'admin' | 'manager' | 'employee'; location_id: string | null };
type Employee = { id: string; full_name: string };
type PayPeriod = { id: string; starts_on: string; ends_on: string; status: 'open' | 'closed'; closed_at: string | null };
type Punch = {
  id: string;
  employee_id: string;
  shift_id: string | null;
  clock_in: string;
  clock_out: string | null;
  source: string;
  note: string | null;
  manager_approved_at: string | null;
  employee_approval_status: 'pending' | 'approved' | 'disputed';
  employee_dispute_note: string | null;
};
type BreakRow = { id: string; punch_id: string; started_at: string; ended_at: string | null; paid: boolean; deleted_at: string | null };
type Working = { punch_id: string; employee_id: string; employee_name: string; shift_id: string | null; clock_in: string; source: string; on_break: boolean; break_started_at: string | null };
type WageRow = { employee_id: string; full_name: string; worked_hours: number; hourly_rate: number; base_wages: number; overtime_hours: number; overtime_premium: number; estimated_wages: number; punches: number };
type WageReport = { pay_period: PayPeriod; approved_only: boolean; rows: WageRow[]; summary: { employees: number; worked_hours: number; base_wages: number; overtime_hours: number; overtime_premium: number; estimated_wages: number } };

type PunchForm = { id: string | null; employee_id: string; date: string; start: string; end_date: string; end: string; note: string; reason: string };
type BreakForm = { id: string | null; punch_id: string; start_local: string; end_local: string; paid: boolean; reason: string };

const emptyPunch = (): PunchForm => ({ id: null, employee_id: '', date: businessDateInZone(), start: '10:00', end_date: businessDateInZone(), end: '18:00', note: '', reason: '' });
const emptyBreak = (): BreakForm => ({ id: null, punch_id: '', start_local: '', end_local: '', paid: false, reason: '' });
const money = (value: number | null | undefined) => Number(value || 0).toLocaleString([], { style: 'currency', currency: 'USD' });
const fmt = (value: string | null) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

function partsInZone(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

function localDateTimeToIso(value: string, timeZone: string) {
  const [date, time] = value.split('T');
  return zonedLocalToIso(date, `${time}:00`, timeZone);
}

export default function ManagerTimeClockPage() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [timezone, setTimezone] = useState('America/New_York');
  const [period, setPeriod] = useState<PayPeriod | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [breaks, setBreaks] = useState<BreakRow[]>([]);
  const [working, setWorking] = useState<Working[]>([]);
  const [report, setReport] = useState<WageReport | null>(null);
  const [punchForm, setPunchForm] = useState<PunchForm>(emptyPunch());
  const [breakForm, setBreakForm] = useState<BreakForm>(emptyBreak());
  const canManage = profile?.app_role === 'admin' || profile?.app_role === 'manager';

  useEffect(() => {
    void init();
  }, []);

  async function init() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      location.href = '/';
      return;
    }
    const profileResult = await supabase.from('profiles').select('app_role,location_id').eq('id', userData.user.id).single();
    if (profileResult.error || !profileResult.data?.location_id) {
      setMessage('Could not load manager access.');
      setReady(true);
      return;
    }
    const nextProfile = profileResult.data as Profile;
    setProfile(nextProfile);
    if (nextProfile.app_role === 'admin' || nextProfile.app_role === 'manager') await loadDate(businessDateInZone(), nextProfile);
    setReady(true);
  }

  async function loadDate(date: string, nextProfile = profile) {
    if (!nextProfile?.location_id || !(nextProfile.app_role === 'admin' || nextProfile.app_role === 'manager')) return;
    setBusy(true);
    try {
      const periodResult = await supabase.rpc('ensure_time_clock_pay_period', { p_date: date });
      if (periodResult.error) throw periodResult.error;
      await loadPeriod(periodResult.data as PayPeriod, nextProfile);
    } catch (error: any) {
      setMessage(error?.message || 'Could not load Time Clocking.');
    } finally {
      setBusy(false);
    }
  }

  async function loadPeriod(nextPeriod: PayPeriod, nextProfile = profile) {
    if (!nextProfile?.location_id) return;
    const settingsResult = await supabase.from('schedule_settings').select('timezone').eq('location_id', nextProfile.location_id).maybeSingle();
    if (settingsResult.error) throw settingsResult.error;
    const tz = settingsResult.data?.timezone || 'America/New_York';
    setTimezone(tz);
    setPeriod(nextPeriod);

    const from = zonedLocalToIso(nextPeriod.starts_on, '00:00:00', tz);
    const to = zonedLocalToIso(addDateDays(nextPeriod.ends_on, 1), '00:00:00', tz);
    const [employeeResult, punchResult, workingResult, reportResult] = await Promise.all([
      supabase.from('employees').select('id,full_name').eq('location_id', nextProfile.location_id).eq('active', true).is('deleted_at', null).order('full_name'),
      supabase
        .from('time_clock_punches')
        .select('id,employee_id,shift_id,clock_in,clock_out,source,note,manager_approved_at,employee_approval_status,employee_dispute_note')
        .eq('location_id', nextProfile.location_id)
        .gte('clock_in', from)
        .lt('clock_in', to)
        .order('clock_in', { ascending: false }),
      supabase.rpc('time_clock_whos_working', {}),
      supabase.rpc('time_clock_worked_hours_wages', { p_pay_period_id: nextPeriod.id, p_approved_only: true }),
    ]);
    for (const result of [employeeResult, punchResult, workingResult, reportResult]) if (result.error) throw result.error;
    setEmployees((employeeResult.data ?? []) as Employee[]);
    const nextPunches = (punchResult.data ?? []) as Punch[];
    setPunches(nextPunches);
    setWorking((workingResult.data ?? []) as Working[]);
    setReport(reportResult.data as WageReport);
    const ids = nextPunches.map((item) => item.id);
    if (ids.length) {
      const breakResult = await supabase
        .from('time_clock_breaks')
        .select('id,punch_id,started_at,ended_at,paid,deleted_at')
        .in('punch_id', ids)
        .is('deleted_at', null)
        .order('started_at');
      if (breakResult.error) throw breakResult.error;
      setBreaks((breakResult.data ?? []) as BreakRow[]);
    } else setBreaks([]);
  }

  async function refresh() {
    if (!period || !profile) return;
    setBusy(true);
    try {
      const latest = await supabase.from('time_clock_pay_periods').select('id,starts_on,ends_on,status,closed_at').eq('id', period.id).single();
      if (latest.error) throw latest.error;
      await loadPeriod(latest.data as PayPeriod, profile);
    } catch (error: any) {
      setMessage(error?.message || 'Could not refresh Time Clocking.');
    } finally {
      setBusy(false);
    }
  }

  async function changePeriod(direction: -1 | 1) {
    if (!period || busy) return;
    const days = Math.round((new Date(`${period.ends_on}T12:00:00Z`).getTime() - new Date(`${period.starts_on}T12:00:00Z`).getTime()) / 86400000) + 1;
    await loadDate(addDateDays(period.starts_on, direction * days));
  }

  async function approvePunch(id: string) {
    setBusy(true);
    const { error } = await supabase.rpc('manager_approve_time_clock_punch', { p_punch_id: id });
    setMessage(error ? error.message : 'Punch approved.');
    await refresh();
    setBusy(false);
  }

  async function approveAll() {
    if (!period) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('manager_approve_all_time_clock_punches', { p_pay_period_id: period.id });
    setMessage(error ? error.message : `${Number(data || 0)} punch${Number(data || 0) === 1 ? '' : 'es'} approved.`);
    await refresh();
    setBusy(false);
  }

  async function closeOrReopen() {
    if (!period || busy) return;
    const closing = period.status === 'open';
    if (closing && !window.confirm('Close this pay period? Punch time edits will be locked until a manager reopens it.')) return;
    setBusy(true);
    const result = closing
      ? await supabase.rpc('close_time_clock_pay_period', { p_pay_period_id: period.id })
      : await supabase.rpc('reopen_time_clock_pay_period', { p_pay_period_id: period.id });
    setMessage(result.error ? result.error.message : closing ? 'Pay period closed.' : 'Pay period reopened.');
    await refresh();
    setBusy(false);
  }

  function editPunch(item: Punch) {
    const start = partsInZone(item.clock_in, timezone);
    const end = item.clock_out ? partsInZone(item.clock_out, timezone) : start;
    setPunchForm({
      id: item.id,
      employee_id: item.employee_id,
      date: start.date,
      start: start.time,
      end_date: end.date,
      end: item.clock_out ? end.time : '',
      note: item.note || '',
      reason: '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function savePunch(event: FormEvent) {
    event.preventDefault();
    if (!period || busy || !punchForm.employee_id || !punchForm.date || !punchForm.start) return;
    if (punchForm.id && !punchForm.reason.trim()) {
      setMessage('Enter a reason when changing an existing punch.');
      return;
    }
    const clockIn = zonedLocalToIso(punchForm.date, `${punchForm.start}:00`, timezone);
    const clockOut = punchForm.end && punchForm.end_date ? zonedLocalToIso(punchForm.end_date, `${punchForm.end}:00`, timezone) : null;
    setBusy(true);
    const { error } = await supabase.rpc('manager_upsert_time_clock_punch', {
      p_punch_id: punchForm.id,
      p_employee_id: punchForm.employee_id,
      p_clock_in: clockIn,
      p_clock_out: clockOut,
      p_note: punchForm.note.trim() || null,
      p_reason: punchForm.reason.trim() || (punchForm.id ? null : 'Manager-entered punch'),
    });
    setMessage(error ? error.message : punchForm.id ? 'Punch updated. Approval was reset for review.' : 'Punch added.');
    if (!error) setPunchForm(emptyPunch());
    await refresh();
    setBusy(false);
  }

  function editBreak(row: BreakRow) {
    setBreakForm({
      id: row.id,
      punch_id: row.punch_id,
      start_local: `${partsInZone(row.started_at, timezone).date}T${partsInZone(row.started_at, timezone).time}`,
      end_local: row.ended_at ? `${partsInZone(row.ended_at, timezone).date}T${partsInZone(row.ended_at, timezone).time}` : '',
      paid: row.paid,
      reason: '',
    });
  }

  async function saveBreak(event: FormEvent) {
    event.preventDefault();
    if (!breakForm.punch_id || !breakForm.start_local || !breakForm.end_local || busy) return;
    if (breakForm.id && !breakForm.reason.trim()) {
      setMessage('Enter a reason when changing an existing break.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('manager_upsert_time_clock_break', {
      p_break_id: breakForm.id,
      p_punch_id: breakForm.punch_id,
      p_started_at: localDateTimeToIso(breakForm.start_local, timezone),
      p_ended_at: localDateTimeToIso(breakForm.end_local, timezone),
      p_paid: breakForm.paid,
      p_reason: breakForm.reason.trim() || (breakForm.id ? null : 'Manager-entered break'),
    });
    setMessage(error ? error.message : breakForm.id ? 'Break updated. Punch approval was reset.' : 'Break added.');
    if (!error) setBreakForm(emptyBreak());
    await refresh();
    setBusy(false);
  }

  async function removeBreak(id: string) {
    const reason = window.prompt('Reason for removing this break?')?.trim();
    if (!reason) return;
    setBusy(true);
    const { error } = await supabase.rpc('manager_remove_time_clock_break', { p_break_id: id, p_reason: reason });
    setMessage(error ? error.message : 'Break removed from the worked-hours calculation. The audit record remains.');
    await refresh();
    setBusy(false);
  }

  function exportCsv() {
    if (!report || !period) return;
    const rows = [
      ['Employee', 'Worked Hours', 'Hourly Rate', 'Base Wages', 'OT Hours', 'OT Premium', 'Estimated Wages'],
      ...report.rows.map((row) => [row.full_name, row.worked_hours, row.hourly_rate, row.base_wages, row.overtime_hours, row.overtime_premium, row.estimated_wages]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `el-molino-worked-hours-${period.starts_on}-to-${period.ends_on}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const employeeName = (id: string) => employees.find((item) => item.id === id)?.full_name || 'Employee';
  const unapproved = punches.filter((item) => item.clock_out && !item.manager_approved_at).length;
  const disputed = punches.filter((item) => item.employee_approval_status === 'disputed').length;
  const closedPunches = useMemo(() => punches.filter((item) => item.clock_out), [punches]);

  if (!ready) return <div className="full-loader"><span>Opening manager Time Clocking…</span></div>;

  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <div><h1>Manager Time Clocking</h1><p>Review punches, fix breaks, approve worked time, close pay periods, and export payroll-ready hours.</p></div>
        <div className={styles.actions}>
          <Link className={`${styles.button} ${styles.secondary}`} href="/time-clock/kiosk">Open Punch Pad</Link>
          <Link className={`${styles.button} ${styles.secondary}`} href="/time-clock/settings">Settings</Link>
          <Link className={styles.back} href="/time-clock">My Time Clock</Link>
        </div>
      </div>

      {message && <div className={message.toLowerCase().includes('could not') ? styles.error : styles.notice}>{message}</div>}
      {!canManage ? <div className={styles.error}>Manager access is required.</div> : period && (
        <>
          <section className={styles.section}>
            <div className={styles.card}>
              <div className={styles.entryHead}>
                <div><h2>{period.starts_on} – {period.ends_on}</h2><small>{period.status.toUpperCase()}{period.closed_at ? ` · closed ${fmt(period.closed_at)}` : ''}</small></div>
                <div className={styles.actions}>
                  <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => changePeriod(-1)}>Previous</button>
                  <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => changePeriod(1)}>Next</button>
                  <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={refresh}>Refresh</button>
                </div>
              </div>
              <div className={styles.grid}>
                <Metric label="Working now" value={String(working.length)} />
                <Metric label="Unapproved" value={String(unapproved)} />
                <Metric label="Disputed" value={String(disputed)} />
                <Metric label="Approved worked hours" value={Number(report?.summary.worked_hours || 0).toFixed(2)} />
                <Metric label="Estimated wages" value={money(report?.summary.estimated_wages)} />
                <Metric label="OT premium" value={money(report?.summary.overtime_premium)} />
              </div>
              <div className={styles.actions}>
                <button className={styles.button} disabled={busy || period.status === 'closed'} onClick={approveAll}>Approve All Closed Punches</button>
                <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={closeOrReopen}>{period.status === 'open' ? 'Close Pay Period' : 'Reopen Pay Period'}</button>
                <button className={`${styles.button} ${styles.secondary}`} disabled={!report} onClick={exportCsv}>Export CSV</button>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h2>Who’s Working</h2>
            <div className={styles.list}>
              {working.map((item) => <div className={styles.entry} key={item.punch_id}><div className={styles.entryHead}><div><h3>{item.employee_name}</h3><small>Clocked in {fmt(item.clock_in)} · {item.source}{item.on_break ? ` · break since ${fmt(item.break_started_at)}` : ''}</small></div><span className={styles.pill}>{item.on_break ? 'BREAK' : 'WORKING'}</span></div></div>)}
              {!working.length && <div className={styles.card}><b>No one is currently clocked in.</b></div>}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.card}>
              <h2>{punchForm.id ? 'Edit punch' : 'Add missed punch'}</h2>
              <form onSubmit={savePunch}>
                <div className={styles.formGrid}>
                  <label className={styles.field}><span>Employee</span><select value={punchForm.employee_id} onChange={(event) => setPunchForm({ ...punchForm, employee_id: event.target.value })}><option value="">Choose employee</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
                  <label className={styles.field}><span>Clock-in date</span><input type="date" value={punchForm.date} onChange={(event) => setPunchForm({ ...punchForm, date: event.target.value })} /></label>
                  <label className={styles.field}><span>Clock in</span><input type="time" value={punchForm.start} onChange={(event) => setPunchForm({ ...punchForm, start: event.target.value })} /></label>
                  <label className={styles.field}><span>Clock-out date</span><input type="date" value={punchForm.end_date} onChange={(event) => setPunchForm({ ...punchForm, end_date: event.target.value })} /></label>
                  <label className={styles.field}><span>Clock out</span><input type="time" value={punchForm.end} onChange={(event) => setPunchForm({ ...punchForm, end: event.target.value })} /></label>
                  <label className={styles.field}><span>Note</span><input maxLength={2000} value={punchForm.note} onChange={(event) => setPunchForm({ ...punchForm, note: event.target.value })} /></label>
                  <label className={styles.field}><span>Audit reason{punchForm.id ? ' · required' : ''}</span><input maxLength={2000} value={punchForm.reason} onChange={(event) => setPunchForm({ ...punchForm, reason: event.target.value })} /></label>
                </div>
                <div className={styles.actions}>
                  <button className={styles.button} disabled={busy || period.status === 'closed'}>{punchForm.id ? 'Save Punch Change' : 'Add Punch'}</button>
                  {punchForm.id && <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => setPunchForm(emptyPunch())}>Cancel Edit</button>}
                </div>
              </form>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.card}>
              <h2>{breakForm.id ? 'Edit break' : 'Add break to a punch'}</h2>
              <form onSubmit={saveBreak}>
                <div className={styles.formGrid}>
                  <label className={styles.field}><span>Punch</span><select value={breakForm.punch_id} onChange={(event) => setBreakForm({ ...breakForm, punch_id: event.target.value })}><option value="">Choose closed punch</option>{closedPunches.map((item) => <option key={item.id} value={item.id}>{employeeName(item.employee_id)} · {fmt(item.clock_in)}</option>)}</select></label>
                  <label className={styles.field}><span>Break start</span><input type="datetime-local" value={breakForm.start_local} onChange={(event) => setBreakForm({ ...breakForm, start_local: event.target.value })} /></label>
                  <label className={styles.field}><span>Break end</span><input type="datetime-local" value={breakForm.end_local} onChange={(event) => setBreakForm({ ...breakForm, end_local: event.target.value })} /></label>
                  <label className={styles.field}><span>Paid</span><input type="checkbox" checked={breakForm.paid} onChange={(event) => setBreakForm({ ...breakForm, paid: event.target.checked })} /></label>
                  <label className={styles.field}><span>Audit reason{breakForm.id ? ' · required' : ''}</span><input maxLength={2000} value={breakForm.reason} onChange={(event) => setBreakForm({ ...breakForm, reason: event.target.value })} /></label>
                </div>
                <div className={styles.actions}>
                  <button className={styles.button} disabled={busy || period.status === 'closed'}>{breakForm.id ? 'Save Break Change' : 'Add Break'}</button>
                  {breakForm.id && <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => setBreakForm(emptyBreak())}>Cancel Edit</button>}
                </div>
              </form>
            </div>
          </section>

          <section className={styles.section}>
            <h2>Pay-period punches</h2>
            <div className={styles.list}>
              {punches.map((item) => {
                const itemBreaks = breaks.filter((row) => row.punch_id === item.id && !row.deleted_at);
                return <div className={styles.entry} key={item.id}>
                  <div className={styles.entryHead}>
                    <div><h3>{employeeName(item.employee_id)}</h3><small>{fmt(item.clock_in)} → {fmt(item.clock_out)} · {item.source}</small></div>
                    <span className={styles.pill}>{item.employee_approval_status === 'disputed' ? 'DISPUTED' : item.manager_approved_at ? 'APPROVED' : item.clock_out ? 'REVIEW' : 'OPEN'}</span>
                  </div>
                  {item.employee_dispute_note && <div className={styles.error}>Employee dispute: {item.employee_dispute_note}</div>}
                  {item.note && <p>{item.note}</p>}
                  {itemBreaks.length > 0 && <div className={styles.details}>{itemBreaks.map((row) => <div className={styles.detail} key={row.id}><b>{row.paid ? 'Paid' : 'Unpaid'} break</b><span>{fmt(row.started_at)} → {fmt(row.ended_at)}</span>{period.status === 'open' && <div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} onClick={() => editBreak(row)}>Edit Break</button><button className={`${styles.button} ${styles.secondary}`} onClick={() => removeBreak(row.id)}>Remove Break</button></div>}</div>)}</div>}
                  <div className={styles.actions}>
                    {item.clock_out && !item.manager_approved_at && <button className={styles.button} disabled={busy} onClick={() => approvePunch(item.id)}>Approve</button>}
                    {period.status === 'open' && <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => editPunch(item)}>Edit Punch</button>}
                    {item.clock_out && period.status === 'open' && <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => setBreakForm({ ...emptyBreak(), punch_id: item.id })}>Add Break</button>}
                  </div>
                </div>;
              })}
              {!punches.length && <div className={styles.card}><b>No punches in this pay period.</b></div>}
            </div>
          </section>

          <section className={styles.section}>
            <h2>Worked Hours & Wages · approved punches only</h2>
            <div className={styles.list}>
              {(report?.rows ?? []).map((row) => <div className={styles.entry} key={row.employee_id}><div className={styles.entryHead}><div><h3>{row.full_name}</h3><small>{Number(row.worked_hours).toFixed(2)} hrs · {row.punches} punches · {money(row.hourly_rate)}/hr</small></div><strong>{money(row.estimated_wages)}</strong></div><div className={styles.details}><div className={styles.detail}><b>Base wages</b><span>{money(row.base_wages)}</span></div><div className={styles.detail}><b>Overtime</b><span>{Number(row.overtime_hours).toFixed(2)} hrs · {money(row.overtime_premium)} premium</span></div></div></div>)}
              {!report?.rows?.length && <div className={styles.card}><b>No approved closed punches yet.</b></div>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div>;
}
