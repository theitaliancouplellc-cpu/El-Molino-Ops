'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {BellRing,CalendarDays,CheckCircle2,ChevronLeft,Clock3,Home,MessageSquare,Send,UserRound,UsersRound} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import base from '../employee.module.css';
import styles from './team.module.css';

type Profile={app_role:'admin'|'manager'|'employee';location_id:string|null};
type Setup={status:string;employee_id?:string|null};
type DirectoryRow={employee_id:string;full_name:string};
type Announcement={id:string;title:string;body:string;priority:'normal'|'important'|'urgent';expires_at:string|null;sent_at:string;archived_at:string|null;requires_acknowledgment:boolean};
type Recipient={announcement_id:string;employee_id:string;read_at:string|null;acknowledged_at:string|null};
type Channel={id:string;channel_kind:'direct'|'group';display_name:string;last_message_at:string|null;unread_count:number;last_message:string|null};
type Message={id:string;channel_id:string;author_employee_id:string;author_name:string;body:string;created_at:string;mine:boolean};
type ManagerOnDuty={available:boolean;employee_id?:string;full_name?:string;state?:'on_duty'|'next_manager'|'fallback';shift_starts_at?:string|null;shift_ends_at?:string|null;channel_id?:string};

const managerState=(m:ManagerOnDuty|null)=>m?.state==='on_duty'?'On duty now':m?.state==='next_manager'?'Next scheduled manager':'Manager contact';
const time=(iso:string)=>new Date(iso).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
const dateTime=(iso:string)=>new Date(iso).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});

