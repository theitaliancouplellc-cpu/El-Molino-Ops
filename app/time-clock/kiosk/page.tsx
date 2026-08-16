'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from '../../ops-tools.module.css';

type Profile = { app_role: 'admin' | 'manager' | 'employee'; location_id: string | null };
type Employee = { id: string; full_name: string };
type Working = { punch_id: string; employee_id: string; employee_name: string; clock_in: string; on_break: boolean; break_started_at: string | null };
type ActionResult = { ok: boolean; error?: string; id?: string; action?: string };

export default function PunchPadPage() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [working, setWorking] = useState<Working[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [pin, setPin] = useState('');
  const [search, setSearch] = useState('');

  const canManage = profile?.app_role === 'admin' || profile?.app_role === 'manager';
  const selected = employees.find((item) => item.id === selectedEmployee) || null;
  const current = working.find((item) => item.employee_id === selectedEmployee) || null;
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return employees.filter((item) => !query || item.full_name.toLowerCase().includes(query));
  }, [employees, search]);

  useEffect(() => {
    void init();
  }, []);

  async function init() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      location.href = '/';
      return;
    }
    const result = await supabase.from('profiles').select('app_role,location_id').eq('id', userData.user.id).single();
    if (result.error || !result.data?.location_id) {
      setMessage('Could not load Punch Pad access.');
      setReady(true);
      return;
    }
    const nextProfile = result.data as Profile;
    setProfile(nextProfile);
    if (nextProfile.app_role === 'admin' || nextProfile.app_role === 'manager') await load(nextProfile);
    setReady(true);
  }

  async function load(nextProfile = profile) {
    if (!nextProfile?.location_id) return;
    const [employeeResult, workingResult, settingsResult] = await Promise.all([
      supabase.from('employees').select('id,full_name').eq('location_id', nextProfile.location_id).eq('active', true).is('deleted_at', null).order('full_name'),
      supabase.rpc('time_clock_whos_working', {}),
      supabase.from('time_clock_settings').select('enabled,kiosk_punch_enabled').eq('location_id', nextProfile.location_id).maybeSingle(),
    ]);
    if (employeeResult.error || workingResult.error || settingsResult.error) {
      setMessage(employeeResult.error?.message || workingResult.error?.message || settingsResult.error?.message || 'Could not load Punch Pad.');
      return;
    }
    if (!settingsResult.data?.enabled || !settingsResult.data?.kiosk_punch_enabled) setMessage('Punch Pad is disabled in Time Clock Settings.');
    setEmployees((employeeResult.data ?? []) as Employee[]);
    setWorking((workingResult.data ?? []) as Working[]);
  }

  async function runAction(action: 'clock_in' | 'clock_out' | 'start_break' | 'end_break', paidBreak = false) {
    if (!selectedEmployee || !/^\d{4,8}$/.test(pin) || busy) {
      setMessage('Choose your name and enter your 4–8 digit PIN.');
      return;
    }
    setBusy(true);
    setMessage('');
    const { data, error } = await supabase.rpc('kiosk_time_clock_action', {
      p_employee_id: selectedEmployee,
      p_pin: pin,
      p_action: action,
      p_paid_break: paidBreak,
    });
    const result = data as ActionResult | null;
    if (error) setMessage(error.message);
    else if (!result?.ok) setMessage(result?.error || 'Punch Pad action was not accepted.');
    else {
      setMessage(`${selected?.full_name || 'Employee'}: ${action.replaceAll('_', ' ')} recorded.`);
      setPin('');
      await load();
    }
    setBusy(false);
  }

  function choose(id: string) {
    setSelectedEmployee(id);
    setPin('');
    setMessage('');
  }

  if (!ready) return <div className="full-loader"><span>Opening Punch Pad…</span></div>;

  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <div><h1>Punch Pad</h1><p>Manager-launched shared clock. Employees select their name and authorize each action with their private PIN.</p></div>
        <div className={styles.actions}>
          <Link className={`${styles.button} ${styles.secondary}`} href="/time-clock/manage">Manager Time Clocking</Link>
          <Link className={styles.back} href="/time-clock">My Time Clock</Link>
        </div>
      </div>

      {message && <div className={message.toLowerCase().includes('could not') || message.toLowerCase().includes('invalid') || message.toLowerCase().includes('disabled') ? styles.error : styles.notice}>{message}</div>}
      {!canManage ? <div className={styles.error}>A manager must sign in to launch Punch Pad.</div> : (
        <>
          <section className={styles.section}>
            <div className={styles.card}>
              <label className={styles.field}>
                <span>Find your name</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee…" autoComplete="off" />
              </label>
              <div className={styles.actions}>
                {filtered.map((item) => <button key={item.id} className={`${styles.button} ${selectedEmployee === item.id ? '' : styles.secondary}`} onClick={() => choose(item.id)}>{item.full_name}</button>)}
              </div>
            </div>
          </section>

          {selected && (
            <section className={styles.section}>
              <div className={styles.card}>
                <div className={styles.entryHead}>
                  <div><h2>{selected.full_name}</h2><small>{current ? current.on_break ? 'Currently on break' : `Clocked in ${new Date(current.clock_in).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Currently off clock'}</small></div>
                  <span className={styles.pill}>{current?.on_break ? 'BREAK' : current ? 'WORKING' : 'OFF CLOCK'}</span>
                </div>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>Private PIN</span>
                    <input type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))} onKeyDown={(event) => { if (event.key === 'Enter' && !current) void runAction('clock_in'); }} />
                  </label>
                </div>
                <div className={styles.actions}>
                  {!current && <button className={styles.button} disabled={busy} onClick={() => runAction('clock_in')}>Clock In</button>}
                  {current && !current.on_break && <button className={styles.button} disabled={busy} onClick={() => runAction('clock_out')}>Clock Out</button>}
                  {current && !current.on_break && <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => runAction('start_break', false)}>Start Unpaid Break</button>}
                  {current && !current.on_break && <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => runAction('start_break', true)}>Start Paid Break</button>}
                  {current?.on_break && <button className={styles.button} disabled={busy} onClick={() => runAction('end_break')}>End Break</button>}
                </div>
                <p>Five failed PIN attempts temporarily lock that employee’s Punch Pad PIN. Managers can reset a PIN from Time Clock Settings.</p>
              </div>
            </section>
          )}

          <section className={styles.section}>
            <h2>Currently clocked in</h2>
            <div className={styles.list}>
              {working.map((item) => <div className={styles.entry} key={item.punch_id}><div className={styles.entryHead}><div><h3>{item.employee_name}</h3><small>Since {new Date(item.clock_in).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></div><span className={styles.pill}>{item.on_break ? 'BREAK' : 'WORKING'}</span></div></div>)}
              {!working.length && <div className={styles.card}><b>No one is currently clocked in.</b></div>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
