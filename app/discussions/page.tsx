'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, MessageSquare, Plus, Send, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Room={id:string;name:string;description:string|null};
type Msg={id:string;room_id:string;body:string;created_at:string;author_user_id:string|null};
type Profile={id:string;full_name:string|null;app_role:string;location_id:string|null};

export default function DiscussionsPage(){
  const [me,setMe]=useState<Profile|null>(null),[rooms,setRooms]=useState<Room[]>([]),[room,setRoom]=useState<string|null>(null),[messages,setMessages]=useState<Msg[]>([]),[people,setPeople]=useState<Record<string,string>>({}),[text,setText]=useState(''),[loading,setLoading]=useState(true),[message,setMessage]=useState('');
  useEffect(()=>{void load()},[]);
  useEffect(()=>{if(room)void loadMessages(room)},[room]);
  async function load(){const {data:u}=await supabase.auth.getUser();if(!u.user){location.href='/';return;}const {data:p}=await supabase.from('profiles').select('id,full_name,app_role,location_id').eq('id',u.user.id).single();setMe(p as Profile);const [r,ps]=await Promise.all([supabase.from('discussion_rooms').select('id,name,description').order('name'),supabase.from('profiles').select('id,full_name')]);setRooms((r.data??[]) as Room[]);const map:Record<string,string>={};for(const x of ps.data??[])map[x.id]=x.full_name||'Team member';setPeople(map);if(r.data?.[0])setRoom(r.data[0].id);setLoading(false);}
  async function loadMessages(id:string){const {data}=await supabase.from('discussion_messages').select('id,room_id,body,created_at,author_user_id').eq('room_id',id).is('deleted_at',null).order('created_at');setMessages((data??[]) as Msg[]);}
  async function send(e:FormEvent){e.preventDefault();if(!room||!text.trim()||!me)return;const body=text.trim();setText('');const {error}=await supabase.from('discussion_messages').insert({room_id:room,author_user_id:me.id,body});if(error){setMessage(error.message);setText(body);return;}await loadMessages(room);}
  if(loading)return <div className="full-loader"><Loader2 className="spin"/><span>Opening discussions…</span></div>;
  return <div className="app-shell"><header className="topbar"><a className="round-button" href="/" aria-label="Back"><ArrowLeft/></a><div style={{flex:1}}><div className="brand-kicker">El Molino Ops</div><div className="brand-title">Discussions</div></div></header><main className="page">{message&&<div className="toast-message">{message}</div>}<div className="page-heading"><h1>Team communication</h1><p>Internal messages stay attached to the location instead of getting lost in text threads.</p></div><div className="room-tabs">{rooms.map(r=><button className={room===r.id?'active':''} key={r.id} onClick={()=>setRoom(r.id)}><MessageSquare size={15}/>{r.name}</button>)}</div><div className="discussion-feed">{messages.map(m=><div className={`discussion-message ${m.author_user_id===me?.id?'mine':''}`} key={m.id}><div className="person-avatar">{(people[m.author_user_id||'']||'?').slice(0,1)}</div><div><b>{people[m.author_user_id||'']||'Former user'}</b><small>{new Date(m.created_at).toLocaleString()}</small><p>{m.body}</p></div></div>)}{!messages.length&&<div className="empty-state"><MessageSquare/><b>No messages yet</b><span>Start the conversation for this channel.</span></div>}</div><form className="discussion-composer" onSubmit={send}><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Message the team…" maxLength={5000}/><button disabled={!text.trim()}><Send size={18}/></button></form></main></div>;
}
