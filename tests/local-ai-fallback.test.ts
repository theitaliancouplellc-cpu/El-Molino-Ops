import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLocalAIMessages, localPromptStats } from '../lib/local-ai-prompt.ts';

const naturalTurns=[
  'hey chat','good morning','what all can you do','can you help me think through tonight','i had a rough shift','why do you think that happened','tell me more','what do you mean by that','okay but what about managers','give me an example','break that down','what would you do','can we change subjects','help me write something','make this sound better','summarize what we just talked about','what was the first thing i said','do you remember what i meant','what if we are short staffed','how would that change things',
  'what are some ways to increase restaurant revenue','how do food costs affect profit','help me coach a server','what is contribution margin','explain labor percentage simply','brainstorm ten ideas','compare those two options','which one would you pick and why','turn that into a plan','make it shorter','make it more detailed','explain it like i am new','what are the risks','what am i missing','challenge my assumption','what should i measure','how do i know if it worked','what would you ask me next','keep going','continue',
  'what is the closing procedure','why do we do step two','what if the closer calls out','where is task center','what is in knowledge studio','what menu information do we have','how should i use this app','what did the restaurant approve','what do we know about the johns island location','which procedure applies here','can you combine that with what you said before','what does that mean operationally','show me a realistic scenario','give me a manager version','give me an employee version','what should happen first','and after that','what if that fails','what is the fallback','what should i document',
  'write a pre shift huddle','draft a training outline','make a side work checklist','help me plan friday','help me prepare for a rush','what should i watch during service','how should i prioritize tickets','how can i reduce bottlenecks','how can i improve table turns','how can i improve guest retention','help me think about scheduling','explain overtime tradeoffs','how should i forecast staffing','what data would you want','what if sales are lower than expected','what if they are higher','how do i communicate a cut','how do i coach without sounding harsh','rewrite that more professionally','now make it warmer',
  'what is 15 percent of 200','explain why the sky looks blue','what is the difference between revenue and profit','help me organize my thoughts','what should i cook for dinner','tell me a clean joke','what day comes after monday','explain compound interest','help me make a packing list','what are three ways to remember something','can you quiz me','ask me one question at a time','wait i changed my mind','ignore that last direction','go back to the earlier idea','which earlier idea was strongest','can you argue the opposite side','now reconcile both sides','give me the conclusion','what should i do next',
  'hey are you there','yo','sup','thanks','that helps','not what i meant','try again','you misunderstood me','let me rephrase','actually forget that','new topic','one more thing','why','how','when','where','who handles that','does that apply here','is there another option','what else','anything else'
];

test('120+ ordinary conversation turns can always be expressed as model input without phrase routing',()=>{
  assert.ok(naturalTurns.length>=120);
  for(const turn of naturalTurns){
    const messages=buildLocalAIMessages({question:turn,history:[{role:'user',content:'We are discussing restaurant operations.'},{role:'assistant',content:'Got it. What part do you want to work through?'}]});
    assert.equal(messages[0].role,'system',turn);
    assert.equal(messages.at(-1)?.role,'user',turn);
    assert.match(messages.at(-1)?.content||'',new RegExp(turn.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),turn);
  }
});

test('local prompt preserves conversational history and private context without database-dump language',()=>{
  const messages=buildLocalAIMessages({
    question:'why do we do that?',
    history:[{role:'user',content:'Explain the closing cash procedure.'},{role:'assistant',content:'First reconcile the drawer.'}],
    knowledge:[
      {title:'Closing cash',content:'Managers reconcile the drawer before final close.',status:'approved',category:'operational_knowledge'},
      {title:'Secret draft',content:'This must not be used.',status:'draft',category:'operational_knowledge'}
    ],
    procedures:[{title:'Closing procedure',description:'Reconcile cash, verify totals, secure funds.',status:'published'}]
  });
  const text=messages.map(m=>m.content).join('\n');
  assert.match(text,/Explain the closing cash procedure/i);
  assert.match(text,/Managers reconcile the drawer/i);
  assert.match(text,/Reconcile cash, verify totals/i);
  assert.doesNotMatch(text,/This must not be used/i);
  assert.doesNotMatch(text,/From approved internal knowledge I found/i);
});

test('local prompt stays bounded under excessive history and records',()=>{
  const history=Array.from({length:100},(_,i)=>({role:(i%2?'assistant':'user') as 'user'|'assistant',content:`message ${i} ${'x'.repeat(4000)}`}));
  const knowledge=Array.from({length:300},(_,i)=>({title:`Record ${i}`,content:`restaurant ${'y'.repeat(3000)}`,status:'approved'}));
  const procedures=Array.from({length:200},(_,i)=>({title:`Procedure ${i}`,description:`restaurant ${'z'.repeat(3000)}`,status:'published'}));
  const messages=buildLocalAIMessages({question:'restaurant plan',history,knowledge,procedures});
  const stats=localPromptStats(messages);
  assert.ok(messages.length<=16,`too many messages: ${messages.length}`);
  assert.ok(stats.characters<45000,`prompt too large: ${stats.characters}`);
});

test('Ask bridge authenticates hosted requests and falls back locally without rewriting user speech',()=>{
  const bridge=readFileSync(new URL('../app/ask-agent-bridge.tsx',import.meta.url),'utf8');
  assert.match(bridge,/supabase\.auth\.getSession\(\)/);
  assert.match(bridge,/authorization.*Bearer/i);
  assert.match(bridge,/body\.history=history\.slice\(-20\)/);
  assert.match(bridge,/runLocalBrowserAI\(messages\)/);
  assert.match(bridge,/buildLocalAIMessages/);
  assert.doesNotMatch(bridge,/El Molino conversation turn:/);
  assert.match(bridge,/\[401,413,429\]\.includes\(remote\.status\)/);
  assert.match(bridge,/\.\.\.\(remotePayload&&typeof remotePayload==='object'\?remotePayload:\{\}\)/);
});

test('local worker uses compatible Qwen2.5 WebGPU primary and lightweight q4 WASM emergency model',()=>{
  const worker=readFileSync(new URL('../lib/local-ai.worker.ts',import.meta.url),'utf8');
  assert.match(worker,/Qwen2\.5-0\.5B-Instruct/);
  assert.match(worker,/SmolLM2-360M-Instruct/);
  assert.match(worker,/device:'webgpu'/);
  assert.match(worker,/dtype:'q4f16'/);
  assert.match(worker,/dtype:'q4'/);
  assert.match(worker,/wasm-q4/);
  assert.match(worker,/requestAdapter\(\)/);
  assert.match(worker,/max_new_tokens:220/);
  assert.match(worker,/LOCAL_AI_WEBGPU_GENERATION_FAILED/);
  assert.match(worker,/switchToFallback\(\)/);
});

test('hung local AI worker is terminated so the next request can recover',()=>{
  const client=readFileSync(new URL('../lib/local-ai-client.ts',import.meta.url),'utf8');
  assert.match(client,/function resetWorker/);
  assert.match(client,/worker\?\.terminate\(\)/);
  assert.match(client,/resetWorker\(\)/);
  assert.match(client,/Local AI timed out while loading or generating/);
});
