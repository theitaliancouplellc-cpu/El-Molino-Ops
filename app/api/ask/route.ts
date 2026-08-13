import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { configuredFreeProviders, runFreeAI, type AIMessage } from '../../../lib/free-ai-router';

type K = { title?:string; content?:string; status?:string; category?:string|null };
type P = { title?:string; description?:string|null; status?:string };
type HistoryMessage = { role:'user'|'assistant'; content:string };
type ActionProposal = { type:'task'|'procedure'|'knowledge'; title:string; description?:string; content?:string; priority?:'low'|'normal'|'high'|'urgent' };

const APP_KNOWLEDGE = `El Molino Ops is a private operations app for the Johns Island location.
Primary navigation: Today, Work, Team, Ask AI, More.
Key systems: remembered login, accounts/security, roles and permissions, Admin Center, universal search, notifications, audit history, Knowledge Studio, Menu Catalog, procedures, Task Center, Calendar, Discussions, Capture Studio, private files, staged imports, exports/backups, PWA/offline support, telemetry and health checks.
Current limitations: push/email delivery, transcription, advanced AI file/photo/video analysis, rich citation cards, full XLSX parsing, full device/session management and automated disaster recovery are still incomplete.
When asked where something is, give the shortest navigation path. Never claim an unfinished feature is complete.`;

const g = globalThis as typeof globalThis & { __elMolinoAskRate?: Map<string,{count:number;reset:number}> };
const rate = g.__elMolinoAskRate || (g.__elMolinoAskRate = new Map());
const STOP=new Set('about after again also and are been being but can could did does doing for from had has have here how into its just more most not now of off on once only or our out over same should so some such than that the their them then there these they this those through too under very was were what when where which while who why will with would you your'.split(' '));

function clean(v:unknown,max:number){return String(v??'').replace(/\0/g,'').slice(0,max)}
function cleanTitle(v:unknown,max=200){return clean(v,max).replace(/\s+/g,' ').trim()}
function allowed(userId:string){const now=Date.now();if(rate.size>500){for(const [id,b] of rate)if(b.reset<now)rate.delete(id);}const bucket=rate.get(userId);if(!bucket||bucket.reset<now){rate.set(userId,{count:1,reset:now+60_000});return true;}if(bucket.count>=30)return false;bucket.count+=1;return true;}
function verifiedStatus(v:unknown){return ['approved','published','active'].includes(String(v||'').toLowerCase());}
function termsFor(text:string){return [...new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>2&&!STOP.has(x)))].slice(0,30);}
function relevance(text:string,terms:string[]){const low=text.toLowerCase();return terms.reduce((n,t)=>n+(low.includes(t)?(low.startsWith(t)||low.includes(` ${t}`)?2:1):0),0);}
function rankKnowledge(items:K[],query:string,limit=14){const terms=termsFor(query);return items.map(k=>({k,s:relevance(`${k.title||''} ${k.content||''}`,terms)})).filter(x=>terms.length===0||x.s>0).sort((a,b)=>b.s-a.s).slice(0,limit).map(x=>x.k);}
function rankProcedures(items:P[],query:string,limit=8){const terms=termsFor(query);return items.map(p=>({p,s:relevance(`${p.title||''} ${p.description||''}`,terms)})).filter(x=>terms.length===0||x.s>0).sort((a,b)=>b.s-a.s).slice(0,limit).map(x=>x.p);}

async function readJsonBody(req:Request,maxBytes=1_000_000):Promise<{body?:any;tooLarge?:boolean;invalid?:boolean}>{
  if(!req.body)return {body:{}};const reader=req.body.getReader();const decoder=new TextDecoder();let total=0,text='';
  try{for(;;){const {done,value}=await reader.read();if(done)break;if(value){total+=value.byteLength;if(total>maxBytes){await reader.cancel();return {tooLarge:true};}text+=decoder.decode(value,{stream:true});}}text+=decoder.decode();return {body:text?JSON.parse(text):{}};}catch{return {invalid:true};}
}

