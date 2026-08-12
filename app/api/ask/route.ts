import { NextResponse } from 'next/server';

type Mode = 'auto'|'internal'|'web';
type K = { title?:string; content?:string; status?:string; category?:string|null };
type P = { title?:string; description?:string|null; status?:string };
type Citation = { title?:string; url?:string; source?:string };

function capabilityAnswer(){
  return `I can work as the El Molino Johns Island assistant, not just a database search box. I can explain what I can do, answer from internal restaurant knowledge, search the public web only for El Molino-related information, distinguish internal facts from public research, help draft opening/mid-shift/closing duties, training material, checklists, SOPs and manager notes, and help turn captured restaurant knowledge into structured work.\n\nInternal answers are labeled Internal El Molino. Public research is labeled El Molino Web. If I do not know an internal procedure, I should say that instead of inventing one.`;
}
function isCapability(q:string){
  const s=q.toLowerCase().trim().replace(/[?!.,]+$/g,'');
  return /^(what( all)? can you do|what can you help( me)? with|what do you do|how can you help( me)?|how can you help|what are your capabilities|what are you capable of|tell me what you can do|show me what you can do|help me understand what you can do|who are you|help)$/.test(s)
    || (/\bwhat\b/.test(s) && /\b(can|could)\b/.test(s) && /\byou\b/.test(s) && /\b(do|help)\b/.test(s) && s.length < 90)
    || (/\b(capabilities|features|abilities)\b/.test(s) && /\b(your|you)\b/.test(s) && s.length < 90);
}
function wantsWeb(q:string){return /(web|online|internet|public|current|latest|hours|address|website|review|instagram|facebook|menu price|toast|doordash|uber|owner|ownership|owns|opened|location|phone number)/i.test(q)}
function clearlyUnrelated(q:string){return /(weather|bitcoin|president|nba|nfl|movie|anime|stock market|celebrity|space|quantum|spaghetti|politics|election|crypto|football|basketball|baseball)/i.test(q)}
function looksRestaurantScoped(q:string){return /(el molino|taqueria|johns island|restaurant|our |we |us |menu|hours|owner|owns|address|phone|review|taco|birria|burrito|toast|doordash|uber|location|store|kitchen|employee|shift|opening|closing|procedure|recipe|product)/i.test(q)}
function clean(v:unknown,max:number){return String(v??'').replace(/\0/g,'').slice(0,max)}
function extractCitations(data:any):Citation[]{
  const out:Citation[]=[];const seen=new Set<string>();
  for(const block of data?.content||[]){
    for(const c of block?.citations||[]){const url=c?.url||c?.source?.url;const title=c?.title||c?.source?.title;if(url&&!seen.has(url)){seen.add(url);out.push({url,title,source:'El Molino Web'});}}
    if(block?.type==='web_search_tool_result'){for(const item of block?.content||[]){const url=item?.url;const title=item?.title;if(url&&!seen.has(url)){seen.add(url);out.push({url,title,source:'El Molino Web'});}}}
  }
  return out.slice(0,6);
}
function withReferences(text:string,citations:Citation[]){if(!citations.length)return text;const lines=citations.map((c,i)=>`${i+1}. ${clean(c.title||'Source',100)} — ${clean(c.url,500)}`);return `${text}\n\nSources\n${lines.join('\n')}`;}

