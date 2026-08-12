'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { BookOpen, Bot, CheckCircle2, ClipboardCheck, Home, LogOut, Plus, Sparkles, Users, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Tab = 'home' | 'knowledge' | 'operations' | 'team' | 'ai';

type Profile = { full_name: string | null; app_role: 'admin' | 'manager' | 'employee'; location_id: string | null };
type Area = { id: string; name: string };
type Station = { id: string; name: string; description: string | null; area_id: string };
type KnowledgeItem = { id: string; title: string; content: string; status: string; station_id: string | null; category: string | null };
type Procedure = { id: string; title: string; description: string | null; status: string; station_id: string | null };
type Role = { id: string; name: string };
type Employee = { id: string; full_name: string; phone: string | null; active: boolean };

export default function AppPage() {
  const [sessionReady, setSessionReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const [areas, setAreas] = useState<Area[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [stationName, setStationName] = useState('');
  const [stationDescription, setStationDescription] = useState('');
  const [knowledgeTitle, setKnowledgeTitle] = useState('');
  const [knowledgeContent, setKnowledgeContent] = useState('');
  const [selectedStation, setSelectedStation] = useState('');
  const [procedureTitle, setProcedureTitle] = useState('');
  const [procedureDescription, setProcedureDescription] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeePhone, setEmployeePhone] = useState('');

  const canManage = profile?.app_role === 'admin' || profile?.app_role === 'manager';
  const kitchenArea = useMemo(() => areas.find((a) => a.name === 'Kitchen'), [areas]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
      setSessionReady(true);
      if (data.session) void loadAll();
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      if (session) void loadAll();
      else setProfile(null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadAll() {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;

    const [profileRes, areaRes, stationRes, knowledgeRes, procedureRes, roleRes, employeeRes] = await Promise.all([
      supabase.from('profiles').select('full_name, app_role, location_id').eq('id', authData.user.id).single(),
      supabase.from('areas').select('id, name').order('name'),
      supabase.from('stations').select('id, name, description, area_id').order('created_at', { ascending: false }),
      supabase.from('knowledge_items').select('id, title, content, status, station_id, category').order('created_at', { ascending: false }).limit(20),
      supabase.from('procedures').select('id, title, description, status, station_id').order('created_at', { ascending: false }).limit(20),
      supabase.from('employee_roles').select('id, name').order('name'),
      supabase.from('employees').select('id, full_name, phone, active').order('full_name'),
    ]);

    if (profileRes.data) setProfile(profileRes.data as Profile);
    setAreas((areaRes.data ?? []) as Area[]);
    setStations((stationRes.data ?? []) as Station[]);
    setKnowledge((knowledgeRes.data ?? []) as KnowledgeItem[]);
    setProcedures((procedureRes.data ?? []) as Procedure[]);
    setRoles((roleRes.data ?? []) as Role[]);
    setEmployees((employeeRes.data ?? []) as Employee[]);
  }

  async function handleAuth(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
        if (error) throw error;
        setMessage('Account created. If Supabase asks you to confirm your email, confirm it and then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  async function createStation(e: FormEvent) {
    e.preventDefault();
    if (!kitchenArea || !stationName.trim()) return;
    const { error } = await supabase.from('stations').insert({ area_id: kitchenArea.id, name: stationName.trim(), description: stationDescription.trim() || null });
    if (error) return setMessage(error.message);
    setStationName('');
    setStationDescription('');
    setMessage('Station added.');
    await loadAll();
  }

  async function createKnowledge(e: FormEvent) {
    e.preventDefault();
    if (!profile?.location_id || !knowledgeTitle.trim() || !knowledgeContent.trim()) return;
    const station = stations.find((s) => s.id === selectedStation);
    const { error } = await supabase.from('knowledge_items').insert({
      location_id: profile.location_id,
      area_id: station?.area_id ?? kitchenArea?.id ?? null,
      station_id: selectedStation || null,
      title: knowledgeTitle.trim(),
      content: knowledgeContent.trim(),
      category: 'operational_knowledge',
      status: 'draft',
    });
    if (error) return setMessage(error.message);
    setKnowledgeTitle('');
    setKnowledgeContent('');
    setMessage('Knowledge saved as a draft.');
    await loadAll();
  }

  async function approveKnowledge(id: string) {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;
    const { error } = await supabase.from('knowledge_items').update({ status: 'approved', approved_by: authData.user.id, approved_at: new Date().toISOString() }).eq('id', id);
    if (error) return setMessage(error.message);
    await loadAll();
  }

  async function createProcedure(e: FormEvent) {
    e.preventDefault();
    if (!profile?.location_id || !procedureTitle.trim()) return;
    const station = stations.find((s) => s.id === selectedStation);
    const { error } = await supabase.from('procedures').insert({
      location_id: profile.location_id,
      area_id: station?.area_id ?? kitchenArea?.id ?? null,
      station_id: selectedStation || null,
      title: procedureTitle.trim(),
      description: procedureDescription.trim() || null,
      status: 'draft',
    });
    if (error) return setMessage(error.message);
    setProcedureTitle('');
    setProcedureDescription('');
    setMessage('Procedure draft created.');
    await loadAll();
  }

  async function createEmployee(e: FormEvent) {
    e.preventDefault();
    if (!profile?.location_id || !employeeName.trim()) return;
    const { error } = await supabase.from('employees').insert({
      location_id: profile.location_id,
      full_name: employeeName.trim(),
      phone: employeePhone.trim() || null,
    });
    if (error) return setMessage(error.message);
    setEmployeeName('');
    setEmployeePhone('');
    setMessage('Team member added.');
    await loadAll();
  }

  if (!sessionReady) return null;

  if (!signedIn) {
    return (
      <main className="auth-wrap">
        <div className="auth-card">
          <div className="brand-kicker">Johns Island</div>
          <h1>El Molino Ops</h1>
          <p>The private operating workspace for restaurant knowledge, procedures, checklists and team training.</p>
          <form className="form" onSubmit={handleAuth}>
            {authMode === 'signup' && <div className="field"><label>Your name</label><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>}
            <div className="field"><label>Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div className="field"><label>Password</label><input className="input" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <button className="btn" disabled={busy}>{busy ? 'Working…' : authMode === 'signup' ? 'Create account' : 'Sign in'}</button>
          </form>
          {message && <div className={`notice ${message.toLowerCase().includes('error') ? 'error' : ''}`} style={{ marginTop: 12 }}>{message}</div>}
          <button className="btn ghost" style={{ width: '100%', marginTop: 12 }} onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setMessage(''); }}>
            {authMode === 'signup' ? 'I already have an account' : 'Create a new account'}
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div><div className="brand-kicker">El Molino Taqueria</div><div className="brand-title">Johns Island</div></div>
        <button className="avatar" title="Sign out" onClick={() => supabase.auth.signOut()}>{(profile?.full_name || 'GM').slice(0, 1).toUpperCase()}</button>
      </header>

      <main className="page">
        {message && <div className="notice" style={{ marginBottom: 14 }}>{message}</div>}

        {tab === 'home' && <HomeView profile={profile} stations={stations} knowledge={knowledge} procedures={procedures} employees={employees} setTab={setTab} />}
        {tab === 'knowledge' && <KnowledgeView canManage={canManage} stations={stations} stationName={stationName} setStationName={setStationName} stationDescription={stationDescription} setStationDescription={setStationDescription} selectedStation={selectedStation} setSelectedStation={setSelectedStation} knowledgeTitle={knowledgeTitle} setKnowledgeTitle={setKnowledgeTitle} knowledgeContent={knowledgeContent} setKnowledgeContent={setKnowledgeContent} knowledge={knowledge} createStation={createStation} createKnowledge={createKnowledge} approveKnowledge={approveKnowledge} />}
        {tab === 'operations' && <OperationsView canManage={canManage} stations={stations} selectedStation={selectedStation} setSelectedStation={setSelectedStation} procedureTitle={procedureTitle} setProcedureTitle={setProcedureTitle} procedureDescription={procedureDescription} setProcedureDescription={setProcedureDescription} procedures={procedures} createProcedure={createProcedure} />}
        {tab === 'team' && <TeamView canManage={canManage} employeeName={employeeName} setEmployeeName={setEmployeeName} employeePhone={employeePhone} setEmployeePhone={setEmployeePhone} employees={employees} roles={roles} createEmployee={createEmployee} />}
        {tab === 'ai' && <AIView knowledge={knowledge} procedures={procedures} />}
      </main>

      <nav className="tabs">
        <TabButton label="Home" active={tab === 'home'} onClick={() => setTab('home')} icon={<Home size={19} />} />
        <TabButton label="Knowledge" active={tab === 'knowledge'} onClick={() => setTab('knowledge')} icon={<BookOpen size={19} />} />
        <TabButton label="Operations" active={tab === 'operations'} onClick={() => setTab('operations')} icon={<ClipboardCheck size={19} />} />
        <TabButton label="Team" active={tab === 'team'} onClick={() => setTab('team')} icon={<Users size={19} />} />
        <TabButton label="Ask AI" active={tab === 'ai'} onClick={() => setTab('ai')} icon={<Bot size={19} />} />
      </nav>
    </div>
  );
}

function HomeView({ profile, stations, knowledge, procedures, employees, setTab }: { profile: Profile | null; stations: Station[]; knowledge: KnowledgeItem[]; procedures: Procedure[]; employees: Employee[]; setTab: (tab: Tab) => void }) {
  return <>
    <section className="hero">
      <div className="hero-row">
        <div><div className="brand-kicker" style={{ color: '#b8cabc' }}>{profile?.app_role ?? 'member'}</div><h1>Run the restaurant.<br/>Teach the system.</h1><p>Capture how Johns Island actually works, approve the right process, then turn it into repeatable shift execution.</p></div>
        <div className="hero-badge">V1 • Knowledge → Action</div>
      </div>
    </section>
    <div className="section-title"><h2>Foundation</h2><span>live data</span></div>
    <div className="grid">
      <MetricCard icon={<Wrench size={19}/>} value={stations.length} label="Stations" />
      <MetricCard icon={<BookOpen size={19}/>} value={knowledge.length} label="Knowledge" />
      <MetricCard icon={<ClipboardCheck size={19}/>} value={procedures.length} label="Procedures" />
      <MetricCard icon={<Users size={19}/>} value={employees.length} label="Team" />
    </div>
    <div className="section-title"><h2>Start here</h2><span>one vertical slice</span></div>
    <div className="list">
      <button className="list-item" onClick={() => setTab('knowledge')}><div className="icon-wrap"><Plus size={18}/></div><div className="list-main"><b>Teach one station</b><small>Add a station and record what good looks like.</small></div><span className="status">Step 1</span></button>
      <button className="list-item" onClick={() => setTab('operations')}><div className="icon-wrap"><CheckCircle2 size={18}/></div><div className="list-main"><b>Turn it into a procedure</b><small>Create the approved operational process.</small></div><span className="status">Step 2</span></button>
      <button className="list-item" onClick={() => setTab('team')}><div className="icon-wrap"><Users size={18}/></div><div className="list-main"><b>Add your team</b><small>Start the roster we’ll later assign duties to.</small></div><span className="status">Step 3</span></button>
    </div>
  </>;
}

function KnowledgeView(props: any) {
  return <>
    <div className="section-title"><h2>Knowledge</h2><span>capture → approve</span></div>
    {props.canManage && <div className="card" style={{ marginBottom: 12 }}><h3>Add a kitchen station</h3><form className="form" onSubmit={props.createStation}><input className="input" placeholder="Station name, e.g. Grill Line" value={props.stationName} onChange={(e) => props.setStationName(e.target.value)} required/><textarea className="textarea" placeholder="What happens at this station?" value={props.stationDescription} onChange={(e) => props.setStationDescription(e.target.value)}/><button className="btn">Add station</button></form></div>}
    {props.canManage && <div className="card"><h3>Teach El Molino</h3><p style={{ marginBottom: 14 }}>For V1, add a written observation. Photo, voice and document capture come next.</p><form className="form" onSubmit={props.createKnowledge}><select className="select" value={props.selectedStation} onChange={(e) => props.setSelectedStation(e.target.value)}><option value="">Restaurant-wide</option>{props.stations.map((s: Station) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><input className="input" placeholder="Knowledge title" value={props.knowledgeTitle} onChange={(e) => props.setKnowledgeTitle(e.target.value)} required/><textarea className="textarea" placeholder="Explain exactly how this works at this location…" value={props.knowledgeContent} onChange={(e) => props.setKnowledgeContent(e.target.value)} required/><button className="btn">Save knowledge draft</button></form></div>}
    <div className="section-title"><h2>Recent knowledge</h2><span>{props.knowledge.length} items</span></div>
    <div className="list">{props.knowledge.length === 0 ? <Empty text="No knowledge yet. Teach the first station above."/> : props.knowledge.map((item: KnowledgeItem) => <div className="list-item" key={item.id}><div className="list-main"><b>{item.title}</b><small>{item.content.slice(0, 110)}{item.content.length > 110 ? '…' : ''}</small></div>{item.status === 'draft' && props.canManage ? <button className="btn ghost" onClick={() => props.approveKnowledge(item.id)}>Approve</button> : <span className="status">{item.status}</span>}</div>)}</div>
  </>;
}

function OperationsView(props: any) {
  return <>
    <div className="section-title"><h2>Operations</h2><span>knowledge → procedure → checklist</span></div>
    {props.canManage && <div className="card"><h3>Create a procedure draft</h3><form className="form" onSubmit={props.createProcedure}><select className="select" value={props.selectedStation} onChange={(e) => props.setSelectedStation(e.target.value)}><option value="">Restaurant-wide</option>{props.stations.map((s: Station) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><input className="input" placeholder="Procedure title, e.g. Grill Opening" value={props.procedureTitle} onChange={(e) => props.setProcedureTitle(e.target.value)} required/><textarea className="textarea" placeholder="Describe the procedure. Step editor comes in the next slice." value={props.procedureDescription} onChange={(e) => props.setProcedureDescription(e.target.value)}/><button className="btn">Create procedure draft</button></form></div>}
    <div className="section-title"><h2>Procedures</h2><span>{props.procedures.length} total</span></div><div className="list">{props.procedures.length === 0 ? <Empty text="No procedures yet."/> : props.procedures.map((p: Procedure) => <div className="list-item" key={p.id}><div className="list-main"><b>{p.title}</b><small>{p.description || 'No description yet'}</small></div><span className="status">{p.status}</span></div>)}</div>
    <div className="card" style={{ marginTop: 14 }}><div className="icon-wrap"><ClipboardCheck size={18}/></div><h3>Checklist builder is next</h3><p>The database structure is already in place. We’re deliberately finishing procedure authoring before exposing checklist assignment.</p></div>
  </>;
}

function TeamView(props: any) {
  return <>
    <div className="section-title"><h2>Team</h2><span>{props.roles.length} seeded roles</span></div>
    {props.canManage && <div className="card"><h3>Add team member</h3><form className="form" onSubmit={props.createEmployee}><input className="input" placeholder="Full name" value={props.employeeName} onChange={(e) => props.setEmployeeName(e.target.value)} required/><input className="input" placeholder="Phone (optional)" value={props.employeePhone} onChange={(e) => props.setEmployeePhone(e.target.value)}/><button className="btn">Add employee</button></form></div>}
    <div className="section-title"><h2>Roster</h2><span>{props.employees.length} people</span></div><div className="list">{props.employees.length === 0 ? <Empty text="No team members added yet."/> : props.employees.map((e: Employee) => <div className="list-item" key={e.id}><div className="list-main"><b>{e.full_name}</b><small>{e.phone || 'No phone added'}</small></div><span className="status">{e.active ? 'active' : 'inactive'}</span></div>)}</div>
  </>;
}

function AIView({ knowledge, procedures }: { knowledge: KnowledgeItem[]; procedures: Procedure[] }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  function ask(e: FormEvent) {
    e.preventDefault();
    const q = question.toLowerCase();
    const matchingKnowledge = knowledge.filter((k) => k.title.toLowerCase().includes(q) || k.content.toLowerCase().includes(q));
    const matchingProcedures = procedures.filter((p) => p.title.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
    if (!question.trim()) return;
    if (matchingKnowledge.length || matchingProcedures.length) {
      setAnswer(`I found ${matchingKnowledge.length} knowledge item(s) and ${matchingProcedures.length} procedure(s) related to that in the Johns Island workspace. Full grounded AI answers are the next AI slice; this V1 is proving the source-backed retrieval path first.`);
    } else {
      setAnswer('I do not have enough approved Johns Island knowledge to answer that yet. Add or approve the relevant restaurant knowledge first so the future AI does not invent a generic restaurant answer.');
    }
  }
  return <><div className="section-title"><h2>Ask El Molino</h2><span>grounded first</span></div><div className="hero"><Sparkles size={24}/><h1 style={{ marginTop: 14 }}>Ask the restaurant.</h1><p>This first version searches the knowledge you teach it. Model-powered answers, photo understanding and web research plug into this same surface next.</p></div><div className="card" style={{ marginTop: 14 }}><form className="form" onSubmit={ask}><textarea className="textarea" placeholder="Ask something about the restaurant…" value={question} onChange={(e) => setQuestion(e.target.value)}/><button className="btn">Search El Molino knowledge</button></form>{answer && <div className="notice" style={{ marginTop: 12 }}>{answer}</div>}</div></>;
}

function TabButton({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon: React.ReactNode }) { return <button className={`tab ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button>; }
function MetricCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) { return <div className="card"><div className="icon-wrap">{icon}</div><h3>{label}</h3><strong>{value}</strong></div>; }
function Empty({ text }: { text: string }) { return <div className="card"><p>{text}</p></div>; }
