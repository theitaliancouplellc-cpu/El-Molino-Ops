'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { safeFetchWithRetry } from '@/lib/retry';
import { friendlyErrorText } from './error-sanitizer';

type ChatTurn = { role:'user'|'assistant'; content:string };
type ProposedAction = {
  type:'task'|'procedure'|'knowledge';
  title:string;
  description?:string;
  content?:string;
  priority?:'low'|'normal'|'high'|'urgent';
};

function visibleConversation(question:string): ChatTurn[] {
  try {
    const rows = Array.from(document.querySelectorAll<HTMLElement>('.chat-row.user,.chat-row.assistant'));
    const history: ChatTurn[] = rows.map(row => {
      const role: ChatTurn['role'] = row.classList.contains('user') ? 'user' : 'assistant';
      const bubble = row.querySelector<HTMLElement>('.bubble');
      if (!bubble) return null;
      const clone = bubble.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.feedback-row,.source-label,button,[role="dialog"]').forEach(x=>x.remove());
      const content = (clone.textContent || '').replace(/\s+/g,' ').trim().slice(0,3500);
      if (!content || content === 'Thinking…') return null;
      return { role, content };
    }).filter(Boolean) as ChatTurn[];

    if (history.length && history[history.length-1].role === 'user' && history[history.length-1].content.trim() === question.trim()) history.pop();
    return history.slice(-20);
  } catch { return []; }
}

function validAction(value:any):ProposedAction|null{
  if(!value||!['task','procedure','knowledge'].includes(value.type))return null;
  const title=String(value.title||'').trim().slice(0,200);if(!title)return null;
  const description=String(value.description||'').trim().slice(0,8000)||undefined;
  const content=String(value.content||'').trim().slice(0,12000)||undefined;
  const priority=['low','normal','high','urgent'].includes(value.priority)?value.priority:'normal';
  if(value.type==='knowledge'&&!content&&!description)return null;
  return {type:value.type,title,description,content,priority};
}

