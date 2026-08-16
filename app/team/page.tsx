'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import styles from '../ops-tools.module.css';

type Profile = { app_role: 'admin' | 'manager' | 'employee'; location_id: string | null };
type Employee = { id: string; full_name: string };
type Role = { id: string; name: string; department: string | null };
type Announcement = { id: string; title: string; body: string; priority: string; expires_at: string | null; sent_by: string; sent_at: string; archived_at: string | null };
type Recipient = { announcement_id: string; employee_id: string; read_at: string | null; reminder_count: number; last_reminded_at: string | null };
type Shoutout = { id: string; from_employee_id: string; to_employee_id: string; category: string; message: string; created_at: string; hidden_at: string | null };
type Reaction = { shoutout_id: string; employee_id: string; reaction: string; created_at: string };

type AnnouncementForm = { title: string; body: string; priority: 'normal' | 'important' | 'urgent'; roleIds: string[]; departments: string[]; employeeIds: string[]; expiresAt: string };
type ShoutoutForm = { toEmployeeId: string; category: string; message: string };

const emptyAnnouncement = (): AnnouncementForm => ({ title: '', body: '', priority: 'normal', roleIds: [], departments: [], employeeIds: [], expiresAt: '' });
const emptyShoutout = (): ShoutoutForm => ({ toEmployeeId: '', category: 'great_job', message: '' });
const categoryLabel = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function TeamCommunicationsPage() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [shoutouts, setShoutouts] = useState<Shoutout[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementForm>(emptyAnnouncement());
  const [shoutoutForm, setShoutoutForm] = useState<ShoutoutForm>(emptyShoutout());
  const [showArchived, setShowArchived] = useState(false);
  const canManage = profile?.app_role === 'admin' || profile?.app_role === 'manager';
  const departments = useMemo(() => Array.from(new Set(roles.map((role) => role.department).filter(Boolean) as string[])).sort(), [roles]);

  useEffect(() => { void init(); }, []);

  async function init() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { location.href = '/'; return; }
    const profileResult = await supabase.from('profiles').select('app_role,location_id').eq('id', userData.user.id).single();
    if (profileResult.error || !profileResult.data?.location_id) {
      setMessage('Could not load Team Communications.');
      setReady(true);
      return;
    }
    const nextProfile = profileResult.data as Profile;
    setProfile(nextProfile);
    const employeeResult = await supabase.rpc('time_clock_employee_id_for_user', {});
    if (!employeeResult.error) setMyEmployeeId((employeeResult.data as string | null) || null);
    await load(nextProfile);
    setReady(true);
  }

  async function load(nextProfile = profile) {
    if (!nextProfile?.location_id) return;
    setBusy(true);
    try {
      const [employeeResult, roleResult, announcementResult, recipientResult, shoutoutResult, reactionResult] = await Promise.all([
        supabase.from('employees').select('id,full_name').eq('location_id', nextProfile.location_id).eq('active', true).is('deleted_at', null).order('full_name'),
        supabase.from('employee_roles').select('id,name,department').eq('location_id', nextProfile.location_id).order('name'),
        supabase.from('team_announcements').select('id,title,body,priority,expires_at,sent_by,sent_at,archived_at').eq('location_id', nextProfile.location_id).order('sent_at', { ascending: false }).limit(100),
        supabase.from('team_announcement_recipients').select('announcement_id,employee_id,read_at,reminder_count,last_reminded_at').eq('location_id', nextProfile.location_id),
        supabase.from('team_shoutouts').select('id,from_employee_id,to_employee_id,category,message,created_at,hidden_at').eq('location_id', nextProfile.location_id).order('created_at', { ascending: false }).limit(100),
        supabase.from('team_shoutout_reactions').select('shoutout_id,employee_id,reaction,created_at').eq('location_id', nextProfile.location_id),
      ]);
      for (const result of [employeeResult, roleResult, announcementResult, recipientResult, shoutoutResult, reactionResult]) if (result.error) throw result.error;
      setEmployees((employeeResult.data ?? []) as Employee[]);
      setRoles((roleResult.data ?? []) as Role[]);
      setAnnouncements((announcementResult.data ?? []) as Announcement[]);
      setRecipients((recipientResult.data ?? []) as Recipient[]);
      setShoutouts((shoutoutResult.data ?? []) as Shoutout[]);
      setReactions((reactionResult.data ?? []) as Reaction[]);
    } catch (error: any) {
      setMessage(error?.message || 'Could not load Team Communications.');
    } finally {
      setBusy(false);
    }
  }

  async function sendAnnouncement(event: FormEvent) {
    event.preventDefault();
    if (!canManage || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('send_team_announcement', {
      p_title: announcementForm.title.trim(),
      p_body: announcementForm.body.trim(),
      p_priority: announcementForm.priority,
      p_role_ids: announcementForm.roleIds.length ? announcementForm.roleIds : null,
      p_departments: announcementForm.departments.length ? announcementForm.departments : null,
      p_employee_ids: announcementForm.employeeIds.length ? announcementForm.employeeIds : null,
      p_expires_at: announcementForm.expiresAt ? new Date(announcementForm.expiresAt).toISOString() : null,
    });
    setMessage(error ? error.message : `Announcement sent to ${Number((data as any)?.recipients || 0)} employee${Number((data as any)?.recipients || 0) === 1 ? '' : 's'}.`);
    if (!error) setAnnouncementForm(emptyAnnouncement());
    await load();
    setBusy(false);
  }

  async function markRead(id: string) {
    setBusy(true);
    const { error } = await supabase.rpc('mark_team_announcement_read', { p_announcement_id: id });
    setMessage(error ? error.message : 'Announcement marked read.');
    await load();
    setBusy(false);
  }

  async function remindUnread(id: string) {
    if (!canManage || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('remind_unread_team_announcement', { p_announcement_id: id });
    setMessage(error ? error.message : `${Number(data || 0)} unread recipient${Number(data || 0) === 1 ? '' : 's'} reminded.`);
    await load();
    setBusy(false);
  }

  async function archiveAnnouncement(id: string) {
    if (!canManage || busy || !window.confirm('Archive this announcement? Read receipts remain in history.')) return;
    setBusy(true);
    const { error } = await supabase.rpc('archive_team_announcement', { p_announcement_id: id });
    setMessage(error ? error.message : 'Announcement archived.');
    await load();
    setBusy(false);
  }

  async function createShoutout(event: FormEvent) {
    event.preventDefault();
    if (!myEmployeeId || busy || !shoutoutForm.toEmployeeId) return;
    setBusy(true);
    const { error } = await supabase.rpc('create_team_shoutout', {
      p_to_employee_id: shoutoutForm.toEmployeeId,
      p_category: shoutoutForm.category,
      p_message: shoutoutForm.message.trim(),
    });
    setMessage(error ? error.message : 'Shout-out posted.');
    if (!error) setShoutoutForm(emptyShoutout());
    await load();
    setBusy(false);
  }

  async function toggleReaction(shoutoutId: string, reaction: string) {
    if (!myEmployeeId || busy) return;
    const mine = reactions.some((item) => item.shoutout_id === shoutoutId && item.employee_id === myEmployeeId && item.reaction === reaction);
    setBusy(true);
    const result = mine
      ? await supabase.rpc('remove_team_shoutout_reaction', { p_shoutout_id: shoutoutId, p_reaction: reaction })
      : await supabase.rpc('react_to_team_shoutout', { p_shoutout_id: shoutoutId, p_reaction: reaction });
    setMessage(result.error ? result.error.message : 'Reaction updated.');
    await load();
    setBusy(false);
  }

  async function hideShoutout(id: string) {
    if (!canManage || busy || !window.confirm('Hide this shout-out from the employee feed?')) return;
    setBusy(true);
    const { error } = await supabase.rpc('hide_team_shoutout', { p_shoutout_id: id });
    setMessage(error ? error.message : 'Shout-out hidden from employees.');
    await load();
    setBusy(false);
  }

  function toggleArray(key: 'roleIds' | 'departments' | 'employeeIds', value: string) {
    const current = announcementForm[key];
    setAnnouncementForm({ ...announcementForm, [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] });
  }

  const employeeName = (id: string) => employees.find((item) => item.id === id)?.full_name || 'Employee';
  const visibleAnnouncements = announcements.filter((item) => showArchived || !item.archived_at);
  const visibleShoutouts = shoutouts.filter((item) => canManage || !item.hidden_at);

  if (!ready) return <div className="full-loader"><span>Opening Team Communications…</span></div>;

  return (
    <main className={styles.page}>
      <div className={styles.top}>
        <div><h1>Team Communications</h1><p>Targeted manager announcements, read receipts, reminders, recognition and existing team chat in one place.</p></div>
        <div className={styles.actions}><Link className={`${styles.button} ${styles.secondary}`} href="/discussions">Open Team Chat</Link><Link className={styles.back} href="/">Back to Ops</Link></div>
      </div>
      {message && <div className={message.toLowerCase().includes('could not') ? styles.error : styles.notice}>{message}</div>}

      {canManage && <section className={styles.section}><div className={styles.card}><h2>Send announcement</h2><p>If no audience boxes are selected, the announcement goes to every active employee at this location. Recipients are snapshotted when you send it.</p><form onSubmit={sendAnnouncement}><div className={styles.formGrid}><label className={styles.field}><span>Title</span><input maxLength={160} value={announcementForm.title} onChange={(event) => setAnnouncementForm({ ...announcementForm, title: event.target.value })} /></label><label className={styles.field}><span>Priority</span><select value={announcementForm.priority} onChange={(event) => setAnnouncementForm({ ...announcementForm, priority: event.target.value as AnnouncementForm['priority'] })}><option value="normal">Normal</option><option value="important">Important</option><option value="urgent">Urgent</option></select></label><label className={styles.field}><span>Expires at · optional</span><input type="datetime-local" value={announcementForm.expiresAt} onChange={(event) => setAnnouncementForm({ ...announcementForm, expiresAt: event.target.value })} /></label><label className={styles.field}><span>Message</span><textarea rows={5} maxLength={10000} value={announcementForm.body} onChange={(event) => setAnnouncementForm({ ...announcementForm, body: event.target.value })} /></label></div><h3>Departments</h3><div className={styles.actions}>{departments.map((department) => <label className={styles.detail} key={department}><b>{department.toUpperCase()}</b><input type="checkbox" checked={announcementForm.departments.includes(department)} onChange={() => toggleArray('departments', department)} /></label>)}</div><h3>Roles</h3><div className={styles.actions}>{roles.map((role) => <label className={styles.detail} key={role.id}><b>{role.name}</b><input type="checkbox" checked={announcementForm.roleIds.includes(role.id)} onChange={() => toggleArray('roleIds', role.id)} /></label>)}</div><h3>Specific employees</h3><div className={styles.actions}>{employees.map((employee) => <label className={styles.detail} key={employee.id}><b>{employee.full_name}</b><input type="checkbox" checked={announcementForm.employeeIds.includes(employee.id)} onChange={() => toggleArray('employeeIds', employee.id)} /></label>)}</div><div className={styles.actions}><button className={styles.button} disabled={busy || !announcementForm.title.trim() || !announcementForm.body.trim()}>Send Announcement</button></div></form></div></section>}

      <section className={styles.section}><div className={styles.entryHead}><div><h2>Announcements</h2><small>{canManage ? 'Managers can see the recipient/read roster.' : 'Only announcements addressed to you appear here.'}</small></div>{canManage && <label className={styles.detail}><b>Show archived</b><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /></label>}</div><div className={styles.list}>{visibleAnnouncements.map((item) => { const rows = recipients.filter((recipient) => recipient.announcement_id === item.id); const mine = rows.find((recipient) => recipient.employee_id === myEmployeeId); const unread = rows.filter((recipient) => !recipient.read_at); const read = rows.filter((recipient) => recipient.read_at); return <div className={styles.entry} key={item.id}><div className={styles.entryHead}><div><h3>{item.title}</h3><small>{new Date(item.sent_at).toLocaleString()} · {item.priority}{item.expires_at ? ` · expires ${new Date(item.expires_at).toLocaleString()}` : ''}{item.archived_at ? ' · archived' : ''}</small></div><span className={styles.pill}>{canManage ? `${read.length}/${rows.length} read` : mine?.read_at ? 'READ' : 'UNREAD'}</span></div><p style={{ whiteSpace: 'pre-wrap' }}>{item.body}</p>{canManage && <div className={styles.details}><div className={styles.detail}><b>Read</b><span>{read.length ? read.map((recipient) => employeeName(recipient.employee_id)).join(', ') : 'None yet'}</span></div><div className={styles.detail}><b>Unread</b><span>{unread.length ? unread.map((recipient) => `${employeeName(recipient.employee_id)}${recipient.reminder_count ? ` · reminded ${recipient.reminder_count}×` : ''}`).join(', ') : 'Everyone has read it'}</span></div></div>}<div className={styles.actions}>{!canManage && mine && !mine.read_at && <button className={styles.button} disabled={busy} onClick={() => markRead(item.id)}>Mark Read</button>}{canManage && unread.length > 0 && !item.archived_at && <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => remindUnread(item.id)}>Remind Unread</button>}{canManage && !item.archived_at && <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => archiveAnnouncement(item.id)}>Archive</button>}</div></div>; })}{!visibleAnnouncements.length && <div className={styles.card}><b>No announcements to show.</b></div>}</div></section>

      <section className={styles.section}><div className={styles.card}><h2>Give a shout-out</h2>{!myEmployeeId ? <div className={styles.error}>Your login must be linked to an active employee before you can post recognition.</div> : <form onSubmit={createShoutout}><div className={styles.formGrid}><label className={styles.field}><span>Teammate</span><select value={shoutoutForm.toEmployeeId} onChange={(event) => setShoutoutForm({ ...shoutoutForm, toEmployeeId: event.target.value })}><option value="">Choose teammate</option>{employees.filter((employee) => employee.id !== myEmployeeId).map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></label><label className={styles.field}><span>Recognition</span><select value={shoutoutForm.category} onChange={(event) => setShoutoutForm({ ...shoutoutForm, category: event.target.value })}>{['great_job','teamwork','guest_service','leadership','hustle','growth','other'].map((value) => <option key={value} value={value}>{categoryLabel(value)}</option>)}</select></label><label className={styles.field}><span>Message</span><textarea rows={3} maxLength={1000} value={shoutoutForm.message} onChange={(event) => setShoutoutForm({ ...shoutoutForm, message: event.target.value })} /></label></div><div className={styles.actions}><button className={styles.button} disabled={busy || !shoutoutForm.toEmployeeId || !shoutoutForm.message.trim()}>Post Shout-out</button></div></form>}</div></section>

      <section className={styles.section}><h2>Recognition feed</h2><div className={styles.list}>{visibleShoutouts.map((item) => { const itemReactions = reactions.filter((reaction) => reaction.shoutout_id === item.id); return <div className={styles.entry} key={item.id}><div className={styles.entryHead}><div><h3>{employeeName(item.from_employee_id)} → {employeeName(item.to_employee_id)}</h3><small>{categoryLabel(item.category)} · {new Date(item.created_at).toLocaleString()}{item.hidden_at ? ' · hidden from employees' : ''}</small></div><span className={styles.pill}>{itemReactions.length} reaction{itemReactions.length === 1 ? '' : 's'}</span></div><p>{item.message}</p><div className={styles.actions}>{['applause','heart','fire','thanks'].map((reaction) => { const count = itemReactions.filter((row) => row.reaction === reaction).length; const mine = itemReactions.some((row) => row.reaction === reaction && row.employee_id === myEmployeeId); return <button key={reaction} className={`${styles.button} ${mine ? '' : styles.secondary}`} disabled={busy || !myEmployeeId || Boolean(item.hidden_at)} onClick={() => toggleReaction(item.id, reaction)}>{categoryLabel(reaction)}{count ? ` ${count}` : ''}</button>; })}{canManage && !item.hidden_at && <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => hideShoutout(item.id)}>Hide</button>}</div></div>; })}{!visibleShoutouts.length && <div className={styles.card}><b>No shout-outs yet.</b></div>}</div></section>
    </main>
  );
}
