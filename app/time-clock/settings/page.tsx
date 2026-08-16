'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from '../../ops-tools.module.css';

type Profile = { app_role: 'admin' | 'manager' | 'employee'; location_id: string | null };
type Settings = {
  location_id: string;
  enabled: boolean;
  mobile_punch_enabled: boolean;
  kiosk_punch_enabled: boolean;
  require_scheduled_shift: boolean;
  employee_approval_enabled: boolean;
  geofence_enabled: boolean;
  geofence_latitude: number | null;
  geofence_longitude: number | null;
  geofence_radius_meters: number;
  early_clock_in_minutes: number;
  late_clock_out_minutes: number;
  auto_punch_out_hours: number;
  pay_period_frequency: 'weekly' | 'biweekly';
  pay_period_anchor: string;
  workweek_starts_on: number;
};
type Employee = { id: string; full_name: string };
type PinStatus = { employee_id: string; configured: boolean; locked: boolean; locked_until: string | null; pin_updated_at: string | null };

export default function TimeClockSettingsPage() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pinStatus, setPinStatus] = useState<Record<string, PinStatus>>({});
  const [pins, setPins] = useState<Record<string, string>>({});
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
      setMessage('Could not load Time Clock Settings.');
      setReady(true);
      return;
    }
    const nextProfile = profileResult.data as Profile;
    setProfile(nextProfile);
    if (nextProfile.app_role === 'admin' || nextProfile.app_role === 'manager') await load(nextProfile);
    setReady(true);
  }

  async function load(nextProfile = profile) {
    if (!nextProfile?.location_id) return;
    setBusy(true);
    try {
      const [settingsResult, employeeResult, pinResult] = await Promise.all([
        supabase.from('time_clock_settings').select('*').eq('location_id', nextProfile.location_id).single(),
        supabase.from('employees').select('id,full_name').eq('location_id', nextProfile.location_id).eq('active', true).is('deleted_at', null).order('full_name'),
        supabase.rpc('time_clock_pin_status', {}),
      ]);
      for (const result of [settingsResult, employeeResult, pinResult]) if (result.error) throw result.error;
      setSettings(settingsResult.data as Settings);
      setEmployees((employeeResult.data ?? []) as Employee[]);
      const statusMap: Record<string, PinStatus> = {};
      for (const item of (pinResult.data ?? []) as PinStatus[]) statusMap[item.employee_id] = item;
      setPinStatus(statusMap);
    } catch (error: any) {
      setMessage(error?.message || 'Could not load Time Clock Settings.');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    if (!settings || !profile?.location_id || busy) return;
    if (settings.geofence_enabled && (settings.geofence_latitude == null || settings.geofence_longitude == null)) {
      setMessage('Enter restaurant latitude and longitude before enabling geofencing.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('time_clock_settings').upsert(settings, { onConflict: 'location_id' });
    setMessage(error ? error.message : 'Time Clock Settings saved.');
    await load();
    setBusy(false);
  }

  async function setEmployeePin(employeeId: string) {
    const value = pins[employeeId] || '';
    if (!/^\d{4,8}$/.test(value)) {
      setMessage('PIN must be 4 to 8 digits.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('manager_set_time_clock_pin', { p_employee_id: employeeId, p_pin: value });
    setMessage(error ? error.message : 'Punch Pad PIN saved.');
    if (!error) setPins({ ...pins, [employeeId]: '' });
    await load();
    setBusy(false);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage('This device cannot provide coordinates.');
      return;
    }
    setMessage('Reading current device location…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!settings) return;
        setSettings({ ...settings, geofence_latitude: position.coords.latitude, geofence_longitude: position.coords.longitude });
        setMessage('Coordinates loaded. Verify this device is physically at the restaurant, then save settings.');
      },
      () => setMessage('Could not read this device location.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  if (!ready) return <div className="full-loader"><span>Opening Time Clock Settings…</span></div>;

  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <div><h1>Time Clock Settings</h1><p>Control self-service punching, Punch Pad, geofencing, pay periods, auto punch-out and employee punch approval.</p></div>
        <div className={styles.actions}>
          <Link className={`${styles.button} ${styles.secondary}`} href="/time-clock/kiosk">Punch Pad</Link>
          <Link className={styles.back} href="/time-clock/manage">Manager Time Clocking</Link>
        </div>
      </div>

      {message && <div className={message.toLowerCase().includes('could not') ? styles.error : styles.notice}>{message}</div>}
      {!canManage ? <div className={styles.error}>Manager access is required.</div> : settings && (
        <>
          <section className={styles.section}>
            <div className={styles.card}>
              <h2>Punch rules</h2>
              <div className={styles.formGrid}>
                <Toggle label="Time Clocking enabled" checked={settings.enabled} onChange={(checked) => setSettings({ ...settings, enabled: checked })} />
                <Toggle label="Employee self-service punching" checked={settings.mobile_punch_enabled} onChange={(checked) => setSettings({ ...settings, mobile_punch_enabled: checked })} />
                <Toggle label="Punch Pad kiosk" checked={settings.kiosk_punch_enabled} onChange={(checked) => setSettings({ ...settings, kiosk_punch_enabled: checked })} />
                <Toggle label="Require matching scheduled shift" checked={settings.require_scheduled_shift} onChange={(checked) => setSettings({ ...settings, require_scheduled_shift: checked })} />
                <Toggle label="Employee punch approval / disputes" checked={settings.employee_approval_enabled} onChange={(checked) => setSettings({ ...settings, employee_approval_enabled: checked })} />
                <label className={styles.field}><span>Early clock-in allowance · minutes</span><input type="number" min="0" max="360" value={settings.early_clock_in_minutes} onChange={(event) => setSettings({ ...settings, early_clock_in_minutes: Number(event.target.value) })} /></label>
                <label className={styles.field}><span>Late shift-match allowance · minutes</span><input type="number" min="0" max="720" value={settings.late_clock_out_minutes} onChange={(event) => setSettings({ ...settings, late_clock_out_minutes: Number(event.target.value) })} /></label>
                <label className={styles.field}><span>Auto punch-out after · hours</span><input type="number" min="4" max="24" step="0.5" value={settings.auto_punch_out_hours} onChange={(event) => setSettings({ ...settings, auto_punch_out_hours: Number(event.target.value) })} /></label>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.card}>
              <h2>Geofence</h2>
              <p>When enabled, every employee self-service punch—whether the browser calls it web or mobile—must include device location and pass the server-side distance check. Punch Pad and manager edits are separate trusted workflows.</p>
              <div className={styles.formGrid}>
                <Toggle label="Require restaurant geofence" checked={settings.geofence_enabled} onChange={(checked) => setSettings({ ...settings, geofence_enabled: checked })} />
                <label className={styles.field}><span>Latitude</span><input type="number" step="0.000001" value={settings.geofence_latitude ?? ''} onChange={(event) => setSettings({ ...settings, geofence_latitude: event.target.value === '' ? null : Number(event.target.value) })} /></label>
                <label className={styles.field}><span>Longitude</span><input type="number" step="0.000001" value={settings.geofence_longitude ?? ''} onChange={(event) => setSettings({ ...settings, geofence_longitude: event.target.value === '' ? null : Number(event.target.value) })} /></label>
                <label className={styles.field}><span>Radius · meters</span><input type="number" min="25" max="5000" value={settings.geofence_radius_meters} onChange={(event) => setSettings({ ...settings, geofence_radius_meters: Number(event.target.value) })} /></label>
              </div>
              <div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} type="button" onClick={useCurrentLocation}>Use This Device’s Current Coordinates</button></div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.card}>
              <h2>Pay periods & overtime workweek</h2>
              <div className={styles.formGrid}>
                <label className={styles.field}><span>Pay period</span><select value={settings.pay_period_frequency} onChange={(event) => setSettings({ ...settings, pay_period_frequency: event.target.value as 'weekly' | 'biweekly' })}><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option></select></label>
                <label className={styles.field}><span>Pay-period anchor date</span><input type="date" value={settings.pay_period_anchor} onChange={(event) => setSettings({ ...settings, pay_period_anchor: event.target.value })} /></label>
                <label className={styles.field}><span>Workweek starts</span><select value={settings.workweek_starts_on} onChange={(event) => setSettings({ ...settings, workweek_starts_on: Number(event.target.value) })}><option value={0}>Sunday</option><option value={1}>Monday</option><option value={2}>Tuesday</option><option value={3}>Wednesday</option><option value={4}>Thursday</option><option value={5}>Friday</option><option value={6}>Saturday</option></select></label>
              </div>
              <p>Overtime is calculated per configured seven-day workweek, even when the pay period spans two weeks.</p>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.card}><div className={styles.actions}><button className={styles.button} disabled={busy} onClick={saveSettings}>Save Time Clock Settings</button></div></div>
          </section>

          <section className={styles.section}>
            <h2>Punch Pad PINs</h2>
            <div className={styles.list}>
              {employees.map((employee) => {
                const status = pinStatus[employee.id];
                return <div className={styles.entry} key={employee.id}>
                  <div className={styles.entryHead}>
                    <div><h3>{employee.full_name}</h3><small>{status?.configured ? `PIN configured${status.pin_updated_at ? ` · updated ${new Date(status.pin_updated_at).toLocaleDateString()}` : ''}` : 'PIN not configured'}{status?.locked ? ` · locked until ${new Date(status.locked_until || '').toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</small></div>
                    <span className={styles.pill}>{status?.locked ? 'LOCKED' : status?.configured ? 'READY' : 'NEEDS PIN'}</span>
                  </div>
                  <div className={styles.formGrid}>
                    <label className={styles.field}><span>Set / reset 4–8 digit PIN</span><input type="password" inputMode="numeric" autoComplete="new-password" value={pins[employee.id] || ''} onChange={(event) => setPins({ ...pins, [employee.id]: event.target.value.replace(/\D/g, '').slice(0, 8) })} /></label>
                  </div>
                  <div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={busy || !(pins[employee.id] || '')} onClick={() => setEmployeePin(employee.id)}>Save PIN</button></div>
                </div>;
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className={styles.field}><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}
