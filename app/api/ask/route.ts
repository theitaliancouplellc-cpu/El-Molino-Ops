import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { configuredFreeProviders, runFreeAI, type AIMessage } from '../../../lib/free-ai-router';
import { basicConversationAnswer, clearlyUnrelated, contextualSearchQuestion, isCapability, isCapabilityFollowup, type ConversationHistoryMessage } from '../../../lib/ask-conversation';

type K = { title?:string; content?:string; status?:string; category?:string|null };
type P = { title?:string; description?:string|null; status?:string };
type HistoryMessage = ConversationHistoryMessage;
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
function rankKnowledge(items:K[],query:string,limit=12){const terms=termsFor(query);return items.map(k=>({k,s:relevance(`${k.title||''} ${k.content||''}`,terms)})).filter(x=>terms.length===0||x.s>0).sort((a,b)=>b.s-a.s).slice(0,limit).map(x=>x.k);}
function rankProcedures(items:P[],query:string,limit=8){const terms=termsFor(query);return items.map(p=>({p,s:relevance(`${p.title||''} ${p.description||''}`,terms)})).filter(x=>terms.length===0||x.s>0).sort((a,b)=>b.s-a.s).slice(0,limit).map(x=>x.p);}

async function readJsonBody(req:Request,maxBytes=1_000_000):Promise<{body?:any;tooLarge?:boolean;invalid?:boolean}>{
  if(!req.body)return {body:{}};const reader=req.body.getReader();const decoder=new TextDecoder();let total=0,text='';
  try{for(;;){const {done,value}=await reader.read();if(done)break;if(value){total+=value.byteLength;if(total>maxBytes){await reader.cancel();return {tooLarge:true};}text+=decoder.decode(value,{stream:true});}}text+=decoder.decode();return {body:text?JSON.parse(text):{}};}catch{return {invalid:true};}
}

async function authenticatedUser(req:Request){
  const auth=req.headers.get('authorization')||'';const accessToken=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';if(!accessToken)return null;
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL||'https://asuvgjxdmxizbnjrccsz.supabase.co';
  const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'sb_publishable_gtR8VfsQ5n-FPPbypnYKTw_f2k3Xyrk';
  const client=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${accessToken}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(accessToken);return error?null:data.user;
}

function capabilityAnswer(){return `I can answer questions about this app and El Molino, carry conversations across follow-ups, use approved restaurant knowledge and procedures, help with operational planning, and prepare tasks, procedures/checklists and knowledge records for review. Behind the scenes I can rotate among configured free AI providers when one hits a limit or goes down.`;}
function capabilityDetails(){return `In practical terms, I can help with app navigation and features, approved restaurant knowledge, procedures and training, opening/mid-shift/closing work, manager planning, task and checklist drafts, and knowledge capture. You can keep a normal conversation going with follow-ups like “go deeper,” “what about managers?” or “turn that into a checklist.” If every external free model is unavailable, I keep basic conversation, app help, approved knowledge retrieval and safe action drafts working locally.`}
function isAppQuestion(q:string){return /(this app|the app|el molino ops|feature|functionality|screen|tab|button|setting|notification|task center|calendar|capture studio|knowledge studio|admin center|discussion|account|security|login|password|profile|permission|role|upload|file|camera|voice|search|offline|pwa|home screen|import|export|backup|history|audit|where (do|can|is)|how do i|how can i|can the app|does the app|what does .* do)/i.test(q)}
function detectAction(q:string):ActionProposal['type']|null{const s=q.toLowerCase();if(/\b(create|make|add|set up|draft)\b.*\b(task|to-do|todo)\b|\bremind (me|us) to\b/.test(s))return 'task';if(/\b(create|make|draft|write|build|turn .* into)\b.*\b(procedure|sop|checklist|opening checklist|closing checklist|side work)\b/.test(s))return 'procedure';if(/\b(save|add|remember|record|store)\b.*\b(knowledge|knowledge base|as knowledge|restaurant knowledge|note)\b/.test(s))return 'knowledge';return null;}
function actionTitleFromQuestion(question:string,type:ActionProposal['type']){let s=question.replace(/[?!]+$/,'').trim();if(type==='task')s=s.replace(/^.*?\b(?:task|to-do|todo)\b\s*(?:to|for|about)?\s*/i,'');if(type==='procedure')s=s.replace(/^.*?\b(?:procedure|sop|checklist)\b\s*(?:for|about|to)?\s*/i,'');if(type==='knowledge')s=s.replace(/^.*?\b(?:knowledge|knowledge base|note)\b\s*(?:that|about|as|:)?\s*/i,'');return cleanTitle(s||`${type} draft`,160);}
function localActionProposal(question:string,type:ActionProposal['type']):ActionProposal{const title=actionTitleFromQuestion(question,type);if(type==='knowledge')return {type,title,content:clean(question,4000),priority:'normal'};return {type,title,description:`Draft requested in Ask El Molino: ${clean(question,4000)}`,priority:'normal'};}
function parseActionText(text:string,type:ActionProposal['type']){try{const first=text.indexOf('{'),last=text.lastIndexOf('}');if(first<0||last<=first)return {answer:text,action:null};const parsed=JSON.parse(text.slice(first,last+1));const a=parsed?.action;const title=cleanTitle(a?.title,200);if(!title)return {answer:String(parsed?.answer||text),action:null};return {answer:String(parsed.answer||`I drafted that ${type}. Review it before creating it.`),action:{type,title,description:clean(a.description,8000).trim()||undefined,content:clean(a.content,12000).trim()||undefined,priority:['low','normal','high','urgent'].includes(a.priority)?a.priority:'normal'} as ActionProposal};}catch{return {answer:text,action:null};}}

