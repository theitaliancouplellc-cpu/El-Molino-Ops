import test from 'node:test';
import assert from 'node:assert/strict';
import { basicConversationAnswer, clearlyUnrelated, contextualSearchQuestion, isCapability, isCapabilityFollowup, isContinuation, type ConversationHistoryMessage } from '../lib/ask-conversation.ts';

const history:ConversationHistoryMessage[]=[
  {role:'user',content:'What can you do?'},
  {role:'assistant',content:'I can help with El Molino operations, tasks, procedures and app questions.'},
];

const humanTurns=`hey there|hello there|hi there|morning|afternoon|evening|good day|yo what's good|hey what's up|hi how are you|how's your day|how is your day|how are you doing|you good|everything good|how's everything|how is everything|what are you up to|you ready|ready to go|thank you so much|thanks a lot|thanks man|thank you sir|ty|tysm|much appreciated|I appreciate it|appreciate you|that helps|perfect thanks|awesome thanks|great thank you|cool thanks|nice thanks|that's perfect|that works|works for me|love it|excellent|ok cool|okay cool|alright cool|gotcha|understood|I understand|makes sense|that makes sense|sounds great|sounds perfect|fine|fair enough|right|correct|exactly|true|agreed|I agree|yessir|for sure|yes please|yeah please|yep please|sure thing|absolutely|definitely|go for it|do it|go ahead|continue|keep going|carry on|proceed|move on|next|next step|what's next|then what|and then|so now what|no thanks|nah|not really|not yet|maybe later|I don't know|idk|not sure|probably|possibly|wait|hold on|one sec|give me a second|pause|stop|never mind|nvm|scratch that|forget that|bye for now|see ya|see you later|talk to you later|catch you later|I'm done|done for now|that's all|we're good|all good|can you help me|what can I do here|what else can you do|what are you able to do|tell me what you can do|how can this help me|what can this bot do|what can the assistant do|what can ask ai do|what do you know|tell me more about that|can you expand on that|expand on that|elaborate|why is that|how so|what do you mean|can you explain that|say more|more`.split('|');

test('130 ordinary human turns never fall into unknown restaurant-fact fallback',()=>{
  assert.equal(humanTurns.length,130);
  for(const q of humanTurns){const recognized=Boolean(basicConversationAnswer(q,history)||isContinuation(q)||isCapability(q)||isCapabilityFollowup(q,history));assert.equal(recognized,true,`unrecognized conversational turn: ${q}`);}
});

test('basic small talk gets a natural local reply',()=>{
  for(const q of ['Hi','hey there','good day','how are you doing?','thank you so much','gotcha','sounds great','hold on','see you later']){const answer=basicConversationAnswer(q,history);assert.ok(answer,`expected local reply for ${q}`);assert.doesNotMatch(String(answer),/not enough verified/i);}
});

test('continuation phrases preserve the previous user topic for degraded fallback',()=>{
  const h:ConversationHistoryMessage[]=[{role:'user',content:'How does Task Center work?'},{role:'assistant',content:'It manages operational tasks.'}];
  for(const q of ['more','go deeper','can you expand on that','what do you mean','what does that mean','why','how','what about managers','continue','and then']){const contextual=contextualSearchQuestion(q,h);assert.match(contextual,/How does Task Center work\?/);assert.match(contextual,/follow-up:/i);}
});

test('capability wording and greeting variants are recognized',()=>{
  for(const q of ['can you help me','what else can you do','what are you able to do','tell me what you can do','what can this bot do','what can Ask AI do','Hi what can you do?','Hey how can you help me?'])assert.equal(isCapability(q),true,q);
});

test('capability followups remain contextual',()=>{
  for(const q of ['more','tell me more about that','go deeper','can you expand on that','what do you mean','why','what about managers'])assert.equal(isCapabilityFollowup(q,history),true,q);
});

test('unrelated-topic guard does not reject restaurant use of sports concepts',()=>{
  assert.equal(clearlyUnrelated('Who won the football game?'),true);
  assert.equal(clearlyUnrelated('What football Sunday specials should El Molino run?'),false);
  assert.equal(clearlyUnrelated('How should the restaurant staff for an NFL Sunday rush?'),false);
  assert.equal(clearlyUnrelated('What is the weather?'),true);
  assert.equal(clearlyUnrelated('Does weather affect El Molino patio staffing?'),false);
});
