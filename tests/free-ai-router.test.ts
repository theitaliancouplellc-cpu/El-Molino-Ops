import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProviderFailure, configuredFreeProviders, parseRetryAfter, resetAIRouterStateForTests, runLanePlan, type AILane } from '../lib/free-ai-router.ts';

test('429 becomes short quota cooldown', () => {
  const r = classifyProviderFailure(429, 'rate limit exceeded', 2500);
  assert.equal(r.reason, 'quota_or_rate_limit');
  assert.equal(r.cooldownMs, 2500);
});

test('billing and exhausted credit are treated as free-quota exhaustion', () => {
  assert.equal(classifyProviderFailure(402, 'payment required').reason, 'free_quota_exhausted');
  assert.equal(classifyProviderFailure(400, 'insufficient credit').reason, 'free_quota_exhausted');
});

test('bad credentials receive a long cooldown so router moves on', () => {
  const r = classifyProviderFailure(401, 'invalid api key');
  assert.equal(r.reason, 'invalid_credentials');
  assert.ok(r.cooldownMs >= 30 * 60_000);
});

test('server failures are retryable through another lane', () => {
  const r = classifyProviderFailure(503, 'upstream unavailable');
  assert.equal(r.reason, 'provider_error');
  assert.ok(r.cooldownMs <= 60_000);
});

test('successful HTTP response with no model text is classified as empty response',()=>{
  assert.equal(classifyProviderFailure(200,'').reason,'empty_response');
});

test('Retry-After supports both seconds and HTTP dates',()=>{
  assert.equal(parseRetryAfter('2',1_000),2_000);
  assert.equal(parseRetryAfter('Wed, 21 Oct 2015 07:28:00 GMT',Date.parse('Wed, 21 Oct 2015 07:27:58 GMT')),2_000);
  assert.equal(parseRetryAfter('not-a-date',1_000),0);
});

test('provider config never exposes secret values', () => {
  const result = configuredFreeProviders();
  for (const value of Object.values(result)) assert.equal(typeof value, 'boolean');
});

test('disabled Groq free-only lane is reported as disabled even with a key',()=>{
  const beforeKey=process.env.GROQ_API_KEY,beforeFlag=process.env.GROQ_FREE_ONLY;
  process.env.GROQ_API_KEY='fake-test-key';process.env.GROQ_FREE_ONLY='false';
  assert.equal(configuredFreeProviders().groq,false);
  if(beforeKey===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=beforeKey;
  if(beforeFlag===undefined)delete process.env.GROQ_FREE_ONLY;else process.env.GROQ_FREE_ONLY=beforeFlag;
});

test('Cloudflare hosted lane requires account, token, and free-only enablement',()=>{
  const beforeToken=process.env.CLOUDFLARE_API_TOKEN;
  const beforeAccount=process.env.CLOUDFLARE_ACCOUNT_ID;
  const beforeFlag=process.env.CLOUDFLARE_FREE_ONLY;
  process.env.CLOUDFLARE_API_TOKEN='fake-test-token';
  process.env.CLOUDFLARE_ACCOUNT_ID='fake-account';
  process.env.CLOUDFLARE_FREE_ONLY='true';
  assert.equal(configuredFreeProviders().cloudflare,true);
  process.env.CLOUDFLARE_FREE_ONLY='false';
  assert.equal(configuredFreeProviders().cloudflare,false);
  if(beforeToken===undefined)delete process.env.CLOUDFLARE_API_TOKEN;else process.env.CLOUDFLARE_API_TOKEN=beforeToken;
  if(beforeAccount===undefined)delete process.env.CLOUDFLARE_ACCOUNT_ID;else process.env.CLOUDFLARE_ACCOUNT_ID=beforeAccount;
  if(beforeFlag===undefined)delete process.env.CLOUDFLARE_FREE_ONLY;else process.env.CLOUDFLARE_FREE_ONLY=beforeFlag;
});

function lane(id:string,status:number,text='',detail=''):AILane{
  return {id,provider:id,model:id,run:async()=>({status,text,detail})};
}

test('quota exhaustion immediately rotates to next model', async()=>{
  resetAIRouterStateForTests();
  const result=await runLanePlan([lane('a',429,'','quota exceeded'),lane('b',200,'working answer')]);
  assert.equal(result?.provider,'b');
  assert.equal(result?.text,'working answer');
  assert.equal(result?.attempts[0].reason,'quota_or_rate_limit');
  assert.equal(result?.attempts[1].ok,true);
});

test('invalid provider key cannot block healthy later provider', async()=>{
  resetAIRouterStateForTests();
  const result=await runLanePlan([lane('bad-key',401,'','invalid key'),lane('healthy',200,'ok')]);
  assert.equal(result?.provider,'healthy');
  assert.equal(result?.attempts[0].reason,'invalid_credentials');
});

test('provider outage rotates through multiple failures before success', async()=>{
  resetAIRouterStateForTests();
  const result=await runLanePlan([lane('down',503,'','offline'),lane('missing-model',404,'','missing'),lane('last',200,'recovered')]);
  assert.equal(result?.provider,'last');
  assert.equal(result?.attempts.length,3);
});

test('all providers unavailable returns null instead of throwing', async()=>{
  resetAIRouterStateForTests();
  const result=await runLanePlan([lane('a',429,'','quota'),lane('b',503,'','down'),lane('c',401,'','bad key')]);
  assert.equal(result,null);
});

test('failed lane remains on cooldown on next request', async()=>{
  resetAIRouterStateForTests();
  await runLanePlan([lane('quota',429,'','quota'),lane('ok',200,'answer')]);
  let called=0;
  const quota:AILane={id:'quota',provider:'quota',model:'quota',run:async()=>{called++;return {status:200,text:'should not run'}}};
  const result=await runLanePlan([quota,lane('ok2',200,'second')]);
  assert.equal(called,0);
  assert.equal(result?.provider,'ok2');
  assert.equal(result?.attempts[0].reason,'cooldown');
});

test('thrown provider exception cannot abort later failover lanes',async()=>{
  resetAIRouterStateForTests();
  const exploding:AILane={id:'explode',provider:'Exploding Provider',model:'x',run:async()=>{throw new Error('socket exploded')}};
  const result=await runLanePlan([exploding,lane('healthy-after-throw',200,'recovered')]);
  assert.equal(result?.provider,'healthy-after-throw');
  assert.equal(result?.attempts[0].reason,'provider_error');
});

test('quota failure cools sibling models from the same provider instead of wasting calls',async()=>{
  resetAIRouterStateForTests();let siblingCalls=0;
  const first:AILane={id:'same:a',provider:'Same Provider',model:'a',run:async()=>({status:429,text:'',detail:'quota'})};
  const sibling:AILane={id:'same:b',provider:'Same Provider',model:'b',run:async()=>{siblingCalls++;return {status:200,text:'should be skipped'}}};
  const healthy:AILane={id:'other:c',provider:'Other Provider',model:'c',run:async()=>({status:200,text:'ok'})};
  const result=await runLanePlan([first,sibling,healthy]);
  assert.equal(siblingCalls,0);
  assert.equal(result?.provider,'Other Provider');
  assert.equal(result?.attempts[1].reason,'cooldown');
});

test('empty 200 response rotates instead of being accepted as success',async()=>{
  resetAIRouterStateForTests();
  const result=await runLanePlan([lane('empty',200,''),lane('answer',200,'real answer')]);
  assert.equal(result?.provider,'answer');
  assert.equal(result?.attempts[0].reason,'empty_response');
});