export async function POST(req:Request){
  try{
    const length=Number(req.headers.get('content-length')||0);if(length>1_000_000)return NextResponse.json({answer:'That request is too large. Ask a shorter question or process files separately.',source:'Input limit',citations:[]},{status:413});
    const body=await req.json();
    const question=clean(body.question,4000).trim();
    const requested=String(body.mode||'auto');const mode:(Mode)=requested==='internal'||requested==='web'?requested:'auto';
    const knowledge=(Array.isArray(body.knowledge)?body.knowledge.slice(0,200):[]) as K[];
    const procedures=(Array.isArray(body.procedures)?body.procedures.slice(0,100):[]) as P[];
    if(!question)return NextResponse.json({answer:'Ask me anything about El Molino Johns Island or what I can help you do.',source:'Assistant',citations:[]});
    if(isCapability(question))return NextResponse.json({answer:capabilityAnswer(),source:'Assistant capabilities',citations:[]});
    if(mode==='web'&&(clearlyUnrelated(question)||!looksRestaurantScoped(question)))return NextResponse.json({answer:'I only browse the public web for El Molino-related questions. I can still help with general app actions without browsing, but I will not use web search for unrelated topics.',source:'Web scope blocked',citations:[]});

    const internal=knowledge.filter(k=>!String(k.category||'').includes('research'));
    const publicResearch=knowledge.filter(k=>String(k.category||'').includes('research'));
    let effective:Mode=mode==='auto'?(wantsWeb(question)?'web':'internal'):mode;
    if(effective==='web'&&clearlyUnrelated(question))effective='internal';
    const context=(effective==='web'?publicResearch:internal).slice(0,60).map(k=>`- ${clean(k.title,160)}: ${clean(k.content,2400)}`).join('\n');
    const proc=procedures.slice(0,40).map(p=>`- ${clean(p.title,160)}: ${clean(p.description,1800)} [${clean(p.status,40)}]`).join('\n');

    const token=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
    if(!token){
      const pool=effective==='web'?publicResearch:internal;const words=question.toLowerCase().split(/\W+/).filter(w=>w.length>3);
      const hay=pool.filter(k=>words.some(w=>`${k.title} ${k.content}`.toLowerCase().includes(w))).slice(0,5);
      if(hay.length)return NextResponse.json({answer:hay.map(k=>`${k.title}: ${k.content}`).join('\n\n'),source:effective==='web'?'El Molino Web snapshot':'Internal El Molino',citations:[]});
      return NextResponse.json({answer:'I do not have a strong internal answer yet. You can teach me in Knowledge Studio, or use El Molino Web when the question is about public restaurant information.',source:'Internal El Molino',citations:[]});
    }

    const webInstruction=effective==='web'
      ?`You may use web search, but ONLY for El Molino / El Molino Taqueria / El Molino Supermarket / the Johns Island location or closely related official restaurant information. Never search unrelated topics. Prefer official El Molino pages, Toast, maps/listings and credible local reporting. Clearly distinguish public web information from internal restaurant facts.`
      :`Do not use web search. Answer only from the internal context supplied below. If the context does not support the answer, clearly say what is missing rather than guessing.`;
    const payload:any={model:'anthropic/claude-sonnet-4-5',max_tokens:1000,system:`You are El Molino AI, the private assistant for El Molino Taqueria Johns Island. ${webInstruction} Be concise, practical and operational. Never present public research as an approved internal SOP. You can always explain your own capabilities without restaurant context.`,messages:[{role:'user',content:`Question: ${question}\n\nContext records:\n${context||'(none)'}\n\nApproved/draft procedures:\n${proc||'(none)'}`}]};
    if(effective==='web')payload.tools=[{type:'web_search_20250305',name:'web_search',max_uses:3}];
    const r=await fetch('https://ai-gateway.vercel.sh/v1/messages',{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${token}`,'anthropic-version':'2023-06-01'},body:JSON.stringify(payload)});
    if(!r.ok){const t=await r.text();return NextResponse.json({answer:`The AI service is not ready yet. ${clean(t,180)}`,source:'Assistant setup',citations:[]},{status:200});}
    const data=await r.json();const text=(data.content||[]).filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('\n').trim();const citations=extractCitations(data);
    return NextResponse.json({answer:withReferences(text||'I could not produce an answer.',citations),source:effective==='web'?'El Molino Web':'Internal El Molino',citations});
  }catch{return NextResponse.json({answer:'The assistant hit an error. Please try again.',source:'Assistant error',citations:[]},{status:200})}
}
