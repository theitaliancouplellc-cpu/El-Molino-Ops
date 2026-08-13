import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route=readFileSync(new URL('../app/api/ask/route.ts',import.meta.url),'utf8');
const primary=readFileSync(new URL('../lib/primary-ai-agent.ts',import.meta.url),'utf8');

const naturalConversationSamples=[
  'hey good afternoon','good morning how are you','yo what is up','thanks man','okay got it','wait a second','never mind','what do you mean by that','can you go deeper','why','how so','give me an example','what about managers','and then what','say that another way','that is not what I meant','I am confused','can you explain it simpler','what are you thinking','help me think through this',
  'I had a rough shift today','we were slammed at lunch','I need an idea','brainstorm with me','what would you do','does that make sense','I disagree','you misunderstood me','start over','keep going','tell me more','what else','okay but why','how would that work','can you compare them','which one is better','what is the downside','what am I missing','what if we did the opposite','walk me through it'
];

const operationalConversationSamples=[
  'what should I focus on before dinner service','help me plan tonight','how should I train a new server','what is our closing procedure','where do I find task center','what is on the menu','how do refunds work','what do managers need to check','explain labor cost to me','what were we talking about before','turn that into a checklist','make that shorter','add a manager step','what about kitchen staff','why is that important','give me a real example','what does that mean for tonight','how would I explain that to my team','what should I ask the owner','help me prepare for a meeting',
  'what do we know about this vendor','do we have a procedure for this','what does the app say about training','where is that information stored','summarize the relevant knowledge','do not show me raw records','just explain it normally','what source is that based on','is that verified internally','what do we not know yet','what should I verify','can you remember the context','continue from your last answer','compare that to the other option','what would happen next','can you draft the task','can you draft an SOP','save this as knowledge','do not create it yet','show me the draft first'
];

const generalConversationSamples=[
  'what is the difference between revenue and profit','explain compound interest simply','how do I write a professional email','what makes a good leader','help me organize my thoughts','what is a metaphor','give me a dinner idea','how can I improve my sleep schedule','explain this like I am new to it','what is the best way to learn something','help me make a pros and cons list','what questions should I ask','can you summarize what I just said','rewrite that more clearly','make that sound less formal','translate the idea into plain English','what assumptions are we making','challenge my plan','find the weak point in this idea','what is another way to approach it',
  'I changed my mind','go back to the first option','what did you say earlier','why did you recommend that','what would change your answer','how confident are you','what information do you need','what can you infer from this','what can you not know from this','help me decide','give me three options','rank them','pick one and explain why','what is the tradeoff','make a step by step plan','what comes first','what comes after that','what if I only have an hour','simplify the plan','now make it more detailed'
];

test('120 natural messages are delegated to the model rather than phrase handlers',()=>{
  const samples=[...naturalConversationSamples,...operationalConversationSamples,...generalConversationSamples];
  assert.equal(samples.length,120);
  assert.doesNotMatch(route,/basicConversationAnswer/);
  assert.doesNotMatch(route,/isCapabilityFollowup/);
  assert.doesNotMatch(route,/clearlyUnrelated/);
  assert.doesNotMatch(route,/greetingPatterns/);
  assert.match(route,/const result=await runFreeAI\(messages\)/);
});

test('Ask AI model-first source contracts preserve safety without scripted conversation',()=>{
  const contracts:[RegExp,string][]=[
    [/authenticatedUser\(req\)/,'requires authenticated user'],
    [/status:429/,'rate limit exists'],
    [/1_000_000/,'request body limit exists'],
    [/verifiedStatus/,'knowledge approval filter exists'],
    [/slice\(-30\)/,'conversation history is bounded and supplied'],
    [/full conversational AI assistant/,'system prompt defines a conversational model'],
    [/Every user message is part of one continuous conversation/,'conversation continuity is explicit'],
    [/rather than phrase matching/,'phrase matching is explicitly rejected'],
    [/Do not expose raw retrieval blocks/,'retrieval remains private context'],
    [/runFreeAI\(messages\)/,'model handles normal messages'],
    [/temporarily unavailable right now/,'degraded mode does not impersonate AI'],
    [/Never invent completed app actions/,'actions remain truthful']
  ];
  assert.equal(contracts.length,12);
  for(const [pattern,label] of contracts)assert.match(route,pattern,label);
});

test('Ask AI uses only the configured zero-cost language-model lane',()=>{
  assert.match(route,/zai\/glm-4\.6v-flash/);
  assert.match(route,/poolside\/laguna-s-2\.1-free/);
  assert.match(route,/inclusionai\/ling-3\.0-tiny-free/);
  assert.match(route,/EL_MOLINO_AGENT_MODEL=FREE_MODELS\[0\]/);
  assert.match(route,/EL_MOLINO_AGENT_FALLBACK_MODELS=FREE_MODELS\.slice\(1\)\.join/);
  assert.match(primary,/EL_MOLINO_AGENT_MODEL/);
  assert.match(primary,/EL_MOLINO_AGENT_FALLBACK_MODELS/);
});

test('restaurant retrieval is context for the model, never the final canned response',()=>{
  assert.match(route,/PRIVATE RELEVANT APPROVED EL MOLINO KNOWLEDGE/);
  assert.match(route,/PRIVATE RELEVANT APPROVED PROCEDURES/);
  assert.match(route,/use naturally; do not dump verbatim/);
  assert.doesNotMatch(route,/From approved internal El Molino knowledge I found/);
  assert.doesNotMatch(route,/I found these approved related procedures/);
  assert.doesNotMatch(route,/localFallback\(/);
});

test('conversation history and current question both influence retrieval context',()=>{
  assert.match(route,/history\.slice\(-8\)\.filter\(m=>m\.role==='user'\)/);
  assert.match(route,/question\]\.join\(' '\)/);
  assert.match(route,/\.\.\.history/);
  assert.match(route,/role:'system'/);
  assert.match(route,/role:'user'/);
});
