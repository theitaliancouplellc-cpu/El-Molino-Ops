import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route=readFileSync(new URL('../app/api/ask/route.ts',import.meta.url),'utf8');
const primary=readFileSync(new URL('../lib/primary-ai-agent.ts',import.meta.url),'utf8');
const localPrompt=readFileSync(new URL('../lib/local-ai-prompt.ts',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../app/ask-agent-bridge.tsx',import.meta.url),'utf8');
const weather=readFileSync(new URL('../lib/live-weather.ts',import.meta.url),'utf8');

const naturalConversationSamples=[
  'hey good afternoon','good morning how are you','yo what is up','thanks man','okay got it','wait a second','never mind','what do you mean by that','can you go deeper','why','how so','give me an example','what about managers','and then what','say that another way','that is not what I meant','I am confused','can you explain it simpler','what are you thinking','help me think through this',
  'I had a rough shift today','we were slammed at lunch','I need an idea','brainstorm with me','what would you do','does that make sense','I disagree','you misunderstood me','start over','keep going','tell me more','what else','okay but why','how would that work','can you compare them','which one is better','what is the downside','what am I missing','what if we did the opposite','walk me through it'
];

const operationalConversationSamples=[
  'what should I focus on before dinner service','help me plan tonight','how should I train a new server','what is our closing procedure','where do I find task center','what is on the menu','how do refunds work','what do managers need to check','explain labor cost to me','what were we talking about before','turn that into a checklist','make that shorter','add a manager step','what about kitchen staff','why is that important','give me a real example','what does that mean for tonight','how would I explain that to my team','what should I ask the owner','help me prepare for a meeting',
  'what do we know about this vendor','do we have a procedure for this','what does the app say about training','where is that information stored','summarize the relevant knowledge','do not show me raw records','just explain it normally','what source is that based on','is that verified internally','what do we not know yet','what should I verify','can you remember the context','continue from your last answer','compare that to the other option','what would happen next','can you draft the task','can you draft an SOP','save this as knowledge','do not create it yet','show me the draft first'
];

const outOfScopeSamples=[
  'what is the capital of france','who won the game last night','what is bitcoin doing today','write me a poem about mars','explain quantum mechanics','what is the weather tomorrow in tokyo','help me buy a gaming laptop','what movie should I watch','what are the best beaches in italy','teach me calculus','translate this unrelated paragraph','what is the latest political news','tell me about ancient rome','who is the president','what is the stock market doing','help me plan a vacation','what is the best anime','tell me a random joke','what is a black hole','explain photosynthesis',
  'what should I cook at home tonight','help me fix my car','what phone should I buy','search the web for sneakers','tell me celebrity news','what is the nfl schedule','how do I build a gaming pc','what happened in world news','help me study chemistry','what is the moon made of','recommend a tv show','what are lottery odds','how do mortgages work','what is the tallest mountain','tell me about dinosaurs','what is a good workout','how do I learn guitar','what are chess openings','explain cryptocurrency','what is the newest iphone'
];

test('120 natural messages are delegated to the model rather than phrase handlers',()=>{
  const samples=[...naturalConversationSamples,...operationalConversationSamples,...outOfScopeSamples];
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
    [/fully conversational AI assistant/,'system prompt defines a conversational model'],
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

test('Ask El Molino stays conversational but refuses unrelated general-purpose questions',()=>{
  for(const source of [route,localPrompt]){
    assert.match(source,/Your scope is El Molino only/);
    assert.match(source,/Do not answer unrelated general-knowledge questions/);
    assert.match(source,/focused on El Molino/);
  }
  assert.doesNotMatch(route,/You may answer general knowledge and everyday questions/);
  assert.doesNotMatch(localPrompt,/You may discuss general knowledge/);
});

test('out-of-scope refusals stop after one short sentence',()=>{
  for(const source of [route,localPrompt]){
    assert.match(source,/one short sentence only/);
    assert.match(source,/Stop after the refusal/);
    assert.match(source,/Do not explain what information or access you lack/);
  }
});

test('Johns Island weather is live operational context, not an out-of-scope question',()=>{
  assert.match(route,/getJohnsIslandWeatherContext/);
  assert.match(route,/needsLiveWeather\(retrievalQuery\)/);
  assert.match(route,/PRIVATE LIVE JOHNS ISLAND WEATHER/);
  assert.match(route,/Current Johns Island weather is in scope/);
  assert.match(route,/do not ask the user to provide weather data/i);
  assert.match(localPrompt,/Current Johns Island weather is in scope/);
  assert.match(localPrompt,/answer weather questions directly/i);
  assert.match(bridge,/liveContext:remotePayload\?\.liveContext/);
  assert.match(weather,/api\.open-meteo\.com\/v1\/forecast/);
  assert.match(weather,/temperature_unit:'fahrenheit'/);
  assert.match(weather,/wind_speed_unit:'mph'/);
});

test('assistant output is plain text instead of raw markdown symbols',()=>{
  assert.match(route,/Output plain text only/);
  assert.match(route,/Do not use Markdown, asterisks, hashtags, backticks, bold markers or decorative symbols/);
  assert.match(localPrompt,/Output plain text only/);
  assert.match(bridge,/function plainAssistantText/);
  assert.match(bridge,/answer:plainAssistantText\(hosted\.text\)/);
  assert.match(bridge,/answer:plainAssistantText\(local\.text\)/);
  assert.match(route,/answer:plainAssistantText\(result\.text\)/);
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
