'use client';

import type { LocalAIMessage } from './local-ai-prompt';

type WorkerResult={id:string;ok:boolean;text?:string;model?:string;device?:string;error?:string};
type Pending={resolve:(value:{text:string;model:string;device:string})=>void;reject:(reason:Error)=>void;timer:number};

let worker:Worker|null=null;
const pending=new Map<string,Pending>();

function ensureWorker(){
  if(worker)return worker;
  worker=new Worker(new URL('./local-ai.worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=(event:MessageEvent<WorkerResult>)=>{
    const data=event.data;const p=pending.get(data.id);if(!p)return;
    window.clearTimeout(p.timer);pending.delete(data.id);
    if(data.ok&&data.text)p.resolve({text:data.text,model:data.model||'local-model',device:data.device||'local'});
    else p.reject(new Error(data.error||'Local AI failed'));
  };
  worker.onerror=(event)=>{
    const error=new Error(event.message||'Local AI worker failed');
    for(const [id,p] of pending){window.clearTimeout(p.timer);p.reject(error);pending.delete(id)}
    worker?.terminate();worker=null;
  };
  return worker;
}

export function localAIAvailable(){return typeof window!=='undefined'&&typeof Worker!=='undefined'}

export async function runLocalBrowserAI(messages:LocalAIMessage[],timeoutMs=180_000){
  if(!localAIAvailable())throw new Error('This browser cannot run the local AI fallback');
  const id=`local-ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const w=ensureWorker();
  return new Promise<{text:string;model:string;device:string}>((resolve,reject)=>{
    const timer=window.setTimeout(()=>{pending.delete(id);reject(new Error('Local AI timed out while loading or generating'))},Math.max(30_000,timeoutMs));
    pending.set(id,{resolve,reject,timer});
    w.postMessage({id,messages});
  });
}
