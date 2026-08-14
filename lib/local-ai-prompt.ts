export type LocalAIMessage={role:'system'|'user'|'assistant';content:string};
export type LocalHistoryMessage={role:'user'|'assistant';content:string};
export type LocalKnowledge={title?:string;content?:string;status?:string;category?:string|null};
export type LocalProcedure={title?:string;description?:string|null;status?:string};

const APP_REFERENCE=`El Molino Ops is the private operations workspace for the Johns Island El Molino location. Primary navigation is Today, Work, Team, Ask AI and More. It contains tasks, procedures, approved knowledge, team/location context, menu/catalog data, files, notifications, search, history and administration. Never claim an app action happened unless the app confirms it.`;
const STOP=new Set('about after again also and are been being but can could did does doing for from had has have here how into its just more most not now of off on once only or our out over same should so some such than that the their them then there these they this those through too under very was were what when where which while who why will with would you your'.split(' '));

function clean(v:unknown,max:number){return String(v??'').replace(/\0/g,'').replace(/\s+/g,' ').trim().slice(0,max)}
function approved(v:unknown){return ['approved','published','active'].includes(String(v||'').toLowerCase())}
function terms(text:string){return [...new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>2&&!STOP.has(x)))].slice(0,24)}
function score(text:string,queryTerms:string[]){const low=text.toLowerCase();return queryTerms.reduce((n,t)=>n+(low.includes(t)?1:0),0)}
function rankKnowledge(items:LocalKnowledge[],query:string,limit:number){const q=terms(query);return items.filter(x=>approved(x.status)).map(x=>({x,s:score(`${x.title||''} ${x.content||''}`,q)})).filter(r=>q.length===0||r.s>0).sort((a,b)=>b.s-a.s).slice(0,limit).map(r=>r.x)}
function rankProcedures(items:LocalProcedure[],query:string,limit:number){const q=terms(query);return items.filter(x=>approved(x.status)).map(x=>({x,s:score(`${x.title||''} ${x.description||''}`,q)})).filter(r=>q.length===0||r.s>0).sort((a,b)=>b.s-a.s).slice(0,limit).map(r=>r.x)}

export function buildLocalAIMessages(input:{question:string;history?:LocalHistoryMessage[];knowledge?:LocalKnowledge[];procedures?:LocalProcedure[]}):LocalAIMessage[]{
  const question=clean(input.question,4000);
  const history=(input.history||[]).filter(m=>m&&(m.role==='user'||m.role==='assistant')&&clean(m.content,1)).slice(-14).map(m=>({role:m.role,content:clean(m.content,1800)} as LocalHistoryMessage));
  const retrievalQuery=[...history.filter(m=>m.role==='user').slice(-5).map(m=>m.content),question].join(' ');
  const knowledge=rankKnowledge(input.knowledge||[],retrievalQuery,8).map(k=>`- ${clean(k.title,120)}: ${clean(k.content,900)}`).join('\n');
  const procedures=rankProcedures(input.procedures||[],retrievalQuery,4).map(p=>`- ${clean(p.title,120)}: ${clean(p.description,700)}`).join('\n');
  const system=`You are Ask El Molino, a fully conversational AI assistant. Talk naturally and directly like a capable general-purpose assistant. Understand the conversation from meaning and history, including greetings, slang, pronouns, follow-ups, corrections, topic changes, planning and ordinary questions. Do not use canned greeting or capability scripts. You may discuss general knowledge. For El Molino-specific facts, treat the private context below as authoritative and do not invent missing restaurant facts. Never dump raw context or announce that you searched a database. Synthesize it naturally. Keep answers concise unless the user asks for depth. ${APP_REFERENCE}`;
  const context=`${question}\n\nPRIVATE EL MOLINO CONTEXT — use only when relevant:\nKnowledge:\n${knowledge||'(no verified matching knowledge)'}\nProcedures:\n${procedures||'(no verified matching procedures)'}`;
  return [{role:'system',content:system},...history,{role:'user',content:context}];
}

export function localPromptStats(messages:LocalAIMessage[]){return {messages:messages.length,characters:messages.reduce((n,m)=>n+m.content.length,0)}}
