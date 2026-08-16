'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from '../../ops-tools.module.css';
import { businessDateInZone } from '@/lib/intermediate-hardening';

type Profile = { app_role: 'admin' | 'manager' | 'employee'; location_id: string | null };
type Pool = { id: string; name: string; cadence: 'daily' | 'weekly' | 'pay_period'; distribution_method: 'equal' | 'hours' | 'weighted_hours'; active: boolean; description: string | null };
type Role = { id: string; name: string };
type Employee = { id: string; full_name: string };
type Receiver = { id: string; pool_id: string; receiver_type: 'role' | 'employee'; role_id: string | null; employee_id: string | null; weight: number };
type Run = { id: string; pool_id: string; starts_on: string; ends_on: string; status: 'draft' | 'final' | 'cancelled'; total_contributions: number; total_distributed: number; finalized_at: string | null };
type Contribution = { id: string; run_id: string; employee_id: string | null; role_id: string | null; source: string; amount: number; note: string | null; created_at: string };
type Distribution = { id: string; run_id: string; employee_id: string; eligible_hours: number; receiver_weight: number; distribution_basis: number; amount: number };
type PayPeriod = { id: string; starts_on: string; ends_on: string; status: string };
type PayrollReport = { starts_on: string; ends_on: string; total_distributed: number; employees: { employee_id: string; full_name: string; tip_amount: number; eligible_hours: number; runs: number }[]; pools: { pool_id: string; pool_name: string; distributed: number; runs: number }[]; partially_overlapping_runs_excluded: number };

const money = (value: number | null | undefined) => Number(value || 0).toLocaleString([], { style: 'currency', currency: 'USD' });

