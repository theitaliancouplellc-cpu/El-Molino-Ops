'use client';

import { useEffect } from 'react';

type HistoryMessage={role:'user'|'assistant';content:string};

function visibleHistory():HistoryMessage[]{
  if(typeof document==='undefined')return [];
  return Array.from(document.querySelectorAll<HTMLElement>('.chat .chat-row')).map(row=>{
    const role=row.classList.contains('user')?'user':row.classList.contains('assistant')?'assistant':null;
    const bubble=row.querySelector<HTMLElement>('.bubble');
    const content=bubble?.querySelector<HTMLElement>(':scope > div')?.textContent?.trim()||'';
    return role&&content?{role,content}:null;
  }).filter((m):m is HistoryMessage=>Boolean(m)).slice(-20);
}

export default function AskAgentBridge(){
  useEffect(()=>{
    const original=window.fetch.bind(window);
    window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
      const url=typeof input==='string'?input:input instanceof URL?input.toString():input.url;
      if(url.endsWith('/api/ask')&&String(init?.method||'GET').toUpperCase()==='POST'&&typeof init?.body==='string'){
        try{
          const body=JSON.parse(init.body);
          const question=String(body?.question||'').trim();
          if(question){
            const history=visibleHistory();
            if(history.at(-1)?.role==='user'&&history.at(-1)?.content===question)history.pop();
            body.history=history;
            body.question=`El Molino conversation turn: ${question}`;
            init={...init,body:JSON.stringify(body)};
          }
        }catch{}
      }
      return original(input,init);
    };
    return()=>{window.fetch=original;};
  },[]);
  return null;
}
