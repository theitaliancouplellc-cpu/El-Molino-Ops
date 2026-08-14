import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const puter=readFileSync(new URL('../lib/puter-ai-client.ts',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../app/ask-agent-bridge.tsx',import.meta.url),'utf8');
const primary=readFileSync(new URL('../lib/primary-ai-agent.ts',import.meta.url),'utf8');

test('keyless hosted browser AI loads Puter without embedding an API credential',()=>{
  assert.match(puter,/https:\/\/js\.puter\.com\/v2\//);
  assert.match(puter,/attempt_temp_user_creation:true/);
  assert.match(puter,/listModels/);
  assert.match(puter,/gpt-5\.4-nano/);
  assert.match(puter,/cost\?\.input===0/);
  assert.doesNotMatch(puter,/gemini-3\.6-flash|qwen3\.6-flash/);
  assert.doesNotMatch(puter,/API_KEY|api[_-]?key/i);
});

test('Ask bridge tries healthy server AI, then keyless hosted browser AI, then on-device AI',()=>{
  const remote=bridge.indexOf('remote=await original(input,requestInit)');
  const hosted=bridge.indexOf('runPuterBrowserAI(messages,puterAuthAttempt)');
  const local=bridge.indexOf('runLocalBrowserAI(messages)');
  assert.ok(remote>=0&&hosted>remote&&local>hosted,`unexpected fallback order: ${remote}, ${hosted}, ${local}`);
  assert.match(bridge,/beginPuterAuthFromUserGesture\(\)/);
  assert.match(bridge,/degraded:false/);
});

test('known-broken Vercel AI Gateway is opt-in instead of silently retried in production',()=>{
  assert.match(primary,/VERCEL_AI_GATEWAY_ENABLED/);
  assert.match(primary,/toLowerCase\(\)==='true'/);
  assert.match(primary,/if\(!enabled\(\)\)return null/);
});
