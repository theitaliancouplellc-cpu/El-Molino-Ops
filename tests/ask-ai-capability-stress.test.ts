import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basicConversationAnswer, clearlyUnrelated, contextualSearchQuestion, isCapability, isContinuation, type ConversationHistoryMessage } from '../lib/ask-conversation.ts';

const continuationCases=[
  'more','say more','tell me more about that','go deeper','explain more','break that down','elaborate','can you go into more details about that','go into more detail about that','can you give me more details about that',
  'can you expand on that','expand on that','can you explain that','what do you mean','what does that mean','what all does that mean','how so','why is that','why','how',
  'give me an example','can you give me an example','show me an example','for example','like what','such as what','continue','keep going','what about managers','and then'
];

test('stress 30 continuation phrasings are understood',()=>{
  assert.equal(continuationCases.length,30);
  for(const q of continuationCases)assert.equal(isContinuation(q),true,q);
});

const capabilityCases=[
  'what can you do','what all can you do','what else can you do','what can you help me with','what do you do','help','how can you help me','who are you','what are you capable of','what are your capabilities',
  'what can i ask you','how do you work','can you help me','what can i do here','what are you able to do','tell me what you can do','how can this help me','what can this bot do','what can the assistant do','what can Ask AI do'
];

test('stress 20 capability questions are recognized',()=>{
  assert.equal(capabilityCases.length,20);
  for(const q of capabilityCases)assert.equal(isCapability(q),true,q);
});

const previousAnswers=[
  'I can answer questions about this app and El Molino, carry conversations across follow-ups, use approved restaurant knowledge and procedures, help with operational planning, and prepare tasks, procedures/checklists and knowledge records for review.',
  'In practical terms I can help with app navigation, approved restaurant knowledge, procedures, training, opening, mid-shift and closing work, manager planning and task drafts.',
  'El Molino Ops is organized around Today, Work, Team, Ask AI and More. Deeper systems include Task Center, Calendar and Knowledge Studio.',
  'Task Center is where operational work is created, assigned, prioritized, tracked and completed.',
  'Knowledge Studio is the restaurant internal source of truth and approved records can answer restaurant questions.'
];
const progressivePrompts=['can you go into more details about that','what all does that mean','give me an example','why'];

test('stress 20 second-level followups progress instead of repeating',()=>{
  let count=0;
  for(const prev of previousAnswers){
    const history:ConversationHistoryMessage[]=[{role:'user',content:'What can you do?'},{role:'assistant',content:prev}];
    for(const q of progressivePrompts){
      const answer=basicConversationAnswer(q,history);
      assert.ok(answer,`${q} after ${prev.slice(0,40)}`);
      assert.notEqual(answer,prev,`repeated prior answer for ${q}`);
      assert.ok(String(answer).length>80,`answer too shallow for ${q}`);
      count++;
    }
  }
  assert.equal(count,20);
});

const domainCases:[string,boolean][]=[
  ['Who won the football game?',true],['What is the weather?',true],['Tell me about bitcoin',true],['What anime should I watch?',true],['How much horsepower does a Mustang have?',true],
  ['Does weather affect El Molino patio staffing?',false],['How should El Molino staff for an NFL Sunday rush?',false],['Should the restaurant run a football Sunday special?',false],['How do food costs affect profit?',false],['How do I train a new server?',false],
  ['Where is Task Center?',false],['How do I close the restaurant?',false],['What should managers check before opening?',false],['How should we handle a guest refund?',false],['How do I review employee training?',false],
  ['What is on the menu?',false],['How do I count the cash drawer?',false],['Where are approved procedures?',false],['How do permissions work?',false],['How do I upload a file?',false]
];

test('stress 20 domain-boundary decisions keep restaurant context and reject unrelated topics',()=>{
  assert.equal(domainCases.length,20);
  for(const [q,expected] of domainCases)assert.equal(clearlyUnrelated(q),expected,q);
});

const contextualFollowups=[
  'more','say more','tell me more about that','go deeper','explain more','break that down','elaborate','can you go into more details about that','go into more detail about that','can you expand on that',
  'expand on that','can you explain that','what do you mean','what does that mean','what all does that mean','how so','why is that','why','how','give me an example'
];

test('stress 20 contextual followups retain the original operational topic',()=>{
  const history:ConversationHistoryMessage[]=[{role:'user',content:'How does Task Center work?'},{role:'assistant',content:'It manages operational tasks, assignments and completion.'}];
  assert.equal(contextualFollowups.length,20);
  for(const q of contextualFollowups){
    const contextual=contextualSearchQuestion(q,history);
    assert.match(contextual,/How does Task Center work\?/);
    assert.match(contextual,/follow-up:/i);
  }
});

test('stress 10 Ask API source contracts preserve core safety and capability boundaries',()=>{
  const route=readFileSync(new URL('../app/api/ask/route.ts',import.meta.url),'utf8');
  const contracts:[RegExp,string][]=[
    [/authenticatedUser\(req\)/,'requires authenticated user'],
    [/status:429/,'rate limit exists'],
    [/1_000_000/,'request body limit exists'],
    [/verifiedStatus/,'knowledge approval filter exists'],
    [/slice\(-20\)/,'conversation history is bounded and supplied'],
    [/Treat the conversation as continuous/,'AI system prompt requires continuity'],
    [/Never invent a restaurant fact or completed action/,'hallucinated facts/actions are prohibited'],
    [/detectAction\(question\)/,'action proposal detection exists'],
    [/runFreeAI\(messages\)/,'free provider router is used'],
    [/localFallback\(question,history,knowledge,procedures\)/,'local degraded fallback remains available']
  ];
  assert.equal(contracts.length,10);
  for(const [pattern,label] of contracts)assert.match(route,pattern,label);
});
