'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useI18n } from '@/lib/i18n';
import styles from '../../ops-tools.module.css';
import { businessDateInZone } from '@/lib/intermediate-hardening';
import { addDateDays, dateDayOfWeek } from '@/lib/scheduling-engine';

type Profile = { app_role: 'admin' | 'manager' | 'employee'; location_id: string | null };
type Period = { id: string; starts_on: string; ends_on: string; status: string; revision: number };
type Template = { id: string; name: string; description: string | null; active: boolean; created_at: string; updated_at: string };
type Shift = { id: string; employee_id: string | null; role_id: string | null; starts_at: string; ends_at: string; status: string; notes: string | null };
type Employee = { id: string; full_name: string };
type Role = { id: string; name: string };

const mondayOf = (date: string) => addDateDays(date, -((dateDayOfWeek(date) + 6) % 7));

export default function ScheduleTemplatesPage() {
  const { locale } = useI18n();
  const t = (en: string, es: string) => locale === 'es' ? es : en;
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weekStart, setWeekStart] = useState(() => mondayOf(businessDateInZone()));
  const [period, setPeriod] = useState<Period | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [sourcePeriod, setSourcePeriod] = useState('');
  const [copyAssignments, setCopyAssignments] = useState(true);
  const [templateForm, setTemplateForm] = useState({ name: '', description: '', include_assignments: true });
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [applyMode, setApplyMode] = useState<'merge' | 'replace'>('merge');
  const [applyAssignments, setApplyAssignments] = useState(true);
  const [repeatShift, setRepeatShift] = useState('');
  const [repeatDates, setRepeatDates] = useState<string[]>([]);
  const [repeatAssignment, setRepeatAssignment] = useState(true);

  const canManage = profile?.app_role === 'admin' || profile?.app_role === 'manager';
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDateDays(weekStart, index)),
    [weekStart],
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
    const result = await supabase
      .from('profiles')
      .select('app_role,location_id')
      .eq('id', userData.user.id)
      .single();
    if (result.error || !result.data?.location_id) {
      setMessage(t('Could not load schedule templates.','No se pudieron cargar las plantillas de horarios.'));
      setReady(true);
      return;
    }
    const nextProfile = result.data as Profile;
    setProfile(nextProfile);
    await load(nextProfile, weekStart);
    setReady(true);
  }

  async function load(nextProfile = profile, nextWeekStart = weekStart) {
    if (!nextProfile?.location_id) return;
    setBusy(true);
    try {
      if (!(nextProfile.app_role === 'admin' || nextProfile.app_role === 'manager')) return;
      const periodResult = await supabase.rpc('ensure_schedule_period', { p_starts_on: nextWeekStart });
      if (periodResult.error) throw periodResult.error;
      const current = periodResult.data as Period;
      setPeriod(current);

      const [periodResultList, templateResult, shiftResult, employeeResult, roleResult] = await Promise.all([
        supabase
          .from('schedule_periods')
          .select('id,starts_on,ends_on,status,revision')
          .eq('location_id', nextProfile.location_id)
          .order('starts_on', { ascending: false })
          .limit(30),
        supabase
          .from('schedule_templates')
          .select('id,name,description,active,created_at,updated_at')
          .eq('location_id', nextProfile.location_id)
          .eq('active', true)
          .order('name'),
        supabase
          .from('schedule_shifts')
          .select('id,employee_id,role_id,starts_at,ends_at,status,notes')
          .eq('schedule_period_id', current.id)
          .neq('status', 'cancelled')
          .order('starts_at'),
        supabase
          .from('employees')
          .select('id,full_name')
          .eq('location_id', nextProfile.location_id)
          .eq('active', true)
          .is('deleted_at', null),
        supabase.from('employee_roles').select('id,name').eq('location_id', nextProfile.location_id),
      ]);

      for (const result of [periodResultList, templateResult, shiftResult, employeeResult, roleResult]) {
        if (result.error) throw result.error;
      }

      const periodList = (periodResultList.data ?? []) as Period[];
      setPeriods(periodList);
      setTemplates((templateResult.data ?? []) as Template[]);
      setShifts((shiftResult.data ?? []) as Shift[]);
      setEmployees((employeeResult.data ?? []) as Employee[]);
      setRoles((roleResult.data ?? []) as Role[]);

      if (!sourcePeriod) {
        const source = periodList.find((item) => item.id !== current.id);
        if (source) setSourcePeriod(source.id);
      }
      if (!selectedTemplate && templateResult.data?.length) {
        setSelectedTemplate(templateResult.data[0].id);
      }
    } catch (error: any) {
      setMessage(error?.message || t('Could not load schedule templates.','No se pudieron cargar las plantillas de horarios.'));
    } finally {
      setBusy(false);
    }
  }

  async function changeWeek(days: number) {
    if (busy) return;
    const nextWeekStart = addDateDays(weekStart, days);
    setWeekStart(nextWeekStart);
    setRepeatDates([]);
    setRepeatShift('');
    await load(profile, nextWeekStart);
  }

  async function copyWeek() {
    if (!period || !sourcePeriod || busy) return;
    if (
      shifts.length &&
      !window.confirm(
        t('The target week already has shifts. Whole-week Copy requires an empty target. Continue and let the database validate it?','La semana de destino ya tiene turnos. Copiar la semana completa requiere un destino vacío. ¿Continuar y dejar que la base de datos lo valide?'),
      )
    ) {
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('copy_schedule_period', {
      p_source_period_id: sourcePeriod,
      p_target_period_id: period.id,
      p_expected_revision: period.revision,
      p_copy_assignments: copyAssignments,
    });
    setMessage(error ? error.message : `${t('Copied','Se copiaron')} ${(data as any)?.copied ?? 0} ${t('shifts into this week.','turnos en esta semana.')}`);
    await load();
    setBusy(false);
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    if (!period || busy || !templateForm.name.trim()) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('save_schedule_period_as_template', {
      p_period_id: period.id,
      p_name: templateForm.name.trim(),
      p_description: templateForm.description.trim() || null,
      p_include_assignments: templateForm.include_assignments,
    });
    setMessage(error ? error.message : data?t('Template saved successfully.','Plantilla guardada correctamente.'):t('Template saved.','Plantilla guardada.'));
    if (!error) setTemplateForm({ ...templateForm, name: '', description: '' });
    await load();
    setBusy(false);
  }

  async function applyTemplate() {
    if (!period || !selectedTemplate || busy) return;
    if (
      applyMode === 'replace' &&
      !window.confirm(t('Replace will remove the current draft shifts and rebuild the week from this template. Continue?','Reemplazar eliminará los turnos actuales del borrador y reconstruirá la semana con esta plantilla. ¿Continuar?'))
    ) {
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('apply_schedule_template', {
      p_template_id: selectedTemplate,
      p_target_period_id: period.id,
      p_expected_revision: period.revision,
      p_mode: applyMode,
      p_copy_assignments: applyAssignments,
    });
    setMessage(error ? error.message : `${t('Template applied:','Plantilla aplicada:')} ${(data as any)?.copied ?? 0} ${t('shifts.','turnos.')}`);
    await load();
    setBusy(false);
  }

  async function repeatSelected() {
    if (!repeatShift || !repeatDates.length || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('duplicate_schedule_shift', {
      p_shift_id: repeatShift,
      p_target_dates: repeatDates,
      p_copy_assignment: repeatAssignment,
    });
    const count = Number((data as any)?.copied || 0);
    setMessage(error ? error.message : `${t('Repeated','Se repitieron')} ${count} ${count === 1 ? t('shift','turno') : t('shifts','turnos')}.`);
    if (!error) setRepeatDates([]);
    await load();
    setBusy(false);
  }

  const employeeName = (id: string | null) => employees.find((item) => item.id === id)?.full_name || t('Open','Abierto');
  const roleName = (id: string | null) => roles.find((item) => item.id === id)?.name || t('Role','Puesto');
  const selectedShift = shifts.find((item) => item.id === repeatShift);
  const selectedDate = selectedShift ? new Date(selectedShift.starts_at).toISOString().slice(0, 10) : '';

  if (!ready) return <div className="full-loader"><span>{t('Opening templates…','Abriendo plantillas…')}</span></div>;

  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <div>
          <h1>{t('Copy & Templates','Copiar y Plantillas')}</h1>
          <p>{t('Copy a whole schedule, save reusable named layouts, merge or replace a week, and repeat individual shifts.','Copia un horario completo, guarda diseños reutilizables, combina o reemplaza una semana y repite turnos individuales.')}</p>
        </div>
        <Link className={styles.back} href="/schedule">{t('Back to Schedule','Volver al Horario')}</Link>
      </div>

      {message && <div className={message.toLowerCase().includes('could not') || message.toLowerCase().includes('no se pudieron') ? styles.error : styles.notice}>{message}</div>}

      {!canManage ? (
        <div className={styles.error}>{t('Manager access is required.','Se requiere acceso gerencial.')}</div>
      ) : (
        <>
          <section className={styles.section}>
            <div className={styles.card}>
              <div className={styles.entryHead}>
                <div>
                  <h2>{t('Target week','Semana de destino')} · {weekStart}</h2>
                  <small>{period?.status || 'draft'} · {t('revision','revisión')} {period?.revision ?? 0} · {shifts.length} {t('current shifts','turnos actuales')}</small>
                </div>
                <div className={styles.actions}>
                  <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => changeWeek(-7)}>{t('Previous','Anterior')}</button>
                  <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => changeWeek(7)}>{t('Next','Siguiente')}</button>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.card}>
              <h2>{t('Copy another week','Copiar otra semana')}</h2>
              <p>{t('Whole-week copy requires an empty draft target. Choose whether to keep employee assignments or copy the structure as open shifts.','Copiar la semana completa requiere un borrador de destino vacío. Elige conservar asignaciones o copiar la estructura como turnos abiertos.')}</p>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>{t('Source week','Semana de origen')}</span>
                  <select value={sourcePeriod} onChange={(event) => setSourcePeriod(event.target.value)}>
                    <option value="">{t('Choose week','Elegir semana')}</option>
                    {periods.filter((item) => item.id !== period?.id).map((item) => (
                      <option key={item.id} value={item.id}>{item.starts_on} · {item.status}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>{t('Keep assignments','Conservar asignaciones')}</span>
                  <input type="checkbox" checked={copyAssignments} onChange={(event) => setCopyAssignments(event.target.checked)} />
                </label>
              </div>
              <div className={styles.actions}>
                <button className={styles.button} disabled={busy || !sourcePeriod || period?.status !== 'draft'} onClick={copyWeek}>{t('Copy Week','Copiar Semana')}</button>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.card}>
              <h2>{t('Save this week as a named template','Guardar esta semana como plantilla')}</h2>
              <form onSubmit={saveTemplate}>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>{t('Template name','Nombre de plantilla')}</span>
                    <input maxLength={120} value={templateForm.name} onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })} placeholder={t('Summer FOH','Verano FOH')} />
                  </label>
                  <label className={styles.field}>
                    <span>{t('Description','Descripción')}</span>
                    <input maxLength={2000} value={templateForm.description} onChange={(event) => setTemplateForm({ ...templateForm, description: event.target.value })} />
                  </label>
                  <label className={styles.field}>
                    <span>{t('Remember employee assignments','Recordar asignaciones de empleados')}</span>
                    <input type="checkbox" checked={templateForm.include_assignments} onChange={(event) => setTemplateForm({ ...templateForm, include_assignments: event.target.checked })} />
                  </label>
                </div>
                <div className={styles.actions}>
                  <button className={styles.button} disabled={busy || !period}>{t('Save Template','Guardar Plantilla')}</button>
                </div>
              </form>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.card}>
              <h2>{t('Apply named template','Aplicar plantilla guardada')}</h2>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>{t('Template','Plantilla')}</span>
                  <select value={selectedTemplate} onChange={(event) => setSelectedTemplate(event.target.value)}>
                    <option value="">{t('Choose template','Elegir plantilla')}</option>
                    {templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>{t('Mode','Modo')}</span>
                  <select value={applyMode} onChange={(event) => setApplyMode(event.target.value as 'merge' | 'replace')}>
                    <option value="merge">{t('Merge with existing draft','Combinar con borrador existente')}</option>
                    <option value="replace">{t('Replace existing draft','Reemplazar borrador existente')}</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>{t('Use saved assignments','Usar asignaciones guardadas')}</span>
                  <input type="checkbox" checked={applyAssignments} onChange={(event) => setApplyAssignments(event.target.checked)} />
                </label>
              </div>
              {selectedTemplate && <p>{templates.find((item) => item.id === selectedTemplate)?.description || t('No template description.','Sin descripción de plantilla.')}</p>}
              <div className={styles.actions}>
                <button className={styles.button} disabled={busy || !selectedTemplate || period?.status !== 'draft'} onClick={applyTemplate}>{t('Apply Template','Aplicar Plantilla')}</button>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.card}>
              <h2>{t('Repeat / duplicate one shift','Repetir / duplicar un turno')}</h2>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>{t('Shift','Turno')}</span>
                  <select value={repeatShift} onChange={(event) => { setRepeatShift(event.target.value); setRepeatDates([]); }}>
                    <option value="">{t('Choose shift','Elegir turno')}</option>
                    {shifts.map((shift) => (
                      <option key={shift.id} value={shift.id}>
                        {new Date(shift.starts_at).toLocaleString()} · {employeeName(shift.employee_id)} · {roleName(shift.role_id)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>{t('Keep employee assignment','Conservar asignación del empleado')}</span>
                  <input type="checkbox" checked={repeatAssignment} onChange={(event) => setRepeatAssignment(event.target.checked)} />
                </label>
              </div>
              {selectedShift && (
                <div className={styles.details}>
                  {weekDates.filter((date) => date !== selectedDate).map((date) => (
                    <label className={styles.detail} key={date}>
                      <b>{date}</b>
                      <input
                        type="checkbox"
                        checked={repeatDates.includes(date)}
                        onChange={(event) => setRepeatDates(event.target.checked ? [...repeatDates, date] : repeatDates.filter((item) => item !== date))}
                      />
                    </label>
                  ))}
                </div>
              )}
              <div className={styles.actions}>
                <button className={styles.button} disabled={busy || !repeatShift || !repeatDates.length || period?.status !== 'draft'} onClick={repeatSelected}>{t('Repeat Shift','Repetir Turno')}</button>
              </div>
              <p>{t('The database rechecks overlap, availability, time off, qualification, skill level, rest, weekly hours and consecutive-day rules for every repeated assigned shift.','La base de datos vuelve a verificar cruces, disponibilidad, ausencias, calificación, nivel, descanso, horas semanales y días consecutivos para cada turno asignado repetido.')}</p>
            </div>
          </section>

          <section className={styles.section}>
            <h2>{t('Saved templates','Plantillas guardadas')}</h2>
            <div className={styles.list}>
              {templates.map((item) => (
                <div className={styles.entry} key={item.id}>
                  <div className={styles.entryHead}>
                    <div>
                      <h3>{item.name}</h3>
                      <small>{item.description || t('No description','Sin descripción')} · {t('updated','actualizada')} {new Date(item.updated_at).toLocaleString()}</small>
                    </div>
                    <span className={styles.pill}>{t('active','activa')}</span>
                  </div>
                </div>
              ))}
              {!templates.length && <div className={styles.card}><b>{t('No named templates yet.','Aún no hay plantillas guardadas.')}</b></div>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
