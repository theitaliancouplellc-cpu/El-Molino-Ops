export type AIRole = 'system' | 'user' | 'assistant';
export type AIMessage = { role: AIRole; content: string };
export type AIAttempt = { provider: string; model: string; ok: boolean; status?: number; reason?: string };
export type AIRouterResult = { text: string; provider: string; model: string; attempts: AIAttempt[] };
export type AILane = { id: string; provider: string; model: string; run: () => Promise<{ text: string; status?: number; retryAfterMs?: number; detail?: string }> };
type RouterState = { cursor: number; cooldowns: Map<string, number> };

const g = globalThis as typeof globalThis & { __elMolinoFreeAI?: RouterState };
const state: RouterState = g.__elMolinoFreeAI || (g.__elMolinoFreeAI = { cursor: 0, cooldowns: new Map() });

function env(name: string) { return String(process.env[name] || '').trim(); }
function boolEnv(name: string, fallback = true) { const v = env(name).toLowerCase(); return v ? !['0','false','off','no'].includes(v) : fallback; }
function cleanText(v: unknown) { return String(v ?? '').trim(); }
function now() { return Date.now(); }
function providerKey(provider:string){return `provider:${provider}`;}
function cooled(id: string, provider?:string) { return (state.cooldowns.get(id) || 0) > now() || Boolean(provider&&(state.cooldowns.get(providerKey(provider))||0)>now()); }
function cool(id: string, ms: number) { const safe=Number.isFinite(ms)?Math.min(Math.max(1000,ms),24*60*60_000):60_000;state.cooldowns.set(id, now() + safe); }
function coolProvider(provider:string,ms:number){cool(providerKey(provider),ms);}

export function resetAIRouterStateForTests(){ state.cursor=0; state.cooldowns.clear(); }

export function parseRetryAfter(value:string|null,baseNow=Date.now()){
  if(!value)return 0;const raw=value.trim();
  if(/^\d+(\.\d+)?$/.test(raw))return Math.min(Math.max(0,Number(raw)*1000),24*60*60_000);
  const date=Date.parse(raw);if(Number.isNaN(date))return 0;
  return Math.min(Math.max(0,date-baseNow),24*60*60_000);
}

export function classifyProviderFailure(status: number, body = '', retryAfterMs = 0) {
  const text = body.toLowerCase();
  if (status >= 200 && status < 300) return { reason: 'empty_response', cooldownMs: 15_000 };
  if (status === 429 || text.includes('rate limit') || text.includes('quota')) return { reason: 'quota_or_rate_limit', cooldownMs: retryAfterMs || 60_000 };
  if (status === 401) return { reason: 'invalid_credentials', cooldownMs: 30 * 60_000 };
  if (status === 402 || text.includes('insufficient credit') || text.includes('billing') || text.includes('payment')) return { reason: 'free_quota_exhausted', cooldownMs: 6 * 60 * 60_000 };
  if (status === 403) return { reason: 'provider_forbidden', cooldownMs: 30 * 60_000 };
  if (status === 404 || status === 400) return { reason: 'model_unavailable', cooldownMs: 15 * 60_000 };
  if (status >= 500) return { reason: 'provider_error', cooldownMs: 30_000 };
  return { reason: 'request_failed', cooldownMs: 60_000 };
}

async function fetchTimeout(url: string, init: RequestInit, timeoutMs = Number(env('AI_PROVIDER_TIMEOUT_MS')) || 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(1000,timeoutMs),20_000));
  try { return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' }); }
  finally { clearTimeout(timer); }
}

async function openAICompatible(url: string, key: string, model: string, messages: AIMessage[], extraHeaders: Record<string,string> = {}) {
  try {
    const r = await fetchTimeout(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...extraHeaders }, body: JSON.stringify({ model, messages, max_tokens: 1600, stream: false }) });
    const body = await r.text();
    if (!r.ok) return { text: '', status: r.status, retryAfterMs: parseRetryAfter(r.headers.get('retry-after')), detail: body.slice(0,600) };
    const data = JSON.parse(body);
    return { text: cleanText(data?.choices?.[0]?.message?.content), status: r.status };
  } catch (e) { return { text: '', status: 599, detail: e instanceof Error ? e.message : 'network_error' }; }
}