async function authenticatedUser(req:Request){
  const auth=req.headers.get('authorization')||'';const accessToken=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';if(!accessToken)return null;
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!anon)return null;
  const client=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${accessToken}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(accessToken);return error?null:data.user;
}

function detectAction(q:string):ActionProposal['type']|null{const s=q.toLowerCase();if(/\b(create|make|add|set up|draft)\b.*\b(task|to-do|todo)\b|\bremind (me|us) to\b/.test(s))return 'task';if(/\b(create|make|draft|write|build|turn .* into)\b.*\b(procedure|sop|checklist|opening checklist|closing checklist|side work)\b/.test(s))return 'procedure';if(/\b(save|add|remember|record|store)\b.*\b(knowledge|knowledge base|as knowledge|restaurant knowledge|note)\b/.test(s))return 'knowledge';return null;}
function actionTitleFromQuestion(question:string,type:ActionProposal['type']){let s=question.replace(/[?!]+$/,'').trim();if(type==='task')s=s.replace(/^.*?\b(?:task|to-do|todo)\b\s*(?:to|for|about)?\s*/i,'');if(type==='procedure')s=s.replace(/^.*?\b(?:procedure|sop|checklist)\b\s*(?:for|about|to)?\s*/i,'');if(type==='knowledge')s=s.replace(/^.*?\b(?:knowledge|knowledge base|note)\b\s*(?:that|about|as|:)?\s*/i,'');return cleanTitle(s||`${type} draft`,160);}
function localActionProposal(question:string,type:ActionProposal['type']):ActionProposal{const title=actionTitleFromQuestion(question,type);if(type==='knowledge')return {type,title,content:clean(question,4000),priority:'normal'};return {type,title,description:`Draft requested in Ask El Molino: ${clean(question,4000)}`,priority:'normal'};}
function parseActionText(text:string,type:ActionProposal['type']){try{const first=text.indexOf('{'),last=text.lastIndexOf('}');if(first<0||last<=first)return {answer:text,action:null};const parsed=JSON.parse(text.slice(first,last+1));const a=parsed?.action;const title=cleanTitle(a?.title,200);if(!title)return {answer:String(parsed?.answer||text),action:null};return {answer:String(parsed.answer||`I drafted that ${type}. Review it before creating it.`),action:{type,title,description:clean(a.description,8000).trim()||undefined,content:clean(a.content,12000).trim()||undefined,priority:['low','normal','high','urgent'].includes(a.priority)?a.priority:'normal'} as ActionProposal};}catch{return {answer:text,action:null};}}

export async function GET(){return NextResponse.json({ok:true,mode:'model-first-free-ai',providers:configuredFreeProviders()});}