export default function TipManagementPage() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employeeVisibility, setEmployeeVisibility] = useState(true);
  const [pools, setPools] = useState<Pool[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [selectedPool, setSelectedPool] = useState('');
  const [referenceDate, setReferenceDate] = useState(businessDateInZone());
  const [run, setRun] = useState<Run | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [payPeriod, setPayPeriod] = useState<PayPeriod | null>(null);
  const [payrollReport, setPayrollReport] = useState<PayrollReport | null>(null);
  const [poolForm, setPoolForm] = useState({ id: '', name: '', cadence: 'daily' as Pool['cadence'], distribution_method: 'weighted_hours' as Pool['distribution_method'], description: '' });
  const [receiverForm, setReceiverForm] = useState({ type: 'role' as 'role' | 'employee', target_id: '', weight: '1' });
  const [contributionForm, setContributionForm] = useState({ amount: '', source: 'manual', employee_id: '', role_id: '', note: '' });
  const canManage = profile?.app_role === 'admin' || profile?.app_role === 'manager';
  const pool = pools.find((item) => item.id === selectedPool) || null;
  const runReceivers = useMemo(() => receivers.filter((item) => item.pool_id === selectedPool), [receivers, selectedPool]);

  useEffect(() => { void init(); }, []);

  async function init() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { location.href = '/'; return; }
    const result = await supabase.from('profiles').select('app_role,location_id').eq('id', userData.user.id).single();
    if (result.error || !result.data?.location_id) {
      setMessage('Could not load Tip Management.');
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
    setBusy(true);
    try {
      const [settingsResult, poolResult, roleResult, employeeResult, receiverResult, periodResult] = await Promise.all([
        supabase.from('tip_settings').select('employee_visibility').eq('location_id', nextProfile.location_id).single(),
        supabase.from('tip_pools').select('id,name,cadence,distribution_method,active,description').eq('location_id', nextProfile.location_id).eq('active', true).order('name'),
        supabase.from('employee_roles').select('id,name').eq('location_id', nextProfile.location_id).order('name'),
        supabase.from('employees').select('id,full_name').eq('location_id', nextProfile.location_id).eq('active', true).is('deleted_at', null).order('full_name'),
        supabase.from('tip_pool_receivers').select('id,pool_id,receiver_type,role_id,employee_id,weight').eq('location_id', nextProfile.location_id),
        supabase.rpc('ensure_time_clock_pay_period', { p_date: businessDateInZone() }),
      ]);
      for (const result of [settingsResult, poolResult, roleResult, employeeResult, receiverResult, periodResult]) if (result.error) throw result.error;
      setEmployeeVisibility(Boolean(settingsResult.data?.employee_visibility));
      const nextPools = (poolResult.data ?? []) as Pool[];
      setPools(nextPools);
      setRoles((roleResult.data ?? []) as Role[]);
      setEmployees((employeeResult.data ?? []) as Employee[]);
      setReceivers((receiverResult.data ?? []) as Receiver[]);
      const nextPeriod = periodResult.data as PayPeriod;
      setPayPeriod(nextPeriod);
      const poolId = selectedPool || nextPools[0]?.id || '';
      if (poolId && poolId !== selectedPool) setSelectedPool(poolId);
      if (poolId) await loadRun(poolId, referenceDate);
      const payroll = await supabase.rpc('tip_pool_payroll_report', { p_pay_period_id: nextPeriod.id });
      if (payroll.error) throw payroll.error;
      setPayrollReport(payroll.data as PayrollReport);
    } catch (error: any) {
      setMessage(error?.message || 'Could not load Tip Management.');
    } finally {
      setBusy(false);
    }
  }

  async function loadRun(poolId = selectedPool, date = referenceDate) {
    if (!poolId) { setRun(null); setContributions([]); setDistributions([]); return; }
    const runResult = await supabase.rpc('ensure_tip_pool_run', { p_pool_id: poolId, p_reference_date: date });
    if (runResult.error) throw runResult.error;
    const nextRun = runResult.data as Run;
    setRun(nextRun);
    const [contributionResult, distributionResult] = await Promise.all([
      supabase.from('tip_contributions').select('id,run_id,employee_id,role_id,source,amount,note,created_at').eq('run_id', nextRun.id).order('created_at'),
      supabase.from('tip_distributions').select('id,run_id,employee_id,eligible_hours,receiver_weight,distribution_basis,amount').eq('run_id', nextRun.id).order('amount', { ascending: false }),
    ]);
    if (contributionResult.error || distributionResult.error) throw contributionResult.error || distributionResult.error;
    setContributions((contributionResult.data ?? []) as Contribution[]);
    setDistributions((distributionResult.data ?? []) as Distribution[]);
  }

  async function selectPool(id: string) {
    setSelectedPool(id);
    setMessage('');
    setBusy(true);
    try { await loadRun(id, referenceDate); } catch (error: any) { setMessage(error?.message || 'Could not load tip run.'); }
    setBusy(false);
  }

  async function changeReferenceDate(date: string) {
    setReferenceDate(date);
    if (!selectedPool) return;
    setBusy(true);
    try { await loadRun(selectedPool, date); } catch (error: any) { setMessage(error?.message || 'Could not load tip run.'); }
    setBusy(false);
  }

  async function saveVisibility() {
    if (!profile?.location_id || busy) return;
    setBusy(true);
    const { error } = await supabase.from('tip_settings').upsert({ location_id: profile.location_id, employee_visibility: employeeVisibility }, { onConflict: 'location_id' });
    setMessage(error ? error.message : 'Employee tip visibility saved.');
    setBusy(false);
  }

  async function savePool(event: FormEvent) {
    event.preventDefault();
    if (!profile?.location_id || !poolForm.name.trim() || busy) return;
    setBusy(true);
    const payload = { location_id: profile.location_id, name: poolForm.name.trim(), cadence: poolForm.cadence, distribution_method: poolForm.distribution_method, description: poolForm.description.trim() || null };
    const result = poolForm.id ? await supabase.from('tip_pools').update(payload).eq('id', poolForm.id) : await supabase.from('tip_pools').insert(payload);
    setMessage(result.error ? result.error.message : poolForm.id ? 'Tip pool updated.' : 'Tip pool created.');
    if (!result.error) setPoolForm({ id: '', name: '', cadence: 'daily', distribution_method: 'weighted_hours', description: '' });
    await load();
    setBusy(false);
  }

  async function addReceiver(event: FormEvent) {
    event.preventDefault();
    if (!selectedPool || !receiverForm.target_id || busy) return;
    const weight = Number(receiverForm.weight);
    if (!Number.isFinite(weight) || weight <= 0) { setMessage('Receiver weight must be greater than zero.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('upsert_tip_pool_receiver', { p_pool_id: selectedPool, p_receiver_type: receiverForm.type, p_target_id: receiverForm.target_id, p_weight: weight });
    setMessage(error ? error.message : 'Tip receiver saved.');
    if (!error) setReceiverForm({ ...receiverForm, target_id: '', weight: '1' });
    await load();
    setBusy(false);
  }

  async function removeReceiver(id: string) {
    if (busy || !window.confirm('Remove this receiver from the pool?')) return;
    setBusy(true);
    const { error } = await supabase.rpc('remove_tip_pool_receiver', { p_receiver_id: id });
    setMessage(error ? error.message : 'Tip receiver removed.');
    await load();
    setBusy(false);
  }

  async function addContribution(event: FormEvent) {
    event.preventDefault();
    if (!run || run.status !== 'draft' || busy) return;
    const amount = Number(contributionForm.amount);
    if (!Number.isFinite(amount) || amount === 0) { setMessage('Contribution amount cannot be zero.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('add_tip_contribution', {
      p_run_id: run.id,
      p_amount: amount,
      p_source: contributionForm.source,
      p_employee_id: contributionForm.employee_id || null,
      p_role_id: contributionForm.role_id || null,
      p_note: contributionForm.note.trim() || null,
    });
    setMessage(error ? error.message : 'Tip contribution added. Regenerate distributions before finalizing.');
    if (!error) setContributionForm({ amount: '', source: 'manual', employee_id: '', role_id: '', note: '' });
    await loadRun();
    setBusy(false);
  }

  async function removeContribution(id: string) {
    if (busy || !window.confirm('Remove this draft contribution?')) return;
    setBusy(true);
    const { error } = await supabase.rpc('remove_tip_contribution', { p_contribution_id: id });
    setMessage(error ? error.message : 'Contribution removed.');
    await loadRun();
    setBusy(false);
  }

  async function generate() {
    if (!run || run.status !== 'draft' || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('generate_tip_distributions', { p_run_id: run.id });
    setMessage(error ? error.message : `Generated ${(data as any)?.recipients ?? 0} distributions totaling ${money((data as any)?.total_distributed)}.`);
    await loadRun();
    setBusy(false);
  }

  async function finalize() {
    if (!run || run.status !== 'draft' || busy || !window.confirm('Finalize this tip run? Finalized runs are immutable.')) return;
    setBusy(true);
    const { error } = await supabase.rpc('finalize_tip_pool_run', { p_run_id: run.id });
    setMessage(error ? error.message : 'Tip run finalized.');
    await load();
    setBusy(false);
  }

  async function cancelRun() {
    if (!run || run.status !== 'draft' || busy || !window.confirm('Cancel this draft tip run?')) return;
    setBusy(true);
    const { error } = await supabase.rpc('cancel_tip_pool_run', { p_run_id: run.id });
    setMessage(error ? error.message : 'Tip run cancelled.');
    await loadRun();
    setBusy(false);
  }

  function exportPayrollTips() {
    if (!payrollReport || !payPeriod) return;
    const rows = [['Employee', 'Finalized Tips', 'Eligible Hours', 'Tip Runs'], ...payrollReport.employees.map((item) => [item.full_name, item.tip_amount, item.eligible_hours, item.runs])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `el-molino-finalized-tips-${payPeriod.starts_on}-to-${payPeriod.ends_on}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const receiverLabel = (item: Receiver) => item.receiver_type === 'role' ? roles.find((role) => role.id === item.role_id)?.name || 'Role' : employees.find((employee) => employee.id === item.employee_id)?.full_name || 'Employee';
  const employeeName = (id: string | null) => id ? employees.find((item) => item.id === id)?.full_name || 'Employee' : 'Pool total';
  const roleName = (id: string | null) => id ? roles.find((item) => item.id === id)?.name || 'Role' : '';

  if (!ready) return <div className="full-loader"><span>Opening Tip Management…</span></div>;

  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <div><h1>Tip Management</h1><p>Multiple pools, approved-hours distribution, role weights, finalized employee tips and payroll-ready reporting.</p></div>
        <div className={styles.actions}><Link className={`${styles.button} ${styles.secondary}`} href="/time-clock/manage">Time Clocking</Link><Link className={styles.back} href="/tips">My Tips</Link></div>
      </div>
      {message && <div className={message.toLowerCase().includes('could not') ? styles.error : styles.notice}>{message}</div>}
      {!canManage ? <div className={styles.error}>Manager access is required.</div> : <>
        <section className={styles.section}><div className={styles.card}><div className={styles.entryHead}><div><h2>Employee visibility</h2><small>Employees can only see their own finalized distributions.</small></div><span className={styles.pill}>{employeeVisibility ? 'VISIBLE' : 'HIDDEN'}</span></div><div className={styles.formGrid}><label className={styles.field}><span>Show finalized tips to employees</span><input type="checkbox" checked={employeeVisibility} onChange={(event) => setEmployeeVisibility(event.target.checked)} /></label></div><div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={saveVisibility}>Save Visibility</button></div></div></section>

        <section className={styles.section}><div className={styles.card}><h2>{poolForm.id ? 'Edit tip pool' : 'Create tip pool'}</h2><form onSubmit={savePool}><div className={styles.formGrid}><label className={styles.field}><span>Name</span><input maxLength={120} value={poolForm.name} onChange={(event) => setPoolForm({ ...poolForm, name: event.target.value })} placeholder="FOH tip pool" /></label><label className={styles.field}><span>Cadence</span><select value={poolForm.cadence} onChange={(event) => setPoolForm({ ...poolForm, cadence: event.target.value as Pool['cadence'] })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="pay_period">Pay period</option></select></label><label className={styles.field}><span>Distribution</span><select value={poolForm.distribution_method} onChange={(event) => setPoolForm({ ...poolForm, distribution_method: event.target.value as Pool['distribution_method'] })}><option value="weighted_hours">Worked hours × role weight</option><option value="hours">Worked hours</option><option value="equal">Equal among recipients who worked</option></select></label><label className={styles.field}><span>Description</span><input maxLength={2000} value={poolForm.description} onChange={(event) => setPoolForm({ ...poolForm, description: event.target.value })} /></label></div><div className={styles.actions}><button className={styles.button} disabled={busy}>Save Pool</button>{poolForm.id && <button type="button" className={`${styles.button} ${styles.secondary}`} onClick={() => setPoolForm({ id: '', name: '', cadence: 'daily', distribution_method: 'weighted_hours', description: '' })}>Cancel Edit</button>}</div></form></div></section>

        <section className={styles.section}><h2>Tip pools</h2><div className={styles.actions}>{pools.map((item) => <button key={item.id} className={`${styles.button} ${selectedPool === item.id ? '' : styles.secondary}`} onClick={() => selectPool(item.id)}>{item.name}</button>)}</div>{!pools.length && <div className={styles.card}><b>Create the first tip pool above.</b></div>}</section>

        {pool && <>
          <section className={styles.section}><div className={styles.card}><div className={styles.entryHead}><div><h2>{pool.name}</h2><small>{pool.cadence.replaceAll('_', ' ')} · {pool.distribution_method.replaceAll('_', ' ')}</small></div><button className={`${styles.button} ${styles.secondary}`} onClick={() => setPoolForm({ id: pool.id, name: pool.name, cadence: pool.cadence, distribution_method: pool.distribution_method, description: pool.description || '' })}>Edit Pool</button></div><p>{pool.description || 'No description.'}</p></div></section>

          <section className={styles.section}><div className={styles.card}><h2>Receiving roles & employees</h2><p>Only configured recipients with approved worked hours in the run window receive a distribution. A configured role with no worked hours is automatically omitted and its share redistributes to those who worked.</p><form onSubmit={addReceiver}><div className={styles.formGrid}><label className={styles.field}><span>Receiver type</span><select value={receiverForm.type} onChange={(event) => setReceiverForm({ ...receiverForm, type: event.target.value as 'role' | 'employee', target_id: '' })}><option value="role">Role</option><option value="employee">Specific employee</option></select></label><label className={styles.field}><span>{receiverForm.type === 'role' ? 'Role' : 'Employee'}</span><select value={receiverForm.target_id} onChange={(event) => setReceiverForm({ ...receiverForm, target_id: event.target.value })}><option value="">Choose</option>{(receiverForm.type === 'role' ? roles : employees).map((item: any) => <option key={item.id} value={item.id}>{item.name || item.full_name}</option>)}</select></label><label className={styles.field}><span>Weight</span><input type="number" min="0.01" max="100" step="0.01" value={receiverForm.weight} onChange={(event) => setReceiverForm({ ...receiverForm, weight: event.target.value })} /></label></div><div className={styles.actions}><button className={styles.button} disabled={busy || !receiverForm.target_id}>Add / Update Receiver</button></div></form><div className={styles.details}>{runReceivers.map((item) => <div className={styles.detail} key={item.id}><b>{receiverLabel(item)}</b><span>{item.receiver_type} · weight {Number(item.weight).toFixed(2)}×</span><button className={`${styles.button} ${styles.secondary}`} onClick={() => removeReceiver(item.id)}>Remove</button></div>)}</div></div></section>

          <section className={styles.section}><div className={styles.card}><h2>Tip run</h2><div className={styles.formGrid}><label className={styles.field}><span>Reference date</span><input type="date" value={referenceDate} onChange={(event) => changeReferenceDate(event.target.value)} /></label></div>{run && <div className={styles.grid}><Metric label="Run window" value={`${run.starts_on} – ${run.ends_on}`} /><Metric label="Status" value={run.status.toUpperCase()} /><Metric label="Contributions" value={money(run.total_contributions)} /><Metric label="Distributed" value={money(run.total_distributed)} /></div>}</div></section>

          {run?.status === 'draft' && <section className={styles.section}><div className={styles.card}><h2>Add contribution</h2><form onSubmit={addContribution}><div className={styles.formGrid}><label className={styles.field}><span>Amount</span><input type="number" step="0.01" value={contributionForm.amount} onChange={(event) => setContributionForm({ ...contributionForm, amount: event.target.value })} /></label><label className={styles.field}><span>Source</span><select value={contributionForm.source} onChange={(event) => setContributionForm({ ...contributionForm, source: event.target.value })}><option value="manual">Manual</option><option value="adjustment">Adjustment</option></select></label><label className={styles.field}><span>Optional employee attribution</span><select value={contributionForm.employee_id} onChange={(event) => setContributionForm({ ...contributionForm, employee_id: event.target.value })}><option value="">Pool total</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label><label className={styles.field}><span>Optional role attribution</span><select value={contributionForm.role_id} onChange={(event) => setContributionForm({ ...contributionForm, role_id: event.target.value })}><option value="">No role</option>{roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className={styles.field}><span>Note</span><input maxLength={2000} value={contributionForm.note} onChange={(event) => setContributionForm({ ...contributionForm, note: event.target.value })} /></label></div><div className={styles.actions}><button className={styles.button} disabled={busy}>Add Contribution</button></div></form></div></section>}

          {run && <section className={styles.section}><h2>Contributions</h2><div className={styles.list}>{contributions.map((item) => <div className={styles.entry} key={item.id}><div className={styles.entryHead}><div><h3>{money(item.amount)}</h3><small>{item.source} · {employeeName(item.employee_id)}{item.role_id ? ` · ${roleName(item.role_id)}` : ''}{item.note ? ` · ${item.note}` : ''}</small></div>{run.status === 'draft' && <button className={`${styles.button} ${styles.secondary}`} onClick={() => removeContribution(item.id)}>Remove</button>}</div></div>)}{!contributions.length && <div className={styles.card}><b>No contributions yet.</b></div>}</div></section>}

          {run && <section className={styles.section}><div className={styles.card}><div className={styles.actions}>{run.status === 'draft' && <><button className={styles.button} disabled={busy} onClick={generate}>Generate Distributions</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy || !distributions.length} onClick={finalize}>Finalize Run</button><button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={cancelRun}>Cancel Draft</button></>}{run.status === 'final' && <span className={styles.pill}>FINAL · IMMUTABLE</span>}</div></div></section>}

          {run && <section className={styles.section}><h2>Distributions</h2><div className={styles.list}>{distributions.map((item) => <div className={styles.entry} key={item.id}><div className={styles.entryHead}><div><h3>{employeeName(item.employee_id)}</h3><small>{Number(item.eligible_hours).toFixed(2)} eligible hrs · weight {Number(item.receiver_weight).toFixed(2)}× · basis {Number(item.distribution_basis).toFixed(2)}</small></div><strong>{money(item.amount)}</strong></div></div>)}{!distributions.length && <div className={styles.card}><b>Generate distributions after entering contributions and receiver rules.</b></div>}</div></section>}
        </>}

        {payPeriod && payrollReport && <section className={styles.section}><div className={styles.card}><div className={styles.entryHead}><div><h2>Current pay-period finalized tips</h2><small>{payPeriod.starts_on} – {payPeriod.ends_on}</small></div><strong>{money(payrollReport.total_distributed)}</strong></div>{payrollReport.partially_overlapping_runs_excluded > 0 && <div className={styles.notice}>{payrollReport.partially_overlapping_runs_excluded} finalized run(s) overlap only part of this pay period and are intentionally excluded from the payroll total.</div>}<div className={styles.details}>{payrollReport.employees.map((item) => <div className={styles.detail} key={item.employee_id}><b>{item.full_name}</b><span>{money(item.tip_amount)} · {Number(item.eligible_hours).toFixed(2)} eligible hrs · {item.runs} run(s)</span></div>)}</div><div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} onClick={exportPayrollTips}>Export Payroll Tips CSV</button></div></div></section>}

        <section className={styles.section}><div className={styles.notice}><b>No money-transfer rail is built into this page.</b><small style={{ display: 'block', marginTop: 6 }}>This manages tip pooling, employee visibility and payroll-ready reporting. It does not pretend to replace a regulated wage-payment or bank-transfer service.</small></div></section>
      </>}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong></div>; }