function localFallback(question:string,history:HistoryMessage[],knowledge:K[],procedures:P[]){
  const basic=basicConversationAnswer(question,history);if(basic)return basic;if(isCapability(question)||isCapabilityFollowup(question,history))return capabilityDetails();
  const contextual=contextualSearchQuestion(question,history);const q=contextual.toLowerCase();
  if(isAppQuestion(`${history.slice(-2).map(m=>m.content).join(' ')} ${contextual}`)){
    if(/task center|task|assigned|work/.test(q))return `Task Center is where operational work is created, assigned, prioritized, tracked and completed. Today surfaces current work; Work is the deeper operational view.`;
    if(/knowledge studio|knowledge/.test(q))return `Knowledge Studio is the restaurant's internal source of truth. Approved records can answer restaurant questions; drafts stay out of verified answers until a manager approves them.`;
    if(/team|employee|training/.test(q))return `Team is for people and training: employee records, roles, onboarding/training information and permissions that determine what each person can see or manage.`;
    if(/calendar/.test(q))return `Calendar organizes dated operational items such as tasks and scheduled work so managers can see what is coming up beyond today's list.`;
    if(/capture|camera|photo|voice/.test(q))return `Capture Studio is the intake point for teaching the system from real restaurant material such as photos, files and voice capture. Some advanced AI analysis and transcription pieces are still being built.`;
    return `El Molino Ops is organized around Today, Work, Team, Ask AI and More. Deeper systems include Task Center, Calendar, Knowledge Studio, Menu Catalog, Discussions, Capture Studio, files, search, notifications, account/security and Admin Center.`;
  }
  const kh=rankKnowledge(knowledge,contextual,4);if(kh.length)return `From approved internal El Molino knowledge I found:\n\n${kh.map(k=>`• ${k.title||'Record'}: ${clean(k.content,700)}`).join('\n\n')}`;
  const ph=rankProcedures(procedures,contextual,4);if(ph.length)return `I found these approved related procedures:\n\n${ph.map(p=>`• ${p.title||'Procedure'}: ${clean(p.description,700)}`).join('\n\n')}`;
  return `I don't have enough verified El Molino information to answer that yet. I can still help with the app and anything already approved in its knowledge base.`;
}

export async function GET(){return NextResponse.json({ok:true,mode:'free-only-rotation',providers:configuredFreeProviders()});}

