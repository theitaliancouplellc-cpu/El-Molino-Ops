import { runPrimaryAgent } from './primary-ai-agent';
import { groqConfigured, runGroqAI } from './groq-ai';

export type AIRole = 'system' | 'user' | 'assistant';
export type AIMessage = { role: AIRole; content: string };
export type AIAttempt = { provider: string; model: string; ok: boolean; status?: number; reason?: string };
export type AIRouterResult = { text: string; provider: string; model: string; attempts: AIAttempt[] };
export type AILane = { id: string; provider: string; model: string; run: () => Promise<{ text: string; status?: number; retryAfterMs?: number; detail?: string }> };
type RouterState = { cooldowns: Map<string, number> };

const g = globalThis as typeof globalThis & { __elMolinoFreeAI?: RouterState };
const state: RouterState = g.__elMolinoFreeAI || (g.__elMolinoFreeAI = { cooldowns: new Map() });
function now(){return Date.now();}
function providerKey(provider:string){return `provider:${provider}`;}
function cooled(id:string,provider?:string){return (state.cooldowns.get(id)||0)>now()||Boolean(provider&&(state.cooldowns.get(providerKey(provider))||0)>now());}
function cool(id:string,ms:number){const safe=Number.isFinite(ms)?Math.min(Math.max(1000,ms),24*60*60_000):60_000;state.cooldowns.set(id,now()+safe);}
function coolProvider(provider:string,ms:number){cool(providerKey(provider),ms);}

export function resetAIRouterStateForTests(){state.cooldowns.clear();}

export function parseRetryAfter(value:string|null,baseNow=Date.now()){
  if(!value)return 0;const raw=value.trim();
  if(/^\d+(\.\d+)?$/.test(raw))return Math.min(Math.max(0,Number(raw)*1000),24*60*60_000);
  const date=Date.parse(raw);if(Number.isNaN(date))return 0;
  return Math.min(Math.max(0,date-baseNow),24*60*60_000);
}

export function classifyProviderFailure(status:number,body='',retryAfterMs=0){
  const text=body.toLowerCase();
  if(status>=200&&status<300)return {reason:'empty_response',cooldownMs:15_000};
  if(status===429||text.includes('rate limit')||text.includes('quota'))return {reason:'quota_or_rate_limit',cooldownMs:retryAfterMs||60_000};
  if(status===401)return {reason:'invalid_credentials',cooldownMs:30*60_000};
  if(status===402||text.includes('insufficient credit')||text.includes('billing')||text.includes('payment'))return {reason:'free_quota_exhausted',cooldownMs:6*60*60_000};
  if(status===403)return {reason:'provider_forbidden',cooldownMs:30*60_000};
  if(status===404||status===400)return {reason:'model_unavailable',cooldownMs:15*60_000};
  if(status>=500)return {reason:'provider_error',cooldownMs:30_000};
  return {reason:'request_failed',cooldownMs:60_000};
}

function shouldCoolWholeProvider(reason:string){return ['quota_or_rate_limit','invalid_credentials','free_quota_exhausted','provider_forbidden'].includes(reason);}

export async function runLanePlan(lanes:AILane[],start=0):Promise<AIRouterResult|null>{
  if(!lanes.length)return null;const attempts:AIAttempt[]=[];
  for(let n=0;n<lanes.length;n++){
    const lane=lanes[(start+n)%lanes.length];
    if(cooled(lane.id,lane.provider)){attempts.push({provider:lane.provider,model:lane.model,ok:false,reason:'cooldown'});continue;}
    let result:{text:string;status?:number;retryAfterMs?:number;detail?:string};
    try{result=await lane.run();}catch(e){result={text:'',status:599,detail:e instanceof Error?e.message:'provider_exception'};}
    if(result.text){attempts.push({provider:lane.provider,model:lane.model,ok:true,status:result.status});return {text:result.text,provider:lane.provider,model:lane.model,attempts};}
    const failure=classifyProviderFailure(result.status||599,result.detail||'',result.retryAfterMs||0);cool(lane.id,failure.cooldownMs);if(shouldCoolWholeProvider(failure.reason))coolProvider(lane.provider,failure.cooldownMs);attempts.push({provider:lane.provider,model:lane.model,ok:false,status:result.status,reason:failure.reason});
  }
  return null;
}

export function configuredFreeProviders(){return {openrouter:false,gemini:false,groq:groqConfigured(),githubModels:false,cloudflare:false,vercelGateway:true};}

export async function runFreeAI(messages:AIMessage[]):Promise<AIRouterResult|null>{
  if(groqConfigured()){
    const groq=await runGroqAI(messages);
    if(groq)return {text:groq.text,provider:groq.provider,model:groq.model,attempts:[{provider:groq.provider,model:groq.model,ok:true,status:200}]};
  }
  const result=await runPrimaryAgent(messages);
  if(!result)return null;
  return {text:result.text,provider:result.provider,model:result.model,attempts:[{provider:result.provider,model:result.model,ok:true,status:200}]};
}
