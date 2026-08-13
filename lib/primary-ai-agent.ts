import type { AIMessage } from './free-ai-router';

export type PrimaryAgentResult={text:string;provider:string;model:string};

function env(name:string){return String(process.env[name]||'').trim();}

async function fetchWithTimeout(url:string,init:RequestInit,timeoutMs=20_000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Math.min(Math.max(timeoutMs,2_000),30_000));
  try{return await fetch(url,{...init,signal:controller.signal,cache:'no-store'});}finally{clearTimeout(timer);}
}

export function primaryAgentConfigured(){
  return Boolean(env('AI_GATEWAY_API_KEY')||env('VERCEL_OIDC_TOKEN'));
}

export async function runPrimaryAgent(messages:AIMessage[]):Promise<PrimaryAgentResult|null>{
  const token=env('AI_GATEWAY_API_KEY')||env('VERCEL_OIDC_TOKEN');
  if(!token)return null;
  const model=env('EL_MOLINO_AGENT_MODEL')||'google/gemini-3.6-flash';
  const fallbacks=(env('EL_MOLINO_AGENT_FALLBACK_MODELS')||'openai/gpt-5.6-sol,anthropic/claude-sonnet-5').split(',').map(v=>v.trim()).filter(Boolean).filter(v=>v!==model).slice(0,3);
  try{
    const response=await fetchWithTimeout('https://ai-gateway.vercel.sh/v1/chat/completions',{
      method:'POST',
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      body:JSON.stringify({model,models:fallbacks,messages,max_tokens:1800,stream:false,temperature:0.35}),
    });
    const raw=await response.text();
    if(!response.ok){console.error('PRIMARY_AI_AGENT_FAILED',response.status,raw.slice(0,500));return null;}
    const data=JSON.parse(raw);
    const text=String(data?.choices?.[0]?.message?.content||'').trim();
    if(!text)return null;
    return {text,provider:'Vercel AI Gateway',model:String(data?.model||model)};
  }catch(error){
    console.error('PRIMARY_AI_AGENT_ERROR',error instanceof Error?error.message:'unknown');
    return null;
  }
}
