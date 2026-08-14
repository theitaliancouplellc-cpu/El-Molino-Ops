'use client';

import type { LocalAIMessage } from './local-ai-prompt';

type PuterChatResponse={message?:{content?:unknown}};
type PuterModel={id?:string;provider?:string;cost?:{input?:number;output?:number}};
type PuterAPI={
  auth?:{
    isSignedIn?:()=>boolean;
    signIn?:(options?:{attempt_temp_user_creation?:boolean})=>Promise<unknown>;
  };
  ai?:{
    chat?:(messages:LocalAIMessage[],options?:Record<string,unknown>)=>Promise<PuterChatResponse>;
    listModels?:()=>Promise<PuterModel[]>;
  };
};

declare global{interface Window{puter?:PuterAPI}}

let scriptPromise:Promise<PuterAPI>|null=null;

function loaded(){return typeof window!=='undefined'&&Boolean(window.puter?.ai?.chat);}

export function preparePuterAI():Promise<PuterAPI>{
  if(typeof window==='undefined')return Promise.reject(new Error('Puter AI requires a browser'));
  if(loaded())return Promise.resolve(window.puter as PuterAPI);
  if(scriptPromise)return scriptPromise;
  scriptPromise=new Promise<PuterAPI>((resolve,reject)=>{
    const existing=document.querySelector<HTMLScriptElement>('script[data-el-molino-puter]');
    const finish=()=>window.puter?.ai?.chat?resolve(window.puter):reject(new Error('Puter AI did not initialize'));
    if(existing){
      if(loaded())finish();
      else{existing.addEventListener('load',finish,{once:true});existing.addEventListener('error',()=>reject(new Error('Puter AI script failed to load')),{once:true});}
      return;
    }
    const script=document.createElement('script');
    script.src='https://js.puter.com/v2/';
    script.async=true;
    script.dataset.elMolinoPuter='1';
    script.addEventListener('load',finish,{once:true});
    script.addEventListener('error',()=>reject(new Error('Puter AI script failed to load')),{once:true});
    document.head.appendChild(script);
  }).catch(error=>{scriptPromise=null;throw error});
  return scriptPromise;
}

export function beginPuterAuthFromUserGesture():Promise<boolean>|null{
  const api=typeof window!=='undefined'?window.puter:undefined;
  if(!api?.ai?.chat)return null;
  try{
    if(api.auth?.isSignedIn?.())return Promise.resolve(true);
    if(!api.auth?.signIn)return null;
    return api.auth.signIn({attempt_temp_user_creation:true}).then(()=>true).catch(()=>false);
  }catch{return Promise.resolve(false);}
}

function contentText(value:unknown):string{
  if(typeof value==='string')return value.trim();
  if(Array.isArray(value))return value.map((part:any)=>typeof part==='string'?part:typeof part?.text==='string'?part.text:'').join('').trim();
  if(value&&typeof value==='object'&&typeof (value as any).text==='string')return String((value as any).text).trim();
  return '';
}

function withTimeout<T>(promise:Promise<T>,ms:number){
  return new Promise<T>((resolve,reject)=>{
    const timer=window.setTimeout(()=>reject(new Error('Hosted browser AI timed out')),ms);
    promise.then(value=>{window.clearTimeout(timer);resolve(value)},error=>{window.clearTimeout(timer);reject(error)});
  });
}

async function currentModelPlan(api:PuterAPI){
  const verifiedDefault='gpt-5.4-nano';
  if(!api.ai?.listModels)return [verifiedDefault];
  try{
    const catalog=await withTimeout(api.ai.listModels(),8_000);
    const ids=catalog.map(model=>String(model?.id||'').trim()).filter(Boolean);
    const zeroCost=catalog.filter(model=>model?.cost?.input===0&&model?.cost?.output===0).map(model=>String(model.id||'').trim()).filter(Boolean);
    const preferred=[...zeroCost,verifiedDefault,...ids.filter(id=>/gpt-5.*nano|gemini.*flash|qwen.*(?:flash|instruct)/i.test(id))];
    return [...new Set(preferred)].filter(id=>ids.includes(id)).slice(0,4).length
      ? [...new Set(preferred)].filter(id=>ids.includes(id)).slice(0,4)
      : [verifiedDefault];
  }catch{return [verifiedDefault];}
}

export async function runPuterBrowserAI(messages:LocalAIMessage[],authAttempt?:Promise<boolean>|null){
  const api=await preparePuterAI();
  if(authAttempt){const ok=await withTimeout(authAttempt,20_000).catch(()=>false);if(!ok)throw new Error('Puter AI authorization was not completed');}
  const models=await currentModelPlan(api);
  let lastError='Puter AI did not return a response';
  for(const model of models){
    try{
      const response=await withTimeout(api.ai!.chat!(messages,{model,temperature:0.35,max_tokens:1800,stream:false}),35_000);
      const text=contentText(response?.message?.content);
      if(text)return {text,model,provider:'Puter Hosted AI'};
      lastError='Puter AI returned empty text';
    }catch(error){lastError=error instanceof Error?error.message:'Puter AI request failed';}
  }
  throw new Error(lastError);
}
