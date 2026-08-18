import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const schedule=readFileSync('app/schedule/page.tsx','utf8');
const pool=readFileSync('app/schedule/pool/page.tsx','utf8');

test('published employee shifts can be offered up without abandoning responsibility',()=>{
  assert.match(schedule,/offer_my_shift_to_pool/);
  assert.match(schedule,/You remain responsible for it until another employee is approved/);
  assert.match(schedule,/t\('Offer Up','Ofrecer Turno'\)/);
  assert.match(schedule,/href=\"\/schedule\/pool\"/);
});

test('Shift Pool exposes grabs requests mine and trades',()=>{
  assert.match(pool,/Up for Grabs/);
  assert.match(pool,/Requests/);
  assert.match(pool,/Mine/);
  assert.match(pool,/Trades/);
  assert.match(pool,/bid_on_shift_pool_offer/);
  assert.match(pool,/review_shift_pool_bid/);
  assert.match(pool,/shift_pool_candidate_warnings/);
});
