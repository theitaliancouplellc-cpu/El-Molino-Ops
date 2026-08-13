import type {ConversationHistoryMessage} from './ask-conversation';

export type DialogueIntent='capability'|'source'|'confusion'|'correction'|'repeat'|'conversation'|'content';
function n(v:string){return String(v||'').toLowerCase().replace(/[’`]/g,"'").replace(/[^a-z0-9'\s]/g,' ').replace(/\s+/g,' ').trim();}
function lastAssistant(history:ConversationHistoryMessage[]){return [...history].reverse().find(x=>x.role==='assistant')?.content||''}
function lastUser(history:ConversationHistoryMessage[]){return [...history].reverse().find(x=>x.role==='user')?.content||''}
export function dialogueIntent(q:string):DialogueIntent{
 const s=n(q);
 if(!s)return'conversation';
 if(/\b(where did (you|that) get|where (is|was) that from|what (is|was) that based on|what source|which source|source for that|why did you say that|how do you know that)\b/.test(s))return'source';
 if(/\b(i'?m confused|i am confused|i don'?t understand|i do not understand|that makes no sense|what are you saying|what does any of that mean|you lost me|huh|i'?m lost)\b/.test(s))return'confusion';
 if(/\b(that'?s not what i asked|that is not what i asked|you misunderstood|you got that wrong|that doesn'?t answer|that does not answer|wrong question|not what i meant|no that'?s not|why are you talking about)\b/.test(s))return'correction';
 if(/\b(repeat that|say that again|what did you just say)\b/.test(s))return'repeat';
 if(capabilityLike(s))return'capability';
 return'content';
}
export function capabilityLike(raw:string){const s=n(raw).replace(/\bevery\s+thing\b/g,'everything');return /\b(what|tell|explain|show)\b.*\b(everything|all|else)?\b.*\b(can you do|you can do|can you help|capabilities|capable of|able to do)\b/.test(s)||/\bwhat do you do\b/.test(s)||/\bhow can you help( me)?\b/.test(s)||/\bwhat can (this|the) (bot|assistant|ai) do\b/.test(s)||/\bwhat can i ask you\b/.test(s)||/\bwhat do you know how to do\b/.test(s);}
export function metaDialogueAnswer(q:string,history:ConversationHistoryMessage[]){const intent=dialogueIntent(q),prev=lastAssistant(history),user=lastUser(history);
 if(intent==='source'){
   if(!prev)return`I don't have a previous answer to trace yet.`;
   if(/^from approved internal el molino knowledge/i.test(prev))return`That previous answer came from the app's approved internal El Molino knowledge retrieval. In this case, it was the wrong retrieval for your question, so it should not have been shown. Your question was about what I can do, not restaurant hours.`;
   if(/el molino ops is organized around|task center|knowledge studio/i.test(prev))return`That came from my built-in reference for the El Molino Ops app itself, not from restaurant knowledge or the web.`;
   return`That came from my conversational fallback logic rather than a verified restaurant fact. If I use restaurant knowledge, I should make that source clear.`;
 }
 if(intent==='confusion'){
   if(!prev)return`Tell me what part is unclear and I'll explain it plainly.`;
   if(/el molino ops is organized around/i.test(prev))return`I explained that badly. I was listing parts of the app when what you were asking about was the conversation itself. The simple answer is: I should understand what you mean from the previous messages, answer that directly, and only look up El Molino information when your question actually requires it.`;
   return`I explained that poorly. In plain language: ${prev.length>500?prev.slice(0,500)+'…':prev}`;
 }
 if(intent==='correction')return`You're right — I misread your intent. I should answer the question you actually asked instead of forcing it into an El Molino lookup.${user?` Your previous question was: “${user.slice(0,240)}”.`:''}`;
 if(intent==='repeat')return prev?prev:`I don't have a previous answer to repeat yet.`;
 return null;
}
