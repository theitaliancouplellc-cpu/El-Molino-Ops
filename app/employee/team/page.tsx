'use client';

import {FormEvent,useEffect,useMemo,useRef,useState} from 'react';
import {BellRing,CalendarDays,CheckCircle2,ChevronLeft,Clock3,Home,MessageSquare,Reply,Send,UserRound,UsersRound,X} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {useI18n} from '@/lib/i18n';
import {staffFeatureEnabled} from '@/lib/staff-features';
import base from '../employee.module.css';
import styles from './team.module.css';

type Profile={app_role:'admin'|'manager'|'employee';location_id:string|null};
type Setup={status:string;employee_id?:string|null};
type DirectoryRow={employee_id:string;full_name:string};
type Announcement={id:string;title:string;body:string;priority:'normal'|'important'|'urgent';expires_at:string|null;sent_at:string;archived_at:string|null;requires_acknowledgment:boolean};
type Recipient={announcement_id:string;employee_id:string;read_at:string|null;acknowledged_at:string|null};
type ReactionKey='like'|'heart'|'celebrate'|'ack';
type Channel={id:string;channel_kind:'direct'|'group'|'roster'|'system';display_name:string;last_message_at:string|null;unread_count:number;last_message:string|null;member_count:number;member_ids:string[]};
type Message={id:string;channel_id:string;author_employee_id:string;author_name:string;body:string;created_at:string;mine:boolean;reply_to_message_id:string|null;reply_to_author_name:string|null;reply_to_body:string|null;reaction_counts:Partial<Record<ReactionKey,number>>;my_reactions:ReactionKey[];read_by_count:number;recipient_count:number};
type ManagerOnDuty={available:boolean;employee_id?:string;full_name?:string;state?:'on_duty'|'next_manager'|'fallback';shift_starts_at?:string|null;shift_ends_at?:string|null;channel_id?:string};

const reactionKeys:ReactionKey[]=['like','heart','celebrate','ack'];