export default function PWARegister() {
  const [pendingAction,setPendingAction]=useState<ProposedAction|null>(null);
  const [actionBusy,setActionBusy]=useState(false);
  const [actionMessage,setActionMessage]=useState('');
  const actionLock=useRef(false);

  useEffect(() => {
    let registration: ServiceWorkerRegistration | null = null;
    let reloading = false;
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, incomingInit?: RequestInit) => {
      let init={...(incomingInit||{})};
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method=(init.method||((typeof Request!=='undefined'&&input instanceof Request)?input.method:'GET')).toUpperCase();
      const isAsk=url.endsWith('/api/ask') && method==='POST';
      const isAIWrite=url.endsWith('/api/ai-action') && method==='POST';

      if(isAsk)setPendingAction(null);
      if(isAsk||isAIWrite){
        try{
          let {data:sessionData}=await supabase.auth.getSession();
          if(!sessionData.session){const refreshed=await supabase.auth.refreshSession();sessionData=refreshed.data;}
          const headers=new Headers(init.headers||{});headers.set('content-type','application/json');
          if(sessionData.session?.access_token)headers.set('authorization',`Bearer ${sessionData.session.access_token}`);
          if(isAsk&&typeof init.body==='string'){
            try{const body=JSON.parse(init.body);const question=String(body.question||'').trim();body.history=visibleConversation(question);init={...init,headers,body:JSON.stringify(body)};}
            catch{init={...init,headers};}
          }else init={...init,headers};
        }catch{}
      }

      const perform=(i:RequestInit)=>safeFetchWithRetry(input,i,nativeFetch as typeof fetch);
      let response=await perform(init);
      if(isAsk&&response.status===401){
        try{
          const refreshed=await supabase.auth.refreshSession();const token=refreshed.data.session?.access_token;
          if(token){const headers=new Headers(init.headers||{});headers.set('authorization',`Bearer ${token}`);init={...init,headers};response=await perform(init);}
        }catch{}
      }
      if(isAsk&&response.ok){
        try{const data=await response.clone().json();const action=validAction(data?.action);if(action)setPendingAction(action);}catch{}
      }
      return response;
    };

    const adoptUpdate = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    const checkForUpdate = async () => {
      try {
        if (!registration) return;
        await registration.update();
        if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } catch {}
    };

    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(async reg => {
        registration = reg;await checkForUpdate();
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;if (!worker) return;
          worker.addEventListener('statechange', () => {if (worker.state === 'installed' && navigator.serviceWorker.controller) worker.postMessage({ type: 'SKIP_WAITING' });});
        });
      }).catch(() => undefined);
      navigator.serviceWorker.addEventListener('controllerchange', adoptUpdate);
    }

    const updateNetworkState = () => { document.documentElement.dataset.network = navigator.onLine ? 'online' : 'offline'; };
    const checkWhenVisible = () => { if (document.visibilityState === 'visible') void checkForUpdate(); };
    const checkOnPageShow = () => void checkForUpdate();
    const checkOnFocus = () => void checkForUpdate();
    updateNetworkState();
    window.addEventListener('online', updateNetworkState);window.addEventListener('offline', updateNetworkState);
    document.addEventListener('visibilitychange', checkWhenVisible);window.addEventListener('pageshow', checkOnPageShow);window.addEventListener('focus', checkOnFocus);
    void recordPageView();

    return () => {
      if(window.fetch!==nativeFetch)window.fetch=nativeFetch;
      window.removeEventListener('online', updateNetworkState);window.removeEventListener('offline', updateNetworkState);
      document.removeEventListener('visibilitychange', checkWhenVisible);window.removeEventListener('pageshow', checkOnPageShow);window.removeEventListener('focus', checkOnFocus);
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('controllerchange', adoptUpdate);
    };
  }, []);

  async function confirmAction(){
    if(!pendingAction||actionLock.current)return;
    actionLock.current=true;setActionBusy(true);setActionMessage('');
    try{
      const action=validAction(pendingAction);if(!action)throw new Error('That draft is incomplete. Ask AI to prepare it again.');
      const {data:u}=await supabase.auth.getUser();if(!u.user)throw new Error('Please sign in again.');
      const {data:p,error:profileError}=await supabase.from('profiles').select('location_id,app_role').eq('id',u.user.id).single();
      if(profileError||!p?.location_id)throw new Error('Your app profile could not be loaded.');
      if(!['admin','manager'].includes(p.app_role))throw new Error('Manager access is required to create records from AI.');

      let entityId:string|null=null;
      if(action.type==='task'){
        const {data,error}=await supabase.from('tasks').insert({location_id:p.location_id,title:action.title,description:action.description?.slice(0,4000)||null,priority:action.priority||'normal',created_by:u.user.id}).select('id').single();
        if(error)throw error;entityId=data.id;
      }else if(action.type==='procedure'){
        const {data,error}=await supabase.from('procedures').insert({location_id:p.location_id,title:action.title,description:action.description||null,status:'draft'}).select('id').single();
        if(error)throw error;entityId=data.id;
      }else{
        const content=(action.content||action.description||'').trim();if(!content)throw new Error('Knowledge content cannot be empty.');
        const {data,error}=await supabase.from('knowledge_items').insert({location_id:p.location_id,title:action.title,content,category:'operational_knowledge',status:'draft'}).select('id').single();
        if(error)throw error;entityId=data.id;
      }

      const audit=await supabase.from('activity_log').insert({location_id:p.location_id,actor_user_id:u.user.id,action:'ai_created',entity_type:action.type,entity_id:entityId,summary:`AI-assisted ${action.type} created: ${action.title}`});
      setActionMessage(audit.error?'Created, but activity history could not update.':'Created successfully.');
      setPendingAction(null);window.setTimeout(()=>setActionMessage(''),3000);
    }catch(e){setActionMessage(friendlyErrorText(e instanceof Error?e.message:'Could not create that record.'));}
    finally{actionLock.current=false;setActionBusy(false);}
  }

  async function recordPageView(){
    try{
      const {data:u}=await supabase.auth.getUser();if(!u.user)return;
      const {data:p}=await supabase.from('profiles').select('location_id').eq('id',u.user.id).maybeSingle();
      await supabase.from('client_events').insert({location_id:p?.location_id??null,user_id:u.user.id,event_type:'page_view',route:window.location.pathname,metadata:{standalone:window.matchMedia('(display-mode: standalone)').matches,screen:`${window.screen.width}x${window.screen.height}`}});
    }catch{}
  }

  return <>
    {pendingAction&&<div style={{position:'fixed',left:12,right:12,bottom:'max(86px, calc(env(safe-area-inset-bottom) + 74px))',zIndex:9999,maxWidth:620,margin:'0 auto',background:'var(--card, #fff)',color:'var(--text, #111)',border:'1px solid rgba(127,127,127,.25)',borderRadius:18,padding:16,boxShadow:'0 18px 50px rgba(0,0,0,.22)'}} role="dialog" aria-modal="true" aria-label="Confirm AI action">
      <div style={{fontSize:12,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',opacity:.6}}>AI wants to create a {pendingAction.type}</div>
      <div style={{fontSize:18,fontWeight:750,marginTop:5}}>{pendingAction.title}</div>
      {(pendingAction.description||pendingAction.content)&&<div style={{fontSize:14,lineHeight:1.45,marginTop:8,opacity:.78,maxHeight:120,overflow:'auto'}}>{pendingAction.description||pendingAction.content}</div>}
      <div style={{display:'flex',gap:8,marginTop:14}}>
        <button onClick={()=>setPendingAction(null)} disabled={actionBusy} style={{flex:1,borderRadius:12,padding:'11px 14px',border:'1px solid rgba(127,127,127,.3)',background:'transparent',color:'inherit',fontWeight:700}}>Cancel</button>
        <button onClick={confirmAction} disabled={actionBusy} style={{flex:1,borderRadius:12,padding:'11px 14px',border:0,background:'#1f7a4d',color:'#fff',fontWeight:800}}>{actionBusy?'Creating…':'Confirm'}</button>
      </div>
    </div>}
    {actionMessage&&<div role="status" style={{position:'fixed',left:12,right:12,bottom:'max(94px, calc(env(safe-area-inset-bottom) + 82px))',zIndex:10000,maxWidth:620,margin:'0 auto',background:'#111',color:'#fff',padding:'10px 14px',borderRadius:12,fontSize:13,fontWeight:700,textAlign:'center',overflowWrap:'anywhere'}}>{actionMessage}</div>}
  </>;
}
