import { NextResponse } from 'next/server';

type Mode = 'auto'|'internal'|'web';
type K = { title?:string; content?:string; status?:string; category?:string|null };
type P = { title?:string; description?:string|null; status?:string };

function capabilityAnswer(){
  return `I can help you run and learn El Molino Johns Island. I can answer questions from internal knowledge and approved procedures, explain menu and public company/location information, help draft opening/mid-shift/closing duties, training material, checklists, SOPs and manager notes, and compare what the restaurant has taught me with public El Molino information.\n\nWhen I use internal data, I label it Internal El Molino. When I use public internet research, I label it El Molino Web. I do not use web search for unrelated topics.`;
}

function isCapability(q:string){const s=q.toLowerCase().trim();return /^(what can you do|what do you do|help|how can you help|who are you)\??$/.test(s)}
function wantsWeb(q:string){return /(web|online|internet|public|current|latest|hours|address|website|review|instagram|facebook|menu price|toast|doordash|uber)/i.test(q)}
function clearlyUnrelated(q:string){return /(weather|bitcoin|president|nba|nfl|movie|anime|stock market|celebrity|space|quantum|recipe for spaghetti)/i.test(q)}

export async function POST(req:Request){
  try{
    const body=await req.json();
    const question=String(body.question||'').trim();
    const mode=(body.mode||'auto') as Mode;
    const knowledge=(Array.isArray(body.knowledge)?body.knowledge:[]) as K[];
    const procedures=(Array.isArray(body.procedures)?body.procedures:[]) as P[];
    if(!question)return NextResponse.json({answer:'Ask me anything about El Molino Johns Island.',source:'Assistant'});
    if(isCapability(question))return NextResponse.json({answer:capabilityAnswer(),source:'Assistant capabilities'});
    if(mode==='web'&&clearlyUnrelated(question))return NextResponse.json({answer:'I only browse the web for El Molino-related questions. Ask me about El Molino, the Johns Island location, its public menu, hours, reviews, ownership, social pages or other restaurant-specific public information.',source:'Web scope blocked'});

    const internal=knowledge.filter(k=>!String(k.category||'').includes('research'));
    const publicResearch=knowledge.filter(k=>String(k.category||'').includes('research'));
    const effective:Mode=mode==='auto'?(wantsWeb(question)?'web':'internal'):mode;
    const context=(effective==='web'?publicResearch:internal).slice(0,40).map(k=>`- ${k.title}: ${k.content}`).join('\n');
    const proc=procedures.slice(0,30).map(p=>`- ${p.title}: ${p.description||''} [${p.status}]`).join('\n');

    const token=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
    if(!token){
      const hay=(effective==='web'?publicResearch:internal).filter(k=>`${k.title} ${k.content}`.toLowerCase().split(/\W+/).some(w=>w.length>3&&question.toLowerCase().includes(w))).slice(0,4);
      if(hay.length)return NextResponse.json({answer:hay.map(k=>`${k.title}: ${k.content}`).join('\n\n'),source:effective==='web'?'El Molino Web snapshot':'Internal El Molino'});
      return NextResponse.json({answer:'I do not have a strong answer from the restaurant knowledge yet. You can teach me in Admin & Knowledge, or switch to El Molino Web for public restaurant information.',source:'Internal El Molino'});
    }

    const webInstruction=effective==='web'?`You may use web search, but ONLY for El Molino / El Molino Taqueria / El Molino Supermarket / the Johns Island location or closely related official restaurant information. Never search unrelated topics. Prefer official El Molino, Toast, maps/listings and credible local reporting. Clearly distinguish public web information from internal restaurant facts.`:`Do not use web search. Answer only from the internal context supplied below. If the context does not support the answer, say what is missing rather than guessing.`;

    const payload:any={
      model:'anthropic/claude-sonnet-4-5',
      max_tokens:900,
      system:`You are El Molino AI, the private assistant for El Molino Taqueria Johns Island. ${webInstruction} Be concise and operational. Never present public research as an approved internal SOP.`,
      messages:[{role:'user',content:`Question: ${question}\n\nInternal/public snapshot context:\n${context||'(none)'}\n\nProcedures:\n${proc||'(none)'}`}]
    };
    if(effective==='web')payload.tools=[{type:'web_search_20250305',name:'web_search',max_uses:3}];

    const r=await fetch('https://ai-gateway.vercel.sh/v1/messages',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${token}`,'anthropic-version':'2023-06-01'},body:JSON.stringify(payload)});
    if(!r.ok){const t=await r.text();return NextResponse.json({answer:`The AI service is not ready yet. ${t.slice(0,180)}`,source:'Assistant setup'},{status:200});}
    const data=await r.json();
    const text=(data.content||[]).filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('\n').trim();
    return NextResponse.json({answer:text||'I could not produce an answer.',source:effective==='web'?'El Molino Web':'Internal El Molino'});
  }catch{return NextResponse.json({answer:'The assistant hit an error. Please try again.',source:'Assistant error'},{status:200})}
}