export default function EmployeeTeam(){
 const {locale}=useI18n();
 const c=locale==='es'?{
  onDuty:'De turno ahora',nextManager:'Próximo gerente programado',managerContact:'Contacto de gerencia',openError:'No se pudo abrir el Centro del Equipo.',partialError:'No se pudieron actualizar algunos detalles del Centro del Equipo.',conversationError:'No se pudo abrir la conversación.',realtimeError:'La actualización en vivo no está disponible. Puedes seguir usando Mensajes y volver a abrir la conversación para actualizarla.',acknowledged:'Anuncio confirmado.',markedRead:'Marcado como leído.',opening:'Abriendo Centro del Equipo…',back:'Volver al inicio del personal',staff:'Personal de El Molino',team:'Equipo',notifications:'Notificaciones',hub:'Centro del Equipo',stay:'Mantente conectado.',hero:'Anuncios, contacto con gerencia y conversaciones privadas del personal en un solo espacio exclusivo para empleados.',ackNeeded:'confirmación requerida',acksNeeded:'confirmaciones requeridas',caughtUp:'Estás al día con las confirmaciones obligatorias',unreadMessage:'mensaje sin leer',unreadMessages:'mensajes sin leer',unreadAnnouncement:'anuncio sin leer',unreadAnnouncements:'anuncios sin leer',managerDuty:'Gerente de turno',scheduledThrough:'Programado hasta',nextShift:'Próximo turno de gerencia',availableContact:'Contacto de gerencia disponible',message:'Mensaje',noManager:'Aún no hay una cuenta de gerente vinculada disponible.',announcements:'Anuncios',requireAction:'requieren acción',unread:'sin leer',ackRequired:'confirmación obligatoria',expires:'Vence',acknowledge:'Confirmar',markRead:'Marcar leído',noAnnouncements:'No tienes anuncios activos.',messages:'Mensajes',privateMembers:'Privado para miembros del canal',chooseTeammate:'Elegir compañero',messageTeammate:'Enviar mensaje a un compañero…',start:'Iniciar',newGroup:'Nuevo grupo',groupName:'Nombre del grupo',groupNamePlaceholder:'Ej. Equipo de cierre',addMember:'Agregar compañero',add:'Agregar',createGroup:'Crear grupo',noMessagesYet:'Aún no hay mensajes',noConversations:'Aún no hay conversaciones. Envía un mensaje al gerente de turno o a un compañero para comenzar.',you:'Tú',write:'Escribe un mensaje…',send:'Enviar mensaje',chooseConversation:'Elige una conversación.',staffNav:'Navegación del personal',home:'Inicio',schedule:'Horario',requests:'Solicitudes',more:'Más',normal:'normal',important:'importante',urgent:'urgente',allStaff:'Todo el personal',members:'miembros',reply:'Responder',replyingTo:'Respondiendo a',cancelReply:'Cancelar respuesta',mention:'Mencionar',addMention:'Agregar mención',read:'Leído',systemReadOnly:'Este canal del sistema es de solo lectura.',like:'Me gusta',heart:'Corazón',celebrate:'Celebrar',ackReaction:'Entendido'
 }:{
  onDuty:'On duty now',nextManager:'Next scheduled manager',managerContact:'Manager contact',openError:'Could not open Team Hub.',partialError:'Some Team Hub details could not be refreshed.',conversationError:'Could not open conversation.',realtimeError:'Live updates are unavailable. Messages still works; reopen the conversation to refresh.',acknowledged:'Announcement acknowledged.',markedRead:'Marked read.',opening:'Opening Team Hub…',back:'Back to staff home',staff:'El Molino · Staff',team:'Team',notifications:'Notifications',hub:'Team Hub',stay:'Stay connected.',hero:'Announcements, manager contact and private staff conversations in one employee-only space.',ackNeeded:'acknowledgment needed',acksNeeded:'acknowledgments needed',caughtUp:'You are caught up on required acknowledgments',unreadMessage:'unread message',unreadMessages:'unread messages',unreadAnnouncement:'unread announcement',unreadAnnouncements:'unread announcements',managerDuty:'Manager on duty',scheduledThrough:'Scheduled through',nextShift:'Next manager shift',availableContact:'Available manager contact',message:'Message',noManager:'No linked manager account is available yet.',announcements:'Announcements',requireAction:'require action',unread:'unread',ackRequired:'ack required',expires:'Expires',acknowledge:'Acknowledge',markRead:'Mark read',noAnnouncements:'No active announcements for you.',messages:'Messages',privateMembers:'Private to channel members',chooseTeammate:'Choose teammate',messageTeammate:'Message a teammate…',start:'Start',newGroup:'New group',groupName:'Group name',groupNamePlaceholder:'e.g. Closing crew',addMember:'Add teammate',add:'Add',createGroup:'Create group',noMessagesYet:'No messages yet',noConversations:'No conversations yet. Message the manager on duty or a teammate to begin.',you:'You',write:'Write a message…',send:'Send message',chooseConversation:'Choose a conversation.',staffNav:'Staff navigation',home:'Home',schedule:'Schedule',requests:'Requests',more:'More',normal:'normal',important:'important',urgent:'urgent',allStaff:'All Staff',members:'members',reply:'Reply',replyingTo:'Replying to',cancelReply:'Cancel reply',mention:'Mention',addMention:'Add mention',read:'Read',systemReadOnly:'This system channel is read-only.',like:'Like',heart:'Heart',celebrate:'Celebrate',ackReaction:'Got it'
 };
 const managerState=(m:ManagerOnDuty|null)=>m?.state==='on_duty'?c.onDuty:m?.state==='next_manager'?c.nextManager:c.managerContact;
 const time=(iso:string)=>new Date(iso).toLocaleTimeString(locale==='es'?'es-US':'en-US',{hour:'numeric',minute:'2-digit'});
 const dateTime=(iso:string)=>new Date(iso).toLocaleString(locale==='es'?'es-US':'en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
 const reactionLabel=(r:ReactionKey)=>r==='like'?c.like:r==='heart'?c.heart:r==='celebrate'?c.celebrate:c.ackReaction;
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [me,setMe]=useState<string|null>(null),[directory,setDirectory]=useState<DirectoryRow[]>([]),[manager,setManager]=useState<ManagerOnDuty|null>(null);
 const [announcements,setAnnouncements]=useState<Announcement[]>([]),[recipients,setRecipients]=useState<Recipient[]>([]),[channels,setChannels]=useState<Channel[]>([]),[messages,setMessages]=useState<Message[]>([]);
 const [selectedChannel,setSelectedChannel]=useState(''),[otherEmployee,setOtherEmployee]=useState(''),[draft,setDraft]=useState('');
 const [groupTitle,setGroupTitle]=useState(''),[groupPicker,setGroupPicker]=useState(''),[groupMembers,setGroupMembers]=useState<string[]>([]);
 const [replyTo,setReplyTo]=useState<Message|null>(null),[mentionPicker,setMentionPicker]=useState(''),[mentionIds,setMentionIds]=useState<string[]>([]);
 const pendingSendKey=useRef<string|null>(null);
 const pendingGroupKey=useRef<string|null>(null);
 const unreadAnnouncements=useMemo(()=>announcements.filter(a=>{const r=recipients.find(x=>x.announcement_id===a.id);return r&&!r.read_at}).length,[announcements,recipients]);
 const requiredAcks=useMemo(()=>announcements.filter(a=>{const r=recipients.find(x=>x.announcement_id===a.id);return a.requires_acknowledgment&&r&&!r.acknowledged_at}).length,[announcements,recipients]);
 const unreadMessages=useMemo(()=>channels.reduce((n,ch)=>n+Number(ch.unread_count||0),0),[channels]);
 const activeChannel=channels.find(ch=>ch.id===selectedChannel)||null;
 const channelName=(ch:Channel)=>ch.channel_kind==='roster'?c.allStaff:ch.display_name;
 const mentionCandidates=useMemo(()=>directory.filter(x=>x.employee_id!==me&&activeChannel?.member_ids?.includes(x.employee_id)),[directory,me,activeChannel]);

 useEffect(()=>{void load()},[]);
 useEffect(()=>{
  if(!ready||!selectedChannel)return;
  let mounted=true;
  let realtime:ReturnType<typeof supabase.channel>|null=null;
  const refresh=()=>{if(!mounted)return;if(document.visibilityState==='visible')void loadMessages(selectedChannel);else void refreshChannels()};
  const connect=async()=>{
   await supabase.realtime.setAuth();
   if(!mounted)return;
   realtime=supabase.channel(`team:${selectedChannel}`,{config:{private:true}})
    .on('broadcast',{event:'INSERT'},refresh)
    .on('broadcast',{event:'UPDATE'},refresh)
    .on('broadcast',{event:'DELETE'},refresh)
    .subscribe((status)=>{if(mounted&&(status==='CHANNEL_ERROR'||status==='TIMED_OUT'))setNotice(c.realtimeError)});
  };
  void connect().catch(()=>{if(mounted)setNotice(c.realtimeError)});
  const visible=()=>{if(document.visibilityState==='visible')void loadMessages(selectedChannel)};
  document.addEventListener('visibilitychange',visible);
  return()=>{mounted=false;document.removeEventListener('visibilitychange',visible);if(realtime)void supabase.removeChannel(realtime)};
 },[ready,selectedChannel]);

 async function refreshChannels(){const ch=await supabase.rpc('my_team_channels',{});if(!ch.error)setChannels((Array.isArray(ch.data)?ch.data:[]) as Channel[])}
 async function load(preferredChannel?:string){
  setBusy(true);setNotice('');
  const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return}
  const p=await supabase.from('profiles').select('app_role,location_id').eq('id',u.user.id).single();
  if(p.error||!p.data?.location_id){setNotice(c.openError);setReady(true);setBusy(false);return}
  const profile=p.data as Profile;if(profile.app_role!=='employee'){location.href='/team';return}
  const st=await supabase.rpc('employee_self_setup_status',{});if(st.error){setNotice(st.error.message);setReady(true);setBusy(false);return}
  const setup=(st.data||{status:'not_started'}) as Setup;if(setup.status!=='approved'||!setup.employee_id){location.href='/employee/setup';return}
  const eid=setup.employee_id;setMe(eid);
  const roster=await supabase.rpc('ensure_staff_roster_channel',{});
  const [mod,ch,dir,a,r]=await Promise.all([
    supabase.rpc('staff_manager_on_duty',{}),supabase.rpc('my_team_channels',{}),supabase.rpc('staff_directory',{}),
    supabase.from('team_announcements').select('id,title,body,priority,expires_at,sent_at,archived_at,requires_acknowledgment').is('archived_at',null).order('sent_at',{ascending:false}).limit(100),
    supabase.from('team_announcement_recipients').select('announcement_id,employee_id,read_at,acknowledged_at').eq('employee_id',eid).limit(500)
  ]);
  if(roster.error||[mod,ch,dir,a,r].some(x=>x.error))setNotice(c.partialError);
  setManager((mod.data||{available:false}) as ManagerOnDuty);
  const channelRows=(Array.isArray(ch.data)?ch.data:[]) as Channel[];setChannels(channelRows);
  setDirectory((dir.data??[]) as DirectoryRow[]);setAnnouncements((a.data??[]) as Announcement[]);setRecipients((r.data??[]) as Recipient[]);
  const params=new URLSearchParams(window.location.search);const requested=preferredChannel||params.get('channel')||selectedChannel||channelRows[0]?.id||'';
  const valid=channelRows.some(x=>x.id===requested)?requested:(channelRows[0]?.id||'');setSelectedChannel(valid);
  if(valid)await loadMessages(valid,false);else setMessages([]);
  setReady(true);setBusy(false);
  const announcementId=params.get('announcement');if(announcementId)setTimeout(()=>document.getElementById(`announcement-${announcementId}`)?.scrollIntoView({behavior:'smooth',block:'center'}),100);
 }
 async function loadMessages(channelId:string,refresh=true){
  if(!channelId)return;
  const read=await supabase.rpc('mark_team_channel_read',{p_channel_id:channelId});
  if(read.error){setNotice(read.error.message||c.conversationError);return}
  const m=await supabase.rpc('team_channel_messages_for_me',{p_channel_id:channelId,p_limit:120});
  if(m.error){setNotice(m.error.message||c.conversationError);return}
  setMessages((Array.isArray(m.data)?m.data:[]) as Message[]);
  if(refresh)await refreshChannels();
 }
 async function openChannel(id:string){if(busy)return;setSelectedChannel(id);setReplyTo(null);setMentionIds([]);pendingSendKey.current=null;setBusy(true);await loadMessages(id);setBusy(false)}
 async function startDirect(){if(!otherEmployee||busy)return;setBusy(true);const {data,error}=await supabase.rpc('start_direct_team_channel',{p_other_employee_id:otherEmployee});if(error)setNotice(error.message);else{setOtherEmployee('');await load(String(data))}setBusy(false)}
 async function startGroup(){if(!groupTitle.trim()||!groupMembers.length||busy)return;setBusy(true);const key=pendingGroupKey.current||crypto.randomUUID();pendingGroupKey.current=key;const {data,error}=await supabase.rpc('start_team_group_channel',{p_title:groupTitle.trim(),p_member_employee_ids:groupMembers,p_client_request_id:key});if(error)setNotice(error.message);else{pendingGroupKey.current=null;setGroupTitle('');setGroupMembers([]);setGroupPicker('');await load(String(data))}setBusy(false)}
 async function messageManager(){if(busy)return;setBusy(true);const {data,error}=await supabase.rpc('start_manager_on_duty_channel',{});if(error)setNotice(error.message);else{const out=data as ManagerOnDuty;setManager(out);await load(out.channel_id)}setBusy(false)}
 function addGroupMember(){if(!groupPicker||groupMembers.includes(groupPicker))return;pendingGroupKey.current=null;setGroupMembers(x=>[...x,groupPicker]);setGroupPicker('')}
 function removeGroupMember(id:string){pendingGroupKey.current=null;setGroupMembers(x=>x.filter(v=>v!==id))}
 function addMention(){if(!mentionPicker||mentionIds.includes(mentionPicker))return;const person=directory.find(x=>x.employee_id===mentionPicker);if(!person)return;setMentionIds(x=>[...x,mentionPicker]);setDraft(v=>`${v}${v&&!v.endsWith(' ')?' ':''}@${person.full_name} `);pendingSendKey.current=null;setMentionPicker('')}
 async function sendMessage(e:FormEvent){
  e.preventDefault();if(!selectedChannel||!draft.trim()||busy||activeChannel?.channel_kind==='system')return;
  setBusy(true);const key=pendingSendKey.current||crypto.randomUUID();pendingSendKey.current=key;
  const {error}=await supabase.rpc('send_team_channel_message_v2',{p_channel_id:selectedChannel,p_body:draft.trim(),p_client_message_id:key,p_reply_to_message_id:replyTo?.id||null,p_mentioned_employee_ids:mentionIds.length?mentionIds:null});
  if(error)setNotice(error.message);else{pendingSendKey.current=null;setDraft('');setReplyTo(null);setMentionIds([]);await loadMessages(selectedChannel)}setBusy(false)
 }
 async function toggleReaction(m:Message,reaction:ReactionKey){if(busy)return;setBusy(true);const exists=(m.my_reactions||[]).includes(reaction);const action=exists?await supabase.rpc('remove_team_message_reaction',{p_message_id:m.id,p_reaction:reaction}):await supabase.rpc('react_to_team_message',{p_message_id:m.id,p_reaction:reaction});if(action.error)setNotice(action.error.message);else await loadMessages(selectedChannel,false);setBusy(false)}
 async function handleAnnouncement(a:Announcement){if(busy)return;const r=recipients.find(x=>x.announcement_id===a.id);if(!r)return;setBusy(true);const needsAck=a.requires_acknowledgment&&!r.acknowledged_at;const action=needsAck?await supabase.rpc('acknowledge_team_announcement',{p_announcement_id:a.id}):await supabase.rpc('mark_team_announcement_read',{p_announcement_id:a.id});setNotice(action.error?action.error.message:needsAck?c.acknowledged:c.markedRead);await load(selectedChannel);setBusy(false)}
 const priority=(value:Announcement['priority'])=>value==='urgent'?c.urgent:value==='important'?c.important:c.normal;

 if(!ready)return <main className={base.page}>{c.opening}</main>;
 return <main className={base.page}>
  <header className={base.header}><a className={base.iconButton} href="/employee" aria-label={c.back}><ChevronLeft size={20}/></a><div className={base.brand}><small>{c.staff}</small><strong>{c.messages}</strong></div><a className={base.iconButton} href="/employee/notifications" aria-label={c.notifications}><BellRing size={20}/>{unreadAnnouncements+unreadMessages>0&&<span className={base.badge}>{Math.min(99,unreadAnnouncements+unreadMessages)}</span>}</a></header>
  {notice&&<div className={base.notice}>{notice}</div>}
  <section className={base.hero}><small>{c.hub}</small><h1>{c.stay}</h1><p>{c.hero}</p><div className={base.next}><b>{requiredAcks?`${requiredAcks} ${requiredAcks===1?c.ackNeeded:c.acksNeeded}`:c.caughtUp}</b><span>{unreadMessages} {unreadMessages===1?c.unreadMessage:c.unreadMessages} · {unreadAnnouncements} {unreadAnnouncements===1?c.unreadAnnouncement:c.unreadAnnouncements}</span></div></section>

  <section className={base.section}><div className={base.sectionHead}><h2>{c.managerDuty}</h2><span>{managerState(manager)}</span></div>{manager?.available?<div className={base.row}><UsersRound size={20}/><span className={base.rowMain}><b>{manager.full_name}</b><small>{manager.state==='on_duty'&&manager.shift_ends_at?`${c.scheduledThrough} ${time(manager.shift_ends_at)}`:manager.state==='next_manager'&&manager.shift_starts_at?`${c.nextShift} ${dateTime(manager.shift_starts_at)}`:c.availableContact}</small></span><button className={base.button} disabled={busy||manager.employee_id===me} onClick={messageManager}><MessageSquare size={16}/> {c.message}</button></div>:<div className={base.empty}>{c.noManager}</div>}</section>

  <section className={base.section}><div className={base.sectionHead}><h2>{c.announcements}</h2><span>{requiredAcks?`${requiredAcks} ${c.requireAction}`:`${unreadAnnouncements} ${c.unread}`}</span></div><div className={base.list}>{announcements.map(a=>{const r=recipients.find(x=>x.announcement_id===a.id);if(!r)return null;const needsAck=a.requires_acknowledgment&&!r.acknowledged_at;const unread=!r.read_at;return <article id={`announcement-${a.id}`} key={a.id} className={`${base.row} ${unread||needsAck?base.notificationUnread:''}`}><span className={base.notificationIcon}>{needsAck?<BellRing size={18}/>:r.acknowledged_at?<CheckCircle2 size={18}/>:<span className={base.dot}/>}</span><span className={base.rowMain}><span className={base.notificationMeta}><span className={a.priority==='urgent'?base.criticalText:''}>{priority(a.priority)}</span><span>{new Date(a.sent_at).toLocaleDateString(locale==='es'?'es-US':'en-US',{month:'short',day:'numeric'})}</span>{a.requires_acknowledgment&&<span>{c.ackRequired}</span>}</span><b>{a.title}</b><small className={styles.announcementBody}>{a.body}</small>{a.expires_at&&<small>{c.expires} {dateTime(a.expires_at)}</small>}</span>{(unread||needsAck)&&<button className={base.button} disabled={busy} onClick={()=>handleAnnouncement(a)}>{needsAck?c.acknowledge:c.markRead}</button>}</article>})}{!announcements.length&&<div className={base.empty}>{c.noAnnouncements}</div>}</div></section>

  <section className={base.section}><div className={base.sectionHead}><h2>{c.messages}</h2><span>{c.privateMembers}</span></div><div className={styles.messageLayout}>
   <div className={styles.channelPane}>
    <div className={styles.newChat}><select aria-label={c.chooseTeammate} value={otherEmployee} onChange={e=>setOtherEmployee(e.target.value)}><option value="">{c.messageTeammate}</option>{directory.filter(x=>x.employee_id!==me).map(x=><option key={x.employee_id} value={x.employee_id}>{x.full_name}</option>)}</select><button className={base.button} disabled={busy||!otherEmployee} onClick={startDirect}>{c.start}</button></div>
    {staffFeatureEnabled('groupChats')&&<div className={styles.groupBuilder}><b>{c.newGroup}</b><input aria-label={c.groupName} maxLength={160} value={groupTitle} onChange={e=>{pendingGroupKey.current=null;setGroupTitle(e.target.value)}} placeholder={c.groupNamePlaceholder}/><div className={styles.newChat}><select aria-label={c.addMember} value={groupPicker} onChange={e=>setGroupPicker(e.target.value)}><option value="">{c.addMember}</option>{directory.filter(x=>x.employee_id!==me&&!groupMembers.includes(x.employee_id)).map(x=><option key={x.employee_id} value={x.employee_id}>{x.full_name}</option>)}</select><button className={base.button} type="button" disabled={!groupPicker} onClick={addGroupMember}>{c.add}</button></div>{groupMembers.length>0&&<div className={styles.chips}>{groupMembers.map(id=><button type="button" key={id} onClick={()=>removeGroupMember(id)}>{directory.find(x=>x.employee_id===id)?.full_name||id}<X size={12}/></button>)}</div>}<button className={base.button} disabled={busy||!groupTitle.trim()||!groupMembers.length} onClick={startGroup}>{c.createGroup}</button></div>}
    <div className={base.list}>{channels.map(ch=><button key={ch.id} onClick={()=>openChannel(ch.id)} className={`${base.row} ${ch.id===selectedChannel?base.notificationUnread:''}`}><MessageSquare size={17}/><span className={base.rowMain}><b>{channelName(ch)}</b><small>{ch.last_message||`${ch.member_count||0} ${c.members}`}</small></span>{Number(ch.unread_count)>0&&<span className={base.badge}>{Math.min(99,Number(ch.unread_count))}</span>}</button>)}{!channels.length&&<div className={base.empty}>{c.noConversations}</div>}</div>
   </div>
   <div className={styles.conversationPane}>{activeChannel?<><div className={styles.conversationHeader}><div><b>{channelName(activeChannel)}</b><small>{activeChannel.member_count||0} {c.members}</small></div><small>{messages.length} {messages.length===1?c.message:c.messages.toLowerCase()}</small></div><div className={styles.messages}>{messages.map(m=><div key={m.id} className={`${styles.bubbleWrap} ${m.mine?styles.mine:''}`}><div className={styles.bubble}>{m.reply_to_message_id&&<div className={styles.replyQuote}><b>{m.reply_to_author_name||c.message}</b><span>{m.reply_to_body||c.noMessagesYet}</span></div>}<b>{m.mine?c.you:m.author_name}</b><span>{m.body}</span><small>{time(m.created_at)}{m.mine&&m.recipient_count>0?` · ${c.read} ${m.read_by_count}/${m.recipient_count}`:''}</small><div className={styles.messageActions}><button type="button" disabled={busy} onClick={()=>{pendingSendKey.current=null;setReplyTo(m)}}><Reply size={12}/>{c.reply}</button>{reactionKeys.map(r=><button type="button" key={r} disabled={busy} className={(m.my_reactions||[]).includes(r)?styles.reactionActive:''} onClick={()=>toggleReaction(m,r)}>{reactionLabel(r)} {Number(m.reaction_counts?.[r]||0)>0?Number(m.reaction_counts?.[r]):''}</button>)}</div></div></div>)}{!messages.length&&<div className={base.empty}>{c.noMessagesYet}.</div>}</div>
    {activeChannel.channel_kind==='system'?<div className={base.empty}>{c.systemReadOnly}</div>:<form className={styles.composerStack} onSubmit={sendMessage}>{replyTo&&<div className={styles.replyPreview}><span><b>{c.replyingTo} {replyTo.mine?c.you:replyTo.author_name}</b><small>{replyTo.body.slice(0,160)}</small></span><button type="button" aria-label={c.cancelReply} onClick={()=>{pendingSendKey.current=null;setReplyTo(null)}}><X size={15}/></button></div>}{mentionIds.length>0&&<div className={styles.chips}>{mentionIds.map(id=><button type="button" key={id} onClick={()=>{pendingSendKey.current=null;setMentionIds(x=>x.filter(v=>v!==id))}}>@{directory.find(x=>x.employee_id===id)?.full_name||id}<X size={12}/></button>)}</div>}<div className={styles.mentionBar}><select aria-label={c.mention} value={mentionPicker} onChange={e=>setMentionPicker(e.target.value)}><option value="">{c.mention}</option>{mentionCandidates.filter(x=>!mentionIds.includes(x.employee_id)).map(x=><option key={x.employee_id} value={x.employee_id}>{x.full_name}</option>)}</select><button type="button" disabled={!mentionPicker} onClick={addMention}>{c.addMention}</button></div><div className={styles.composer}><input maxLength={2000} value={draft} onChange={e=>{setDraft(e.target.value);pendingSendKey.current=null}} placeholder={c.write}/><button className={base.button} disabled={busy||!draft.trim()} aria-label={c.send}><Send size={17}/></button></div></form>}</>:<div className={base.empty}>{c.chooseConversation}</div>}</div>
  </div></section>

  <nav className={base.tabs} aria-label={c.staffNav}><a className={base.tab} href="/employee"><Home size={19}/>{c.home}</a><a className={base.tab} href="/employee/schedule"><CalendarDays size={19}/>{c.schedule}</a><a className={base.tab} href="/employee/requests"><Clock3 size={19}/>{c.requests}</a><a className={`${base.tab} ${base.tabActive}`} href="/employee/team"><MessageSquare size={19}/>{c.messages}</a><a className={base.tab} href="/account"><UserRound size={19}/>{c.more}</a></nav>
 </main>
}