export async function POST(req:Request){
  try{
    const user=await authenticatedUser(req);if(!user)return NextResponse.json({answer:'Your session needs to be refreshed. Please try again.',citations:[]},{status:401});
    if(!allowed(user.id))return NextResponse.json({answer:'You’re sending messages very quickly. Wait a moment and try again.',citations:[]},{status:429});
    const declared=Number(req.headers.get('content-length')||0);if(Number.isFinite(declared)&&declared>1_000_000)return NextResponse.json({answer:'That request is too large. Ask a shorter question or process files separately.',citations:[]},{status:413});
    const parsedBody=await readJsonBody(req);if(parsedBody.tooLarge)return NextResponse.json({answer:'That request is too large. Ask a shorter question or process files separately.',citations:[]},{status:413});if(parsedBody.invalid)return NextResponse.json({answer:'I could not read that request. Please send the message again.',citations:[],degraded:true},{status:200});const body=parsedBody.body||{};
    const question=clean(body.question,4000).trim();
    const suppliedKnowledge=(Array.isArray(body.knowledge)?body.knowledge.slice(0,250):[]) as K[];const knowledge=suppliedKnowledge.filter(k=>verifiedStatus(k.status));
    const suppliedProcedures=(Array.isArray(body.procedures)?body.procedures.slice(0,120):[]) as P[];const procedures=suppliedProcedures.filter(p=>verifiedStatus(p.status));
    const history=(Array.isArray(body.history)?body.history:[]).filter((m:any)=>m&&(m.role==='user'||m.role==='assistant')&&typeof m.content==='string').slice(-30).map((m:any)=>({role:m.role,content:clean(m.content,5000)})) as HistoryMessage[];
    if(!question)return NextResponse.json({answer:'What would you like to talk about?',citations:[]});

    const actionType=detectAction(question);
    const retrievalQuery=[...history.slice(-8).filter(m=>m.role==='user').map(m=>m.content),question].join(' ');
    const approvedResearch=knowledge.filter(k=>String(k.category||'').includes('research'));const approvedInternal=knowledge.filter(k=>!String(k.category||'').includes('research'));
    const selected=[...rankKnowledge(approvedInternal,retrievalQuery,12),...rankKnowledge(approvedResearch,retrievalQuery,4)].slice(0,14);
    const selectedProcedures=rankProcedures(procedures,retrievalQuery,8);
    const context=selected.map(k=>`- ${clean(k.title,160)}: ${clean(k.content,1600)}`).join('\n');
    const proc=selectedProcedures.map(p=>`- ${clean(p.title,160)}: ${clean(p.description,1300)} [${clean(p.status,40)}]`).join('\n');
    const actionInstruction=actionType?`The user appears to be asking for a ${actionType}. Continue speaking naturally, but return ONLY JSON in this shape so the app can safely stage the action for review: {"answer":"natural conversational reply","action":{"title":"clear title","description":"useful detail","content":"knowledge content if applicable","priority":"normal"}}. Never say the action is already completed.`:'';
    const system=`You are Ask El Molino, a full conversational AI assistant inside El Molino Ops. Respond like a capable general-purpose assistant, not a search engine, form, scripted bot, or database browser. Every user message is part of one continuous conversation. Understand greetings, slang, incomplete thoughts, pronouns, follow-ups, corrections, topic changes, jokes, planning questions, explanations, brainstorming, and ordinary conversation from meaning and history rather than phrase matching. You may answer general knowledge and everyday questions conversationally. When the user asks about El Molino, the restaurant, its people, policies, procedures, menu, records, or this app, use the supplied app reference and approved internal context as your authoritative private context. Do not expose raw retrieval blocks or say 'from approved knowledge I found' unless the user explicitly asks for sources. Synthesize relevant internal information naturally into the answer. If internal context does not establish a restaurant-specific fact, say you do not have that verified detail rather than inventing it. Never invent completed app actions. ${actionInstruction}`;
    const messages:AIMessage[]=[{role:'system',content:system},...history,{role:'user',content:`${question}\n\nPRIVATE APP REFERENCE (use only when relevant):\n${APP_KNOWLEDGE}\n\nPRIVATE RELEVANT APPROVED EL MOLINO KNOWLEDGE (use naturally; do not dump verbatim):\n${context||'(none)'}\n\nPRIVATE RELEVANT APPROVED PROCEDURES (use naturally; do not dump verbatim):\n${proc||'(none)'}`}];
    const result=await runFreeAI(messages);
    if(!result){if(actionType){const action=localActionProposal(question,actionType);return NextResponse.json({answer:'The AI model is temporarily unavailable, but I saved a local draft for you to review instead of pretending the action was completed.',action,citations:[],degraded:true,local:true});}return NextResponse.json({answer:'The AI model is temporarily unavailable right now. Try again in a moment.',citations:[],degraded:true},{status:200});}
    if(actionType){const resultAction=parseActionText(result.text,actionType);if(!resultAction.action){const action=localActionProposal(question,actionType);return NextResponse.json({answer:'I understood the request, but the model response could not be converted into a safe action. I prepared a local draft for review instead.',action,citations:[],degraded:true});}return NextResponse.json({answer:resultAction.answer,action:resultAction.action,citations:[],ai:{provider:result.provider,model:result.model}});}
    return NextResponse.json({answer:result.text,citations:[],ai:{provider:result.provider,model:result.model}});
  }catch(err){console.error('ASK_API_ERROR',err);return NextResponse.json({answer:'I hit an internal error. Please try that again.',citations:[],degraded:true},{status:200});}
}