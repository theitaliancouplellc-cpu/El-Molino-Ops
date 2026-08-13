export type ConversationHistoryMessage={role:'user'|'assistant';content:string};

function norm(v:string){return String(v||'').toLowerCase().replace(/[’`]/g,"'").replace(/[^a-z0-9'\s-]+/g,' ').replace(/\s+/g,' ').trim();}
function any(s:string,patterns:RegExp[]){return patterns.some(p=>p.test(s));}
function lastAssistant(history:ConversationHistoryMessage[]){return [...history].reverse().find(m=>m.role==='assistant'&&norm(m.content))?.content||'';}

const greetingPatterns=[/^(hi|hello|hey|hiya|yo)( there)?$/, /^(morning|afternoon|evening|good day)$/, /^(good morning|good afternoon|good evening)( there)?$/];
const wellbeingPatterns=[/^(how are you( doing)?|how'?s it going|hows it going|how are things)$/, /^(how'?s your day|how is your day|you good|everything good)$/, /^(what'?s up|whats up|sup)$/];
const thanksPatterns=[/^(thanks|thank you|thx|ty|tysm)( so much| a lot| man| sir)?$/, /^(much appreciated|i appreciate it|appreciate it|appreciate you|that helps)$/, /^(perfect|awesome|great|nice|cool|excellent)( thanks| thank you)?$/];
const acknowledgePatterns=[/^(ok|okay|alright|all right)( cool| great| perfect| sounds good)?$/, /^(got it|gotcha|understood|i understand|makes sense|that makes sense)$/, /^(sounds good|sounds great|sounds perfect|sure thing|fine|fair enough)$/, /^(right|correct|exactly|true|agreed|i agree|yessir|for sure)$/];
const pausePatterns=[/^(wait|hold on|one sec|one second|give me a second|pause|stop)$/, /^(never mind|nevermind|nvm|scratch that|forget that)$/];
const closingPatterns=[/^(bye|goodbye|later|talk later|bye for now|see ya|see you|see you later)$/, /^(talk to you later|catch you later|i'?m done|done for now|that'?s all|we'?re good|all good)$/];
const continuationPatterns=[/^(go for it|do it|go ahead|continue|keep going|carry on|proceed|move on)$/, /^(next|next step|what'?s next|whats next|then what|and then|so now what|what now|what next)$/, /^(more|say more|tell me more( about that)?|go deeper|explain more|break that down|elaborate)$/, /^(can you expand on that|expand on that|can you explain that|what do you mean|what does that mean|how so|why is that|why|how)$/, /^(what about|how about) .+$/];
const capabilityPatterns=[/^(?:(?:hi|hello|hey) )?(what( all| else)? can you do|what can you help( me)? with|what do you do|help)$/, /^(?:(?:hi|hello|hey) )?(how can you help( me)?|who are you|what are you capable of|what are your capabilities)$/, /^(what can i ask you|how do you work|can you help me|what can i do here)$/, /^(what are you able to do|tell me what you can do|how can this help me)$/, /^(what can this bot do|what can the assistant do|what can ask ai do|what do you know)$/, /^(?:(?:hi|hello|hey) )?what is every thing you can do$/];
const confusionPatterns=[/^(i'?m confused|im confused|i don'?t understand|i dont understand|that confused me|you lost me|i'?m lost|im lost)$/, /^(that doesn'?t make sense|that does not make sense|i don'?t get it|i dont get it)$/];
const provenancePatterns=[/^(where did you get that( from)?|where is that from|what'?s your source|whats your source|source for that|how do you know that|what are you basing that on)$/];
const correctionPatterns=[/^(that'?s not what i asked|thats not what i asked|you misunderstood( me)?|that'?s not what i meant|thats not what i meant|no that'?s wrong|no thats wrong|you answered the wrong question)$/];
const repeatPatterns=[/^(say that again|repeat that|repeat your last answer|what did you just say|what was your last answer)$/];

const domainWords=/\b(el molino|restaurant|taqueria|johns island|menu|specials?|guests?|customers?|employees?|staff|servers?|bartenders?|kitchen|food|drink|sales|labor|toast|shift|opening|closing|manager|vendor|maintenance|inventory|recipe|training|task|procedure|app|schedule|payroll|cost|profit|loss|p&l|invoice|equipment|cleaning|sanitation|health|inspection|cash|drawer|deposit|tip|tips|refund|void|discount|comps?|reservation|catering|delivery|doordash|uber|postmates|supplies|ordering|prep|station|checklist|knowledge|file|report|analytics|permission|role|account|notification|calendar|discussion|capture|admin|security)\b/;
const explicitOffDomain=/\b(nba|nfl|mlb|nhl|football|basketball|baseball|soccer|hockey|sports?|car|cars|truck|trucks|mustang|vehicle|vehicles|engine|horsepower|anime|movie|movies|celebrity|celebrities|bitcoin|crypto|stock market|election|president|politics|quantum physics|space travel)\b/;

export function basicConversationAnswer(q:string,history:ConversationHistoryMessage[]=[]){
  const s=norm(q);if(!s)return null;
  if(any(s,greetingPatterns))return `Hey. What can I help you with?`;
  if(any(s,wellbeingPatterns))return `I’m good and ready to help. What are we working on?`;
  if(any(s,thanksPatterns))return `Of course. What do you want to tackle next?`;
  if(any(s,acknowledgePatterns))return `Got it. What do you want to do next?`;
  if(any(s,pausePatterns))return `No problem. I’ll hold here until you’re ready.`;
  if(any(s,closingPatterns))return `Got it. I’ll be here when you’re ready.`;
  if(any(s,confusionPatterns)&&history.length){const prev=lastAssistant(history);return prev?`I can explain that differently. My last answer was trying to say: ${prev.slice(0,700)} Tell me which part was unclear and I’ll break it down.`:`Tell me what part is unclear and I’ll explain it another way.`;}
  if(any(s,provenancePatterns)&&history.length){const prev=lastAssistant(history);if(!prev)return `Tell me which answer you mean and I’ll explain what it was based on.`;if(/approved internal el molino knowledge|i found these approved related procedures/i.test(prev))return `That answer came from approved information already stored in El Molino Ops. I can also tell you which internal record or procedure it came from.`;if(/i can answer questions about this app|in practical terms i can help|el molino ops is organized/i.test(prev))return `That came from the app’s own feature/reference information, not from a restaurant fact lookup.`;return `That came from the context of our conversation and the El Molino/app information available to me. If it included a restaurant fact, I should only treat it as verified when it came from approved internal data.`;}
  if(any(s,correctionPatterns)&&history.length)return `You’re right — I misunderstood the intent of your last message. Rephrase it however you naturally would, and I’ll answer the question itself instead of forcing it into a lookup.`;
  if(any(s,repeatPatterns)&&history.length){const prev=lastAssistant(history);return prev||`I don’t have a previous assistant answer in this conversation yet.`;}
  return null;
}

export function isContinuation(q:string){return any(norm(q),continuationPatterns);}
export function isCapability(q:string){return any(norm(q),capabilityPatterns);}
export function isCapabilityFollowup(q:string,history:ConversationHistoryMessage[]){
  if(!isContinuation(q))return false;
  const recent=history.slice(-8).map(m=>norm(m.content)).join(' ');
  return /(what.*can you do|capabilit|answer questions|tasks|procedures|what can this bot do|what can ask ai do)/.test(recent);
}
export function clearlyUnrelated(q:string,history:ConversationHistoryMessage[]=[]){
  const s=norm(q);if(!s||domainWords.test(s)||isContinuation(q)||isCapability(q))return false;
  const recent=history.slice(-8).map(m=>norm(m.content)).join(' ');
  if(domainWords.test(recent)&&!/^(tell me about|what is|who is|how does|explain) /.test(s))return false;
  return explicitOffDomain.test(s);
}
export function contextualSearchQuestion(q:string,history:ConversationHistoryMessage[]){
  if(!isContinuation(q)||!history.length)return q;
  const previous=[...history].reverse().find(m=>m.role==='user'&&norm(m.content)&&!isContinuation(m.content));
  return previous?`${previous.content} — follow-up: ${q}`:q;
}