export default function EmployeeTeam(){
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [me,setMe]=useState<string|null>(null),[directory,setDirectory]=useState<DirectoryRow[]>([]),[manager,setManager]=useState<ManagerOnDuty|null>(null);
 const [announcements,setAnnouncements]=useState<Announcement[]>([]),[recipients,setRecipients]=useState<Recipient[]>([]),[channels,setChannels]=useState<Channel[]>([]),[messages,setMessages]=useState<Message[]>([]);
 const [selectedChannel,setSelectedChannel]=useState<string>(''),[otherEmployee,setOtherEmployee]=useState(''),[draft,setDraft]=useState('');
 const unreadAnnouncements=useMemo(()=>announcements.filter(a=>{const r=recipients.find(x=>x.announcement_id===a.id);return r&&!r.read_at}).length,[announcements,recipients]);
 const requiredAcks=useMemo(()=>announcements.filter(a=>{const r=recipients.find(x=>x.announcement_id===a.id);return a.requires_acknowledgment&&r&&!r.acknowledged_at}).length,[announcements,recipients]);
 const unreadMessages=useMemo(()=>channels.reduce((n,c)=>n+Number(c.unread_count||0),0),[channels]);
 const activeChannel=channels.find(c=>c.id===selectedChannel)||null;

 useEffect(()=>{void load()},[]);
 async function load(preferredChannel?:string){
  setBusy(true);setNotice('');
  const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('app_role,location_id').eq('id',u.user.id).single();
  if(p.error||!p.data?.location_id){setNotice('Could not open Team Hub.');setReady(true);setBusy(false);return}
  const profile=p.data as Profile;if(profile.app_role!=='employee'){location.href='/team';return}
  const st=await supabase.rpc('employee_self_setup_status',{});if(st.error){setNotice(st.error.message);setReady(true);setBusy(false);return}
  const setup=(st.data||{status:'not_started'}) as Setup;if(setup.status!=='approved'||!setup.employee_id){location.href='/employee/setup';return}
  const eid=setup.employee_id;setMe(eid);
  const [mod,ch,dir,a,r]=await Promise.all([
    supabase.rpc('staff_manager_on_duty',{}),
    supabase.rpc('my_team_channels',{}),
    supabase.rpc('staff_directory',{}),
    supabase.from('team_announcements').select('id,title,body,priority,expires_at,sent_at,archived_at,requires_acknowledgment').is('archived_at',null).order('sent_at',{ascending:false}).limit(100),
    supabase.from('team_announcement_recipients').select('announcement_id,employee_id,read_at,acknowledged_at').eq('employee_id',eid).limit(500)
  ]);
  if([mod,ch,dir,a,r].some(x=>x.error))setNotice('Some Team Hub details could not be refreshed.');
  setManager((mod.data||{available:false}) as ManagerOnDuty);
  const channelRows=(Array.isArray(ch.data)?ch.data:[]) as Channel[];setChannels(channelRows);
  setDirectory((dir.data??[]) as DirectoryRow[]);setAnnouncements((a.data??[]) as Announcement[]);setRecipients((r.data??[]) as Recipient[]);
  const params=new URLSearchParams(window.location.search);const requested=preferredChannel||params.get('channel')||selectedChannel||channelRows[0]?.id||'';
  const valid=channelRows.some(c=>c.id===requested)?requested:(channelRows[0]?.id||'');setSelectedChannel(valid);
  if(valid)await loadMessages(valid,false);else setMessages([]);
  setReady(true);setBusy(false);
  const announcementId=params.get('announcement');if(announcementId)setTimeout(()=>document.getElementById(`announcement-${announcementId}`)?.scrollIntoView({behavior:'smooth',block:'center'}),100);
 }
 async function loadMessages(channelId:string,refreshChannels=true){
  if(!channelId)return;
  const [m,read]=await Promise.all([supabase.rpc('team_channel_messages_for_me',{p_channel_id:channelId,p_limit:120}),supabase.rpc('mark_team_channel_read',{p_channel_id:channelId})]);
  if(m.error||read.error){setNotice(m.error?.message||read.error?.message||'Could not open conversation.');return}
  setMessages((Array.isArray(m.data)?m.data:[]) as Message[]);
  if(refreshChannels){const ch=await supabase.rpc('my_team_channels',{});if(!ch.error)setChannels((Array.isArray(ch.data)?ch.data:[]) as Channel[])}
 }
 async function openChannel(id:string){if(busy)return;setSelectedChannel(id);setBusy(true);await loadMessages(id);setBusy(false)}
 async function startDirect(){if(!otherEmployee||busy)return;setBusy(true);const {data,error}=await supabase.rpc('start_direct_team_channel',{p_other_employee_id:otherEmployee});if(error)setNotice(error.message);else{setOtherEmployee('');await load(String(data))}setBusy(false)}
 async function messageManager(){if(busy)return;setBusy(true);const {data,error}=await supabase.rpc('start_manager_on_duty_channel',{});if(error)setNotice(error.message);else{const out=data as ManagerOnDuty;setManager(out);await load(out.channel_id)}setBusy(false)}
 async function sendMessage(e:FormEvent){e.preventDefault();if(!selectedChannel||!draft.trim()||busy)return;setBusy(true);const {error}=await supabase.rpc('send_team_channel_message',{p_channel_id:selectedChannel,p_body:draft.trim()});if(error)setNotice(error.message);else{setDraft('');await loadMessages(selectedChannel)}setBusy(false)}
 async function handleAnnouncement(a:Announcement){if(busy)return;const r=recipients.find(x=>x.announcement_id===a.id);if(!r)return;setBusy(true);const action=a.requires_acknowledgment&&!r.acknowledged_at?await supabase.rpc('acknowledge_team_announcement',{p_announcement_id:a.id}):await supabase.rpc('mark_team_announcement_read',{p_announcement_id:a.id});setNotice(action.error?action.error.message:a.requires_acknowledgment&&!r.acknowledged_at?'Announcement acknowledged.':'Marked read.');await load(selectedChannel);setBusy(false)}

 if(!ready)return <main className={base.page}>Opening Team Hub…</main>;
 return <main className={base.page}>
  <header className={base.header}><a className={base.iconButton} href="/employee" aria-label="Back to staff home"><ChevronLeft size={20}/></a><div className={base.brand}><small>El Molino · Staff</small><strong>Team</strong></div><a className={base.iconButton} href="/employee/notifications" aria-label="Notifications"><BellRing size={20}/>{unreadAnnouncements+unreadMessages>0&&<span className={base.badge}>{Math.min(99,unreadAnnouncements+unreadMessages)}</span>}</a></header>
  {notice&&<div className={base.notice}>{notice}</div>}

  <section className={base.hero}><small>Team Hub</small><h1>Stay connected.</h1><p>Announcements, manager contact and private staff conversations in one employee-only space.</p><div className={base.next}><b>{requiredAcks?`${requiredAcks} acknowledgment${requiredAcks===1?'':'s'} needed`:'You are caught up on required acknowledgments'}</b><span>{unreadMessages} unread message{unreadMessages===1?'':'s'} · {unreadAnnouncements} unread announcement{unreadAnnouncements===1?'':'s'}</span></div></section>

  <section className={base.section}><div className={base.sectionHead}><h2>Manager on duty</h2><span>{managerState(manager)}</span></div>{manager?.available?<div className={base.row}><UsersRound size={20}/><span className={base.rowMain}><b>{manager.full_name}</b><small>{manager.state==='on_duty'&&manager.shift_ends_at?`Scheduled through ${time(manager.shift_ends_at)}`:manager.state==='next_manager'&&manager.shift_starts_at?`Next manager shift ${dateTime(manager.shift_starts_at)}`:'Available manager contact'}</small></span><button className={base.button} disabled={busy||manager.employee_id===me} onClick={messageManager}><MessageSquare size={16}/> Message</button></div>:<div className={base.empty}>No linked manager account is available yet.</div>}</section>

  <section className={base.section}><div className={base.sectionHead}><h2>Announcements</h2><span>{requiredAcks?`${requiredAcks} require action`:`${unreadAnnouncements} unread`}</span></div><div className={base.list}>{announcements.map(a=>{const r=recipients.find(x=>x.announcement_id===a.id);if(!r)return null;const needsAck=a.requires_acknowledgment&&!r.acknowledged_at;const unread=!r.read_at;return <article id={`announcement-${a.id}`} key={a.id} className={`${base.row} ${unread||needsAck?base.notificationUnread:''}`}><span className={base.notificationIcon}>{needsAck?<BellRing size={18}/>:r.acknowledged_at?<CheckCircle2 size={18}/>:<span className={base.dot}/>}</span><span className={base.rowMain}><span className={base.notificationMeta}><span className={a.priority==='urgent'?base.criticalText:''}>{a.priority}</span><span>{new Date(a.sent_at).toLocaleDateString([],{month:'short',day:'numeric'})}</span>{a.requires_acknowledgment&&<span>ack required</span>}</span><b>{a.title}</b><small className={styles.announcementBody}>{a.body}</small>{a.expires_at&&<small>Expires {dateTime(a.expires_at)}</small>}</span>{(unread||needsAck)&&<button className={base.button} disabled={busy} onClick={()=>handleAnnouncement(a)}>{needsAck?'Acknowledge':'Mark read'}</button>}</article>})}{!announcements.length&&<div className={base.empty}>No active announcements for you.</div>}</div></section>

  <section className={base.section}><div className={base.sectionHead}><h2>Messages</h2><span>Private to channel members</span></div><div className={styles.messageLayout}><div className={styles.channelPane}><div className={styles.newChat}><select aria-label="Choose teammate" value={otherEmployee} onChange={e=>setOtherEmployee(e.target.value)}><option value="">Message a teammate…</option>{directory.filter(x=>x.employee_id!==me).map(x=><option key={x.employee_id} value={x.employee_id}>{x.full_name}</option>)}</select><button className={base.button} disabled={busy||!otherEmployee} onClick={startDirect}>Start</button></div><div className={base.list}>{channels.map(c=><button key={c.id} onClick={()=>openChannel(c.id)} className={`${base.row} ${c.id===selectedChannel?base.notificationUnread:''}`}><MessageSquare size={17}/><span className={base.rowMain}><b>{c.display_name}</b><small>{c.last_message||'No messages yet'}</small></span>{Number(c.unread_count)>0&&<span className={base.badge}>{Math.min(99,Number(c.unread_count))}</span>}</button>)}{!channels.length&&<div className={base.empty}>No conversations yet. Message the manager on duty or a teammate to begin.</div>}</div></div><div className={styles.conversationPane}>{activeChannel?<><div className={styles.conversationHeader}><b>{activeChannel.display_name}</b><small>{messages.length} message{messages.length===1?'':'s'}</small></div><div className={styles.messages}>{messages.map(m=><div key={m.id} className={`${styles.bubbleWrap} ${m.mine?styles.mine:''}`}><div className={styles.bubble}><b>{m.mine?'You':m.author_name}</b><span>{m.body}</span><small>{time(m.created_at)}</small></div></div>)}{!messages.length&&<div className={base.empty}>No messages yet.</div>}</div><form className={styles.composer} onSubmit={sendMessage}><input maxLength={2000} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Write a message…"/><button className={base.button} disabled={busy||!draft.trim()} aria-label="Send message"><Send size={17}/></button></form></>:<div className={base.empty}>Choose a conversation.</div>}</div></div></section>

  <nav className={base.tabs} aria-label="Staff navigation"><a className={base.tab} href="/employee"><Home size={19}/>Home</a><a className={base.tab} href="/employee/schedule"><CalendarDays size={19}/>Schedule</a><a className={base.tab} href="/employee/requests"><Clock3 size={19}/>Requests</a><a className={`${base.tab} ${base.tabActive}`} href="/employee/team"><MessageSquare size={19}/>Team</a><a className={base.tab} href="/account"><UserRound size={19}/>More</a></nav>
 </main>
}
