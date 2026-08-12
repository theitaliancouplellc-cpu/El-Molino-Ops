import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeRetryRequest, retryDecision } from '../lib/retry.ts';

test('retries only transient statuses',()=>{assert.equal(retryDecision(503,0).retry,true);assert.equal(retryDecision(429,0).retry,true);assert.equal(retryDecision(400,0).retry,false);assert.equal(retryDecision(401,0).retry,false)});
test('retry policy is bounded',()=>{assert.equal(retryDecision(503,3).retry,false);assert.ok(retryDecision(503,2).delayMs<=5000)});
test('retry-after is honored within max bound',()=>{assert.equal(retryDecision(429,0,3500).delayMs,3500);assert.equal(retryDecision(429,0,15000).delayMs,5000)});
test('GET and Ask AI are safe to retry but writes are not',()=>{assert.equal(isSafeRetryRequest('GET','/api/health'),true);assert.equal(isSafeRetryRequest('POST','/api/ask'),true);assert.equal(isSafeRetryRequest('POST','/api/ai-action'),false);assert.equal(isSafeRetryRequest('PATCH','/tasks'),false)});