function openRouterLane(messages: AIMessage[]): AILane | null {
  const key = env('OPENROUTER_API_KEY'); if (!key || !boolEnv('OPENROUTER_FREE_ONLY', true)) return null;
  return { id: 'openrouter:free-router', provider: 'OpenRouter Free Router', model: 'openrouter/free', run: () => openAICompatible('https://openrouter.ai/api/v1/chat/completions', key, 'openrouter/free', messages, { 'HTTP-Referer': env('NEXT_PUBLIC_APP_URL') || 'https://el-molino-ops.vercel.app', 'X-Title': 'El Molino Ops' }) };
}

function geminiLanes(messages: AIMessage[]): AILane[] {
  const key = env('GEMINI_API_KEY'); if (!key || !boolEnv('GEMINI_FREE_ONLY', true)) return [];
  const system = messages.find(m => m.role === 'system')?.content || '';
  const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const models = (env('GEMINI_FREE_MODELS') || 'gemini-2.5-flash,gemini-2.5-flash-lite').split(',').map(s=>s.trim()).filter(Boolean);
  return models.map(model => ({ id: `gemini:${model}`, provider: 'Google Gemini Free Tier', model, run: async () => {
    try {
      const r = await fetchTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ systemInstruction: system ? { parts:[{text:system}] } : undefined, contents, generationConfig: { maxOutputTokens: 1600 } }) });
      const body = await r.text(); if (!r.ok) return { text:'', status:r.status, retryAfterMs:parseRetryAfter(r.headers.get('retry-after')), detail:body.slice(0,600) };
      const data = JSON.parse(body); return { text: cleanText(data?.candidates?.[0]?.content?.parts?.map((p:any)=>p?.text||'').join('\n')), status:r.status };
    } catch(e) { return { text:'', status:599, detail:e instanceof Error?e.message:'network_error' }; }
  }}));
}

function groqLanes(messages: AIMessage[]): AILane[] {
  const key = env('GROQ_API_KEY'); if (!key || !boolEnv('GROQ_FREE_ONLY', true)) return [];
  const models = (env('GROQ_FREE_MODELS') || 'openai/gpt-oss-120b,openai/gpt-oss-20b,llama-3.3-70b-versatile').split(',').map(s=>s.trim()).filter(Boolean);
  return models.map(model => ({ id:`groq:${model}`, provider:'Groq Free Tier', model, run:()=>openAICompatible('https://api.groq.com/openai/v1/chat/completions',key,model,messages) }));
}

function githubLanes(messages: AIMessage[]): AILane[] {
  const key = env('GITHUB_MODELS_TOKEN'); if (!key || !boolEnv('GITHUB_MODELS_FREE_ONLY', true)) return [];
  const models = (env('GITHUB_FREE_MODELS') || 'openai/gpt-4.1-mini,openai/gpt-4o-mini,meta/Llama-3.3-70B-Instruct').split(',').map(s=>s.trim()).filter(Boolean);
  return models.map(model => ({ id:`github:${model}`, provider:'GitHub Models Free Quota', model, run:()=>openAICompatible('https://models.github.ai/inference/chat/completions',key,model,messages,{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}) }));
}