export async function POST(req:Request){
  try{
    const user=await authenticatedUser(req);if(!user)return NextResponse.json({answer:'Your session needs to be refreshed. Please try again.',citations:[]},{status:401});
    if(!allowed(user.id))return NextResponse.json({answer:'You’re sending messages very quickly. Wait a moment and try again.',citations:[]},{status:429});
    const declared=Number(req.headers.get('content-length')||0);if(Number.isFinite(declared)&&declared>1_000_000)return NextResponse.json({answer:'That request is too large. Ask a shorter question or process files separately.',citations:[]},{status:413});
    const parsedBody=await readJsonBody(req);if(parsedBody.tooLarge)return NextResponse.json({answer:'That request is too large. Ask a shorter question or process files separately.',citations:[]},{status:413});if(parsedBody.invalid)return NextResponse.json({answer:'I could not read that request. Please send the message again.',citations:[],degraded:true},{status:200});const body=parsedBody.body||{};
    const question=clean(body.question,4000).trim();
    const suppliedKnowledge=(Array.isArray(body.knowledge)?body.knowledge.slice(0,200):[]) as K[];const knowledge=suppliedKnowledge.filter(k=>verifiedStatus(k.status));
    const suppliedProcedures=(Array.isArray(body.procedures)?body.procedures.slice(0,100):[]) as P[];const procedures=suppliedProcedures.filter(p=>verifiedStatus(p.status));
    const history=(Array.isArray(body.history)?body.history:[]).filter((m:any)=>m&&(m.role==='user'||m.role==='assistant')&&typeof m.content==='string').slice(-20).map((m:any)=>({role:m.role,content:clean(m.content,3500)})) as HistoryMessage[];
    if(!question)return NextResponse.json({answer:'Ask me anything about El Molino or this app.',citations:[]});
    const basic=basicConversationAnswer(question,history);if(basic)return NextResponse.json({answer:basic,citations:[],local:true});
    if(isCapability(question)&&history.length===0)return NextResponse.json({answer:capabilityAnswer(),citations:[]});if(isCapabilityFollowup(question,history))return NextResponse.json({answer:capabilityDetails(),citations:[]});
    const actionType=detectAction(question);
    if(clearlyUnrelated(question)&&!actionType)return NextResponse.json({answer:'I’m focused on El Molino and this operations app. Ask me anything related to the restaurant, its operations, people, procedures, menu, data or the app itself.',citations:[]});

    const contextual=contextualSearchQuestion(question,history);const approvedResearch=knowledge.filter(k=>String(k.category||'').includes('research'));const approvedInternal=knowledge.filter(k=>!String(k.category||'').includes('research'));
    const selected=[...rankKnowledge(approvedInternal,contextual,10),...rankKnowledge(approvedResearch,contextual,4)].slice(0,12);
    const selectedProcedures=rankProcedures(procedures,contextual,8);
    const context=selected.map(k=>`- ${clean(k.title,160)}: ${clean(k.content,1400)}`).join('\n');const proc=selectedProcedures.map(p=>`- ${clean(p.title,160)}: ${clean(p.description,1100)} [${clean(p.status,40)}]`).join('\n');
    const actionInstruction=actionType?`The user is asking you to prepare a ${actionType}. Do not claim it is already created. Return ONLY JSON: {"answer":"short natural sentence","action":{"title":"clear title","description":"useful detail","content":"knowledge content if applicable","priority":"normal"}}. For a checklist/procedure, put complete steps in description.`:'';
    const system=`You are Ask El Molino, the private assistant for El Molino Taqueria's Johns Island operations app. Be conversational and natural. Always handle greetings, acknowledgments, thanks, casual follow-ups and normal conversational transitions like a regular assistant. Keep the broader conversation centered on El Molino, its app, operations, employees, procedures, menu, training, vendors, maintenance and restaurant-related work, but do not treat ordinary small talk as a request for restaurant facts. Treat the conversation as continuous and resolve references like that, it, those, the other one, why, more and go deeper from history. Only treat supplied approved knowledge/procedures as verified restaurant facts. Never invent a restaurant fact or completed action. ${actionInstruction}`;
    const messages:AIMessage[]=[{role:'system',content:system},...history,{role:'user',content:`${question}\n\nAPP REFERENCE:\n${APP_KNOWLEDGE}\n\nRELEVANT APPROVED EL MOLINO KNOWLEDGE:\n${context||'(none found)'}\n\nRELEVANT APPROVED PROCEDURES:\n${proc||'(none found)'}`}];
    const result=await runFreeAI(messages);
    if(!result){if(actionType){const action=localActionProposal(question,actionType);return NextResponse.json({answer:`I drafted that ${actionType} locally for you to review before anything is created.`,action,citations:[],degraded:true,local:true});}return NextResponse.json({answer:localFallback(question,history,knowledge,procedures),citations:[],degraded:true});}
    if(actionType){const resultAction=parseActionText(result.text,actionType);if(!resultAction.action){const action=localActionProposal(question,actionType);return NextResponse.json({answer:`I prepared a safe local ${actionType} draft because the model response could not be used as an action.`,action,citations:[],degraded:true});}return NextResponse.json({answer:resultAction.answer,action:resultAction.action,citations:[],ai:{provider:result.provider,model:result.model}});}
    return NextResponse.json({answer:result.text,citations:[],ai:{provider:result.provider,model:result.model}});
  }catch(err){console.error('ASK_API_ERROR',err);return NextResponse.json({answer:'I hit an internal error, so I switched to safe mode. Please try that question once more.',citations:[],degraded:true},{status:200});}
}
