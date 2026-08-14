'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { buildLocalAIMessages, type LocalHistoryMessage } from '@/lib/local-ai-prompt';
import { runLocalBrowserAI } from '@/lib/local-ai-client';

function visibleHistory():LocalHistoryMessage[]{
  if(typeof document==='undefined')return [];
  return Array.from(document.querySelectorAll<HTMLElement>('.chat .chat-row')).map(row=>{
    const role=row.classList.contains('user')?'user':row.classList.contains('assistant')?'assistant':null;
    if(!role)return null;
    const bubble=row.querySelector<HTMLElement>('.bubble');
    const content=bubble?.querySelector<HTMLElement>(':scope > div')?.textContent?.trim()||'';
    if(!content||content==='Thinking…')return null;
    return {role,content};
  }).filter((m):m is LocalHistoryMessage=>Boolean(m)).slice(-20);
}

function jsonResponse(payload:unknown,status=200){return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})}
function isAskPost(input:RequestInfo|URL,init?:RequestInit){const url=typeof input==='string'?input:input instanceof URL?input.toString():input.url;return url.endsWith('/api/ask')&&String(init?.method||'GET').toUpperCase()==='POST'&&typeof init?.body==='string'}

export default function AskAgentBridge(){
  useEffect(()=>{
    const original=window.fetch.bind(window);
    const wrapped=async(input:RequestInfo|URL,init?:RequestInit)=>{
      if(!isAskPost(input,init))return original(input,init);
      let body:any;
      try{body=JSON.parse(String(init?.body||'{}'));}catch{return original(input,init)}
      const question=String(body?.question||'').trim();
      if(!question)return original(input,init);

      const history=Array.isArray(body.history)?body.history:visibleHistory();
      if(history.at(-1)?.role==='user'&&String(history.at(-1)?.content||'').trim()===question)history.pop();
      body.history=history.slice(-20);

      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token)return original(input,{...init,body:JSON.stringify(body)});

      const headers=new Headers(init?.headers||{});
      headers.set('content-type','application/json');
      headers.set('authorization',`Bearer ${session.access_token}`);
      const requestInit={...init,headers,body:JSON.stringify(body)};

      let remote:Response|null=null;
      let remotePayload:any=null;
      try{
        remote=await original(input,requestInit);
        const contentType=remote.headers.get('content-type')||'';
        if(contentType.includes('application/json')){
          try{remotePayload=await remote.clone().json();}catch{}
        }
        if(remote.ok&&remotePayload?.answer&&!remotePayload?.degraded)return remote;
        if([401,413,429].includes(remote.status))return remote;
        if(remote.ok&&!remotePayload?.degraded)return remote;
      }catch{}

      try{
        const messages=buildLocalAIMessages({question,history:body.history,knowledge:body.knowledge,procedures:body.procedures});
        const local=await runLocalBrowserAI(messages);
        return jsonResponse({
          ...(remotePayload&&typeof remotePayload==='object'?remotePayload:{}),
          answer:local.text,
          citations:Array.isArray(remotePayload?.citations)?remotePayload.citations:[],
          local:true,
          degraded:false,
          ai:{provider:'On-device AI',model:local.model,device:local.device},
          source:'On-device AI'
        });
      }catch(error){
        if(remote)return remote;
        return jsonResponse({answer:'I could not reach a hosted model, and this device could not start the local AI fallback. Please retry once the connection is stable.',citations:[],degraded:true,diagnostic:error instanceof Error?error.message:'local_ai_failed'},200);
      }
    };
    window.fetch=wrapped;
    return()=>{if(window.fetch===wrapped)window.fetch=original};
  },[]);
  return null;
}
