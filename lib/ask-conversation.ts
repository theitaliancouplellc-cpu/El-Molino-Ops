export type ConversationHistoryMessage={role:'user'|'assistant';content:string};

function norm(v:string){return String(v||'').toLowerCase().replace(/[’`]/g,"'").replace(/\s+/g,' ').trim().replace(/[!?.,;:]+$/g,'').trim();}
function any(s:string,patterns:RegExp[]){return patterns.some(p=>p.test(s));}

const greetingPatterns=[
  /^(hi|hello|hey|hiya|yo)( there)?$/,
  /^(morning|afternoon|evening|good day)$/,
  /^(good morning|good afternoon|good evening)( there)?$/,
  /^(yo|hey|hi) (what'?s good|what'?s up|how are you)$/,
];
const wellbeingPatterns=[
  /^(how are you( doing)?|how'?s it going|hows it going|how are things)$/,
  /^(how'?s your day|how is your day|you good|everything good)$/,
  /^(how'?s everything|how is everything|what are you up to|you ready|ready to go)$/,
  /^(what'?s up|whats up|sup)$/,
];
const thanksPatterns=[
  /^(thanks|thank you|thx|ty|tysm)( so much| a lot| man| sir)?$/,
  /^(much appreciated|i appreciate it|appreciate it|appreciate you|that helps)$/,
  /^(perfect|awesome|great|nice|cool|excellent)( thanks| thank you)?$/,
  /^(that'?s perfect|that works|works for me|love it)$/,
];
const acknowledgePatterns=[
  /^(ok|okay|alright|all right)( cool| great| perfect| sounds good)?$/,
  /^(got it|gotcha|understood|i understand|makes sense|that makes sense)$/,
  /^(sounds good|sounds great|sounds perfect|sure thing|fine|fair enough)$/,
  /^(right|correct|exactly|true|agreed|i agree|yessir|for sure)$/,
];
const pausePatterns=[
  /^(wait|hold on|one sec|one second|give me a second|pause|stop)$/,
  /^(never mind|nevermind|nvm|scratch that|forget that)$/,
];
const closingPatterns=[
  /^(bye|goodbye|later|talk later|bye for now|see ya|see you|see you later)$/,
  /^(talk to you later|catch you later|i'?m done|done for now|that'?s all|we'?re good|all good)$/,
];
const shortAnswerPatterns=[
  /^(yes|yeah|yep|yup|yes please|yeah please|yep please|absolutely|definitely)$/,
  /^(no|nope|nah|no thanks|not really|not yet)$/,
  /^(maybe|maybe later|probably|possibly|not sure|i don'?t know|idk)$/,
];
const continuationPatterns=[
  /^(go for it|do it|go ahead|continue|keep going|carry on|proceed|move on)$/,
  /^(next|next step|what'?s next|whats next|then what|and then|so now what|what now|what next)$/,
  /^(more|say more|tell me more( about that)?|go deeper|explain more|break that down|elaborate)$/,
  /^(can you expand on that|expand on that|can you explain that|what do you mean|what does that mean|how so|why is that|why|how)$/,
  /^(what about|how about) .+$/,
];
const capabilityPatterns=[
  /^(?:(?:hi|hello|hey) )?(what( all| else)? can you do|what can you help( me)? with|what do you do|help)$/,
  /^(?:(?:hi|hello|hey) )?(how can you help( me)?|who are you|what are you capable of|what are your capabilities)$/,
  /^(what can i ask you|how do you work|can you help me|what can i do here)$/,
  /^(what are you able to do|tell me what you can do|how can this help me)$/,
  /^(what can this bot do|what can the assistant do|what can ask ai do|what do you know)$/,
];
const molinoScope=/\b(el molino|restaurant|taqueria|johns island|menu|specials?|guests?|customers?|employees?|staff|servers?|bartenders?|kitchen|food|drink|sales|labor|toast|shift|opening|closing|manager|vendor|maintenance|inventory|recipe|training|task|procedure|app)\b/;

export function basicConversationAnswer(q:string,history:ConversationHistoryMessage[]=[]){
  const s=norm(q);if(!s)return null;
  if(any(s,greetingPatterns))return `Hey. I’m here. What do you want to work on for El Molino today?`;
  if(any(s,wellbeingPatterns))return `I’m good and ready to help. What are we working on at El Molino?`;
  if(any(s,thanksPatterns))return `Of course. What do you want to tackle next for El Molino?`;
  if(any(s,acknowledgePatterns))return `Got it. What do you want to do next?`;
  if(any(s,pausePatterns))return `No problem. I’ll hold here until you’re ready.`;
  if(any(s,closingPatterns))return `Got it. I’ll be here when you’re ready to get back to El Molino.`;
  if(any(s,shortAnswerPatterns)&&history.length)return `Got it. I’m following the conversation.`;
  return null;
}

export function isContinuation(q:string){return any(norm(q),continuationPatterns);}
export function isCapability(q:string){return any(norm(q),capabilityPatterns);}
export function isCapabilityFollowup(q:string,history:ConversationHistoryMessage[]){
  if(!isContinuation(q))return false;
  const recent=history.slice(-6).map(m=>norm(m.content)).join(' ');
  return /(what.*can you do|capabilit|answer questions|rotate among|tasks|procedures|what can this bot do|what can ask ai do)/.test(recent);
}
export function clearlyUnrelated(q:string){
  const s=norm(q);if(molinoScope.test(s))return false;
  return /\b(weather|bitcoin|president|nba|nfl|movie|anime|stock market|celebrity|space|quantum|politics|election|crypto|football|basketball|baseball)\b/.test(s);
}
export function contextualSearchQuestion(q:string,history:ConversationHistoryMessage[]){
  if(!isContinuation(q)||!history.length)return q;
  const previous=[...history].reverse().find(m=>m.role==='user'&&norm(m.content)&&!isContinuation(m.content));
  return previous?`${previous.content} — follow-up: ${q}`:q;
}
