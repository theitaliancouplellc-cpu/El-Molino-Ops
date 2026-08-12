import { NextResponse } from 'next/server';

type K = { title?:string; content?:string; status?:string; category?:string|null };
type P = { title?:string; description?:string|null; status?:string };
type Citation = { title?:string; url?:string; source?:string };

const APP_KNOWLEDGE = `
El Molino Ops is a private operations app for the Johns Island location.

Primary navigation:
- Today: daily operational overview and actionable work.
- Work: tasks, procedures, checklists and operational execution.
- Team: employees and team-related information.
- Ask AI: assistant for app help, internal restaurant knowledge, and El Molino-only public research when needed.
- More: secondary tools and administrative areas.

Available app systems and features:
- Persistent Supabase authentication and remembered sessions.
- Account and security controls including password recovery and profile settings.
- Role-based access for admin, manager and employee users.
- Admin Center for roles, invitations, trash/restore, audit information and exports.
- Universal app search.
- Notification center and unread indicators.
- Activity and audit history.
- Knowledge Studio for restaurant knowledge records, approval and operational documentation.
- Structured menu catalog with categories, items, pricing snapshots and verification status.
- Procedures and operational documentation.
- Task Center with assignments, priority, due dates, status and recurring-work fields.
- Operational Calendar combining tasks and scheduled work.
- Team Discussions with internal rooms/channels.
- Capture Studio for photos, camera/video capture, voice recordings and document/file uploads.
- Private file storage.
- CSV/data-import staging so imported data can be reviewed before becoming authoritative.
- JSON/data export and backup tooling.
- PWA support, Add to Home Screen capability, offline/network-state handling and app shortcuts.
- Loading, empty, retry, error and branded not-found states.
- Usage telemetry, client error telemetry, GitHub CI and a production health endpoint.
- Ask AI conversation history and feedback infrastructure.

Current known limitations / unfinished production work:
- Full push-notification delivery is not complete.
- Full email notification/invitation delivery is not complete.
- Automatic transcription of captured audio is not complete.
- AI analysis of uploaded photos, video and documents is not complete.
- AI-proposed write actions with approval are not complete.
- Rich clickable AI citation cards are not complete.
- Some favorites/recent-view and custom dashboard experiences are incomplete.
- Full XLSX parsing beyond staged CSV import is incomplete.
- Full device/session management is incomplete.
- Automated backup/disaster-recovery orchestration is incomplete.

When asked where something is, explain the shortest navigation path. When asked whether the app can do something, distinguish what is live now from what is planned/incomplete. Never claim an unfinished feature is complete.
`.trim();

function capabilityAnswer(){
  return `I can help you use the app, find features, explain settings and permissions, answer questions from El Molino's internal information, look up current public El Molino information when needed, and help create procedures, checklists, training material, manager notes and operational plans. You can ask naturally — I decide what information or tools are needed behind the scenes.`;
}
function isCapability(q:string){const s=q.toLowerCase().trim().replace(/[?!.,]+$/g,'');return /^(what( all)? can you do|what can you help( me)? with|what do you do|help|how can you help( me)?|who are you|what are you capable of|what are your capabilities|what can i ask you|how do you work)$/.test(s)}
function isAppQuestion(q:string){return /(this app|the app|el molino ops|feature|functionality|screen|tab|button|setting|settings|notification|task center|calendar|capture studio|knowledge studio|admin center|tools|discussion|account|security|login|sign in|password|profile|permission|role|employee access|manager access|admin access|upload|file|camera|voice|recording|search|offline|pwa|home screen|import|export|backup|history|audit|where (do|can|is)|how do i|how can i|can the app|does the app|what does .* do)/i.test(q)}
function wantsWeb(q:string){return /(web|online|internet|public|current|latest|hours|address|website|review|instagram|facebook|menu price|toast|doordash|uber|owner|ownership|owns|opened|location|phone number)/i.test(q)}
function clearlyUnrelated(q:string){return /(weather|bitcoin|president|nba|nfl|movie|anime|stock market|celebrity|space|quantum|spaghetti|politics|election|crypto|football|basketball|baseball)/i.test(q)}
function looksRestaurantScoped(q:string){return /(el molino|taqueria|johns island|restaurant|our |we |us |menu|hours|owner|owns|address|phone|review|taco|birria|burrito|toast|doordash|uber|location|store|kitchen|employee|shift|opening|closing|procedure|recipe|product)/i.test(q)}
function clean(v:unknown,max:number){return String(v??'').replace(/\0/g,'').slice(0,max)}
function extractCitations(data:any):Citation[]{
  const out:Citation[]=[];const seen=new Set<string>();
  for(const block of data?.content||[]){
    for(const c of block?.citations||[]){const url=c?.url||c?.source?.url;const title=c?.title||c?.source?.title;if(url&&!seen.has(url)){seen.add(url);out.push({url,title,source:'web'});}}
    if(block?.type==='web_search_tool_result'){for(const item of block?.content||[]){const url=item?.url;const title=item?.title;if(url&&!seen.has(url)){seen.add(url);out.push({url,title,source:'web'});}}}
  }
  return out.slice(0,6);
}
function withReferences(text:string,citations:Citation[]){if(!citations.length)return text;const lines=citations.map((c,i)=>`${i+1}. ${clean(c.title||'Source',100)} — ${clean(c.url,500)}`);return `${text}\n\nSources\n${lines.join('\n')}`;}

