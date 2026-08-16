'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from '../ops-tools.module.css';

type Profile = { app_role: 'admin' | 'manager' | 'employee'; location_id: string | null };
type Settings = { enabled: boolean; mobile_punch_enabled: boolean; geofence_enabled: boolean; employee_approval_enabled: boolean };
type Employee = { id: string; full_name: string };
type Punch = {
  id: string;
  employee_id: string;
  shift_id: string | null;
  clock_in: string;
  clock_out: string | null;
  source: string;
  manager_approved_at: string | null;
  employee_approval_status: 'pending' | 'approved' | 'disputed';
  employee_dispute_note: string | null;
  note: string | null;
};
type BreakRow = { id: string; punch_id: string; started_at: string; ended_at: string | null; paid: boolean; deleted_at: string | null };
type BreakRule = { id: string; name: string; paid: boolean; duration_minutes: number; active: boolean };

type Position = { latitude: number; longitude: number };

function fmt(value: string | null) {
  return value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
}

export default function TimeClockPage() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [breaks, setBreaks] = useState<BreakRow[]>([]);
  const [rules, setRules] = useState<BreakRule[]>([]);
  const [pin, setPin] = useState('');

  const canManage = profile?.app_role === 'admin' || profile?.app_role === 'manager';
  const openPunch = useMemo(() => punches.find((item) => !item.clock_out) || null, [punches]);
  const activeBreak = useMemo(
    () => (openPunch ? breaks.find((item) => item.punch_id === openPunch.id && !item.ended_at && !item.deleted_at) || null : null),
    [breaks, openPunch],
  );

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
      setMessage('Could not load your restaurant access.');
      setReady(true);
      return;
    }
    const nextProfile = profileResult.data as Profile;
    setProfile(nextProfile);
    await load(nextProfile);
    setReady(true);
  }

  async function load(nextProfile = profile) {
    if (!nextProfile?.location_id) return;
    setBusy(true);
    try {
      const employeeIdResult = await supabase.rpc('time_clock_employee_id_for_user', {});
      if (employeeIdResult.error) throw employeeIdResult.error;
      const employeeId = employeeIdResult.data as string | null;
      const [settingsResult, employeeResult, punchResult, ruleResult] = await Promise.all([
        supabase
          .from('time_clock_settings')
          .select('enabled,mobile_punch_enabled,geofence_enabled,employee_approval_enabled')
          .eq('location_id', nextProfile.location_id)
          .maybeSingle(),
        employeeId
          ? supabase.from('employees').select('id,full_name').eq('id', employeeId).single()
          : Promise.resolve({ data: null, error: null } as any),
        employeeId
          ? supabase
              .from('time_clock_punches')
              .select('id,employee_id,shift_id,clock_in,clock_out,source,manager_approved_at,employee_approval_status,employee_dispute_note,note')
              .eq('employee_id', employeeId)
              .order('clock_in', { ascending: false })
              .limit(30)
          : Promise.resolve({ data: [], error: null } as any),
        supabase
          .from('schedule_break_rules')
          .select('id,name,paid,duration_minutes,active')
          .eq('location_id', nextProfile.location_id)
          .eq('active', true)
          .order('duration_minutes'),
      ]);
      for (const result of [settingsResult, employeeResult, punchResult, ruleResult]) {
        if (result.error) throw result.error;
      }
      setSettings((settingsResult.data as Settings | null) || null);
      setEmployee((employeeResult.data as Employee | null) || null);
      const nextPunches = (punchResult.data ?? []) as Punch[];
      setPunches(nextPunches);
      setRules((ruleResult.data ?? []) as BreakRule[]);
      const ids = nextPunches.map((item) => item.id);
      if (ids.length) {
        const breakResult = await supabase
          .from('time_clock_breaks')
          .select('id,punch_id,started_at,ended_at,paid,deleted_at')
          .in('punch_id', ids)
          .order('started_at');
        if (breakResult.error) throw breakResult.error;
        setBreaks((breakResult.data ?? []) as BreakRow[]);
      } else {
        setBreaks([]);
      }
    } catch (error: any) {
      setMessage(error?.message || 'Could not load your time clock.');
    } finally {
      setBusy(false);
    }
  }

  function getPosition(): Promise<Position | null> {
    if (!settings?.geofence_enabled) return Promise.resolve(null);
    if (!navigator.geolocation) return Promise.reject(new Error('This device cannot provide location for the geofence.'));
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        () => reject(new Error('Location permission is required to punch at this restaurant.')),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    });
  }

  async function punch(action: 'in' | 'out') {
    if (busy || !employee) return;
    setBusy(true);
    setMessage('');
    try {
      const position = await getPosition();
      const args = {
        p_source: 'web',
        p_latitude: position?.latitude ?? null,
        p_longitude: position?.longitude ?? null,
      };
      const result = action === 'in' ? await supabase.rpc('clock_in', args) : await supabase.rpc('clock_out', args);
      if (result.error) throw result.error;
      setMessage(action === 'in' ? 'Clocked in.' : 'Clocked out.');
      await load();
    } catch (error: any) {
      setMessage(error?.message || 'The punch could not be recorded.');
    } finally {
      setBusy(false);
    }
  }

  async function startBreak(paid: boolean) {
    if (busy || !openPunch || activeBreak) return;
    setBusy(true);
    const { error } = await supabase.rpc('start_time_clock_break', { p_paid: paid, p_source: 'web' });
    setMessage(error ? error.message : paid ? 'Paid break started.' : 'Unpaid break started.');
    await load();
    setBusy(false);
  }

  async function endBreak() {
    if (busy || !activeBreak) return;
    setBusy(true);
    const { error } = await supabase.rpc('end_time_clock_break', { p_source: 'web' });
    setMessage(error ? error.message : 'Break ended.');
    await load();
    setBusy(false);
  }

  async function attest(punchId: string, approved: boolean) {
    if (busy) return;
    let note: string | null = null;
    if (!approved) {
      note = window.prompt('What needs to be corrected on this punch?')?.trim() || null;
      if (!note) return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('employee_attest_time_clock_punch', {
      p_punch_id: punchId,
      p_approved: approved,
      p_dispute_note: note,
    });
    setMessage(error ? error.message : approved ? 'Punch approved.' : 'Punch sent to management for review.');
    await load();
    setBusy(false);
  }

  async function savePin() {
    if (busy) return;
    if (!/^\d{4,8}$/.test(pin)) {
      setMessage('Punch Pad PIN must be 4 to 8 digits.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('set_time_clock_pin', { p_pin: pin });
    setMessage(error ? error.message : 'Punch Pad PIN saved.');
    if (!error) setPin('');
    setBusy(false);
  }

  if (!ready) return <div className="full-loader"><span>Opening Time Clock…</span></div>;

  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <div>
          <h1>My Time Clock</h1>
          <p>Clock in, take breaks, review your hours, and flag a punch that needs correction.</p>
        </div>
        <div className={styles.actions}>
          {canManage && <Link className={`${styles.button} ${styles.secondary}`} href="/time-clock/manage">Manager Time Clocking</Link>}
          <Link className={styles.back} href="/">Back to Ops</Link>
        </div>
      </div>

      {message && <div className={message.toLowerCase().includes('could not') ? styles.error : styles.notice}>{message}</div>}
      {!settings?.enabled && <div className={styles.error}>Time clocking is currently disabled for this location.</div>}
      {!employee && <div className={styles.error}>Your login is not linked to an active employee record yet. A manager must link it before self-service punching can be used.</div>}

      {employee && settings?.enabled && (
        <>
          <section className={styles.section}>
            <div className={styles.card}>
              <div className={styles.entryHead}>
                <div>
                  <h2>{employee.full_name}</h2>
                  <small>{openPunch ? `Clocked in ${fmt(openPunch.clock_in)}` : 'Not clocked in'}{activeBreak ? ` · on ${activeBreak.paid ? 'paid' : 'unpaid'} break` : ''}</small>
                </div>
                <span className={styles.pill}>{activeBreak ? 'ON BREAK' : openPunch ? 'WORKING' : 'OFF CLOCK'}</span>
              </div>
              <div className={styles.actions}>
                {!openPunch && <button className={styles.button} disabled={busy || !settings.mobile_punch_enabled} onClick={() => punch('in')}>Clock In</button>}
                {openPunch && !activeBreak && <button className={styles.button} disabled={busy} onClick={() => punch('out')}>Clock Out</button>}
                {activeBreak && <button className={styles.button} disabled={busy} onClick={endBreak}>End Break</button>}
              </div>
              {settings.geofence_enabled && <p>Location is required for employee self-service punches. The server verifies the distance from the restaurant before accepting the punch.</p>}
            </div>
          </section>

          {openPunch && !activeBreak && (
            <section className={styles.section}>
              <div className={styles.card}>
                <h2>Start a break</h2>
                <div className={styles.actions}>
                  {rules.length ? rules.map((rule) => (
                    <button key={rule.id} className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => startBreak(rule.paid)}>
                      {rule.name} · {rule.duration_minutes} min · {rule.paid ? 'Paid' : 'Unpaid'}
                    </button>
                  )) : (
                    <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => startBreak(false)}>Start Unpaid Break</button>
                  )}
                </div>
              </div>
            </section>
          )}

          <section className={styles.section}>
            <div className={styles.card}>
              <h2>Punch Pad PIN</h2>
              <p>Set a private PIN for the manager-launched Punch Pad kiosk. The PIN is stored as a one-way hash and cannot be read back.</p>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>New 4–8 digit PIN</span>
                  <input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))} />
                </label>
              </div>
              <div className={styles.actions}><button className={styles.button} disabled={busy || !pin} onClick={savePin}>Save PIN</button></div>
            </div>
          </section>

          <section className={styles.section}>
            <h2>Recent punches</h2>
            <div className={styles.list}>
              {punches.map((item) => {
                const itemBreaks = breaks.filter((row) => row.punch_id === item.id && !row.deleted_at);
                return (
                  <div className={styles.entry} key={item.id}>
                    <div className={styles.entryHead}>
                      <div>
                        <h3>{fmt(item.clock_in)} → {fmt(item.clock_out)}</h3>
                        <small>Manager: {item.manager_approved_at ? 'Approved' : 'Not approved'} · You: {item.employee_approval_status}</small>
                      </div>
                      <span className={styles.pill}>{item.source}</span>
                    </div>
                    {itemBreaks.length > 0 && <div className={styles.details}>{itemBreaks.map((row) => <div className={styles.detail} key={row.id}><b>{row.paid ? 'Paid' : 'Unpaid'} break</b><span>{fmt(row.started_at)} → {fmt(row.ended_at)}</span></div>)}</div>}
                    {item.employee_dispute_note && <div className={styles.notice}>Dispute: {item.employee_dispute_note}</div>}
                    {item.clock_out && settings.employee_approval_enabled && item.employee_approval_status !== 'approved' && (
                      <div className={styles.actions}>
                        <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => attest(item.id, true)}>My Punch Is Correct</button>
                        <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => attest(item.id, false)}>Report a Problem</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {!punches.length && <div className={styles.card}><b>No time punches yet.</b></div>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