function cloudflareLanes(messages: AIMessage[]): AILane[] {
  const account = env('CLOUDFLARE_ACCOUNT_ID'), token = env('CLOUDFLARE_API_TOKEN');
  if (!account || !token || !boolEnv('CLOUDFLARE_FREE_ONLY', true)) return [];
  const models = (env('CLOUDFLARE_FREE_MODELS') || '@cf/meta/llama-3.2-3b-instruct').split(',').map(s=>s.trim()).filter(Boolean);
  return models.map(model => ({ id:`cloudflare:${model}`, provider:'Cloudflare Workers AI Free Allocation', model, run:async()=>{
    try {
      const r = await fetchTimeout(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${model}`, { method:'POST', headers:{'content-type':'application/json',authorization:`Bearer ${token}`}, body:JSON.stringify({messages,max_tokens:1600}) });
      const body = await r.text(); if(!r.ok) return {text:'',status:r.status,retryAfterMs:parseRetryAfter(r.headers.get('retry-after')),detail:body.slice(0,600)};
      const data = JSON.parse(body); return {text:cleanText(data?.result?.response || data?.result?.text),status:r.status};
    } catch(e){return {text:'',status:599,detail:e instanceof Error?e.message:'network_error'};}
  }}));
}

export function configuredFreeProviders() {
  return {
    openrouter: Boolean(env('OPENROUTER_API_KEY') && boolEnv('OPENROUTER_FREE_ONLY',true)),
    gemini: Boolean(env('GEMINI_API_KEY') && boolEnv('GEMINI_FREE_ONLY',true)),
    groq: Boolean(env('GROQ_API_KEY') && boolEnv('GROQ_FREE_ONLY',true)),
    githubModels: Boolean(env('GITHUB_MODELS_TOKEN') && boolEnv('GITHUB_MODELS_FREE_ONLY',true)),
    cloudflare: Boolean(env('CLOUDFLARE_ACCOUNT_ID') && env('CLOUDFLARE_API_TOKEN') && boolEnv('CLOUDFLARE_FREE_ONLY',true)),
  };
}

function shouldCoolWholeProvider(reason:string){return ['quota_or_rate_limit','invalid_credentials','free_quota_exhausted','provider_forbidden'].includes(reason);}

export async function runLanePlan(lanes: AILane[], start = 0): Promise<AIRouterResult | null> {
  if (!lanes.length) return null;
  const attempts: AIAttempt[] = [];
  const deadline=now()+Math.min(Math.max(5_000,Number(env('AI_ROUTER_TOTAL_BUDGET_MS'))||24_000),45_000);
  for (let n=0;n<lanes.length;n++) {
    if(now()>=deadline){attempts.push({provider:'router',model:'deadline',ok:false,reason:'router_deadline'});break;}
    const lane = lanes[(start+n)%lanes.length];
    if (cooled(lane.id,lane.provider)) { attempts.push({provider:lane.provider,model:lane.model,ok:false,reason:'cooldown'}); continue; }
    let result:{text:string;status?:number;retryAfterMs?:number;detail?:string};
    try{result=await lane.run();}catch(e){result={text:'',status:599,detail:e instanceof Error?e.message:'provider_exception'};}
    if (result.text) { attempts.push({provider:lane.provider,model:lane.model,ok:true,status:result.status}); return {text:result.text,provider:lane.provider,model:lane.model,attempts}; }
    const failure = classifyProviderFailure(result.status || 599, result.detail || '', result.retryAfterMs || 0);
    cool(lane.id, failure.cooldownMs);
    if(shouldCoolWholeProvider(failure.reason))coolProvider(lane.provider,failure.cooldownMs);
    attempts.push({provider:lane.provider,model:lane.model,ok:false,status:result.status,reason:failure.reason});
  }
  console.error('FREE_AI_ALL_LANES_FAILED', JSON.stringify(attempts));
  return null;
}

export async function runFreeAI(messages: AIMessage[]): Promise<AIRouterResult | null> {
  const lanes = [openRouterLane(messages), ...geminiLanes(messages), ...groqLanes(messages), ...githubLanes(messages), ...cloudflareLanes(messages)].filter(Boolean) as AILane[];
  if (!lanes.length) return null;
  const start = state.cursor++ % lanes.length;
  return runLanePlan(lanes,start);
}
