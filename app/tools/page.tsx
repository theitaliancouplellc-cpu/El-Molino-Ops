'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, Camera, ChevronRight, CircleUserRound, Loader2, Menu as MenuIcon, MessageSquare, ShieldCheck, Wrench, ClipboardList, ClipboardCheck, UserRound, Gauge, FolderOpen, Activity, Star, WandSparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Profile={app_role:'admin'|'manager'|'employee'};

const common=[
  {href:'/shift',icon:ClipboardCheck,title:'Run the Shift',body:'Opening, mid-shift and closing checklist execution'},
  {href:'/my-work',icon:UserRound,title:'My Work',body:'Your assignments and today’s checklist responsibilities'},
  {href:'/ops',icon:ClipboardList,title:'Operations Center',body:'Handoffs, logs, maintenance, food safety, inventory, training and more'},
  {href:'/procedures',icon:ClipboardCheck,title:'Procedure Builder',body:'Draft, approve and convert procedures into checklists'},
  {href:'/capture',icon:Camera,title:'Capture Studio',body:'Camera, video, voice and documents'},
  {href:'/files',icon:FolderOpen,title:'Files & Media',body:'Private searchable source files and attachment references'},
  {href:'/saved',icon:Star,title:'Saved & Recent',body:'Bookmarked records and recently viewed work'},
  {href:'/calendar',icon:CalendarDays,title:'Calendar',body:'Tasks, events and recurring operations'},
  {href:'/discussions',icon:MessageSquare,title:'Discussions',body:'Internal manager and team communication'},
  {href:'/menu',icon:MenuIcon,title:'Menu Catalog',body:'Structured products, categories and source data'},
  {href:'/account',icon:CircleUserRound,title:'Account & Security',body:'Profile, email and password controls'},
];

export default function ToolsPage(){
  const [profile,setProfile]=useState<Profile|null>(null),[loading,setLoading]=useState(true);
  useEffect(()=>{void load()},[]);
  async function load(){const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return;}const {data}=await supabase.from('profiles').select('app_role').eq('id',u.user.id).single();setProfile(data as Profile);setLoading(false);}
  if(loading)return <div className="full-loader"><Loader2 className="spin"/><span>Opening tools…</span></div>;
  const manager=profile?.app_role==='admin'||profile?.app_role==='manager';
  return <div className="app-shell"><header className="topbar"><a className="round-button" href="/" aria-label="Back"><ArrowLeft/></a><div style={{flex:1}}><div className="brand-kicker">El Molino Ops</div><div className="brand-title">Tools</div></div></header><main className="page"><div className="page-heading"><h1>Tools & settings</h1><p>Secondary capabilities stay here instead of crowding the daily workspace.</p></div><div className="settings-list">{manager&&<><a className="settings-row" href="/manager"><span className="settings-icon"><Gauge/></span><span><b>Manager Overview</b><small>Exceptions, overdue work, shift progress and operational attention</small></span><ChevronRight/></a><a className="settings-row" href="/schedule/optimizer"><span className="settings-icon"><WandSparkles/></span><span><b>Schedule Optimizer</b><small>Forecast-driven auto scheduling, labor strategy, coverage and copy-week tools</small></span><ChevronRight/></a></>}{common.map(x=>{const Icon=x.icon;return <a className="settings-row" href={x.href} key={x.href}><span className="settings-icon"><Icon/></span><span><b>{x.title}</b><small>{x.body}</small></span><ChevronRight/></a>})}{profile?.app_role==='admin'&&<><a className="settings-row" href="/admin"><span className="settings-icon"><ShieldCheck/></span><span><b>Admin Center</b><small>Users, roles, trash, versions, health and backups</small></span><ChevronRight/></a><a className="settings-row" href="/admin/diagnostics"><span className="settings-icon"><Activity/></span><span><b>Diagnostics & Recovery</b><small>Live health, duplicate detection and expanded trash recovery</small></span><ChevronRight/></a></>}</div><div className="install-note"><Wrench/><div><b>App foundation</b><small>These tools are intentionally separated from Today so operational work remains simple.</small></div></div></main></div>;
}