export async function POST(req:Request){
  try{
    const length=Number(req.headers.get('content-length')||0);if(length>1_000_000)return NextResponse.json({answer:'That request is too large. Ask a shorter question or process files separately.',source:'Assistant',citations:[]},{status:413});
    const body=await req.json();
    const question=clean(body.question,4000).trim();
    const knowledge=(Array.isArray(body.knowledge)?body.knowledge.slice(0,200):[]) as K[];
    const procedures=(Array.isArray(body.procedures)?body.procedures.slice(0,100):[]) as P[];
    if(!question)return NextResponse.json({answer:'Ask me anything about El Molino or this app.',source:'Assistant',citations:[]});
    if(isCapability(question))return NextResponse.json({answer:capabilityAnswer(),source:'Assistant',citations:[]});

    const appQuestion=isAppQuestion(question);
    const internal=knowledge.filter(k=>!String(k.category||'').includes('research'));
    const publicResearch=knowledge.filter(k=>String(k.category||'').includes('research'));
    const useWeb=!appQuestion&&wantsWeb(question)&&looksRestaurantScoped(question)&&!clearlyUnrelated(question);
    const context=(useWeb?publicResearch:internal).slice(0,60).map(k=>`- ${clean(k.title,160)}: ${clean(k.content,2400)}`).join('\n');
    const proc=procedures.slice(0,40).map(p=>`- ${clean(p.title,160)}: ${clean(p.description,1800)} [${clean(p.status,40)}]`).join('\n');

    const token=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
    if(!token){
      if(appQuestion)return NextResponse.json({answer:`The app includes Today, Work, Team, Ask AI and More, plus Task Center, Calendar, Capture Studio, Discussions, Menu Catalog, Account & Security, Data Import and Admin Center. Ask me about any specific screen, feature, permission or workflow and I’ll explain it.`,source:'Assistant',citations:[]});
      const pool=useWeb?publicResearch:internal;const words=question.toLowerCase().split(/\W+/).filter(w=>w.length>3);
      const hay=pool.filter(k=>words.some(w=>`${k.title} ${k.content}`.toLowerCase().includes(w))).slice(0,5);
      if(hay.length)return NextResponse.json({answer:hay.map(k=>`${k.title}: ${k.content}`).join('\n\n'),source:'Assistant',citations:[]});
      return NextResponse.json({answer:'I don’t have enough reliable information to answer that yet. You can teach me more in Knowledge Studio, or ask me a current public question specifically about El Molino.',source:'Assistant',citations:[]});
    }

    const routingInstruction=useWeb
      ?`Use web search only for this El Molino-related public question. Prefer official El Molino pages, Toast, maps/listings and credible local reporting. Do not browse unrelated topics. Never present public research as an approved internal SOP.`
      :`Do not use web search. Answer from the app knowledge and internal restaurant context supplied below. If the restaurant context does not support a restaurant-specific answer, say what is missing rather than guessing.`;
    const payload:any={model:'anthropic/claude-sonnet-4-5',max_tokens:1200,system:`You are the private El Molino assistant for the Johns Island location and its operations app. ${routingInstruction} The user should experience one normal chatbot, so never expose internal routing categories or source-mode names. Be concise, practical and friendly. You can always explain your own capabilities and the app's functionality.`,messages:[{role:'user',content:`Question: ${question}\n\nApp Knowledge:\n${APP_KNOWLEDGE}\n\nRestaurant context records:\n${context||'(none)'}\n\nApproved/draft procedures:\n${proc||'(none)'}`}]} ;
    if(useWeb)payload.tools=[{type:'web_search_20250305',name:'web_search',max_uses:3}];
    const r=await fetch('https://ai-gateway.vercel.sh/v1/messages',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${token}`,'anthropic-version':'2023-06-01'},body:JSON.stringify(payload)});
    if(!r.ok){return NextResponse.json({answer:'The assistant service is temporarily unavailable. Please try again.',source:'Assistant',citations:[]},{status:200});}
    const data=await r.json();const text=(data.content||[]).filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('\n').trim();const citations=extractCitations(data);
    return NextResponse.json({answer:withReferences(text||'I could not produce an answer.',citations),source:'Assistant',citations});
  }catch{return NextResponse.json({answer:'The assistant hit an error. Please try again.',source:'Assistant',citations:[]},{status:200})}
}
