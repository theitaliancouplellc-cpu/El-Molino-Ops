import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/schedule_review_lock_order_v1.sql','utf8');

function body(name:string){
  const marker=`create or replace function public.${name}`;
  const start=sql.toLowerCase().indexOf(marker.toLowerCase());
  assert.ok(start>=0,`${name} must exist`);
  const next=sql.toLowerCase().indexOf('create or replace function public.',start+marker.length);
  return sql.slice(start,next<0?sql.length:next);
}

test('shift claim review locks the parent shift before the selected claim',()=>{
  const fn=body('review_shift_claim');
  const shiftLock=fn.indexOf('from public.schedule_shifts');
  const shiftForUpdate=fn.indexOf('for update;',shiftLock);
  const claimLock=fn.indexOf('from public.shift_claims',shiftForUpdate);
  const claimForUpdate=fn.indexOf('for update;',claimLock);
  assert.ok(shiftLock>=0&&shiftForUpdate>shiftLock,'shift must be locked');
  assert.ok(claimLock>shiftForUpdate&&claimForUpdate>claimLock,'claim must be locked only after shift');
  assert.match(fn,/where shift_id=s\.id and status='pending' and id<>c\.id/i);
});

test('shift pool bid review uses shift then offer then bid lock order',()=>{
  const fn=body('review_shift_pool_bid');
  const shiftLock=fn.indexOf('from public.schedule_shifts');
  const shiftForUpdate=fn.indexOf('for update;',shiftLock);
  const offerLock=fn.indexOf('from public.shift_pool_offers',shiftForUpdate);
  const offerForUpdate=fn.indexOf('for update;',offerLock);
  const bidLock=fn.indexOf('from public.shift_pool_bids',offerForUpdate);
  const bidForUpdate=fn.indexOf('for update;',bidLock);
  assert.ok(shiftForUpdate>shiftLock,'shift must be locked');
  assert.ok(offerLock>shiftForUpdate&&offerForUpdate>offerLock,'offer must follow shift');
  assert.ok(bidLock>offerForUpdate&&bidForUpdate>bidLock,'bid must follow offer');
  assert.match(fn,/shift pool parent changed during review/i);
  assert.match(fn,/el_molino\.shift_pool_assignment_rpc/i);
});

test('reciprocal shift review locks all involved shifts in deterministic UUID order',()=>{
  const fn=body('review_shift_change_request');
  assert.match(fn,/where s\.location_id=loc[\s\S]*s\.id=r\.shift_id[\s\S]*r\.target_shift_id/i);
  assert.match(fn,/order by s\.id\s+for update/i);
  assert.match(fn,/get diagnostics v_locked = row_count/i);
  assert.match(fn,/v_locked < case when r\.request_type='swap' then 2 else 1 end/i);
});

test('review authorization and eligibility revalidation remain fail closed',()=>{
  for(const name of ['review_shift_claim','review_shift_change_request','review_shift_pool_bid']){
    const fn=body(name);
    assert.match(fn,/auth\.uid\(\) is null/i,`${name} auth check`);
    assert.match(fn,/current_app_role\(\) not in\s*\('admin','manager'\)/i,`${name} manager check`);
    assert.match(fn,/p_decision not in\s*\('approved','denied'\)/i,`${name} decision check`);
  }
  assert.match(body('review_shift_claim'),/open_shift_candidate_warnings/i);
  assert.match(body('review_shift_change_request'),/employee_trade_candidate_warnings/i);
  assert.match(body('review_shift_pool_bid'),/shift_pool_candidate_warnings/i);
});

test('parent discovery queries remain nonlocking so all competing reviewers converge on the same parent lock',()=>{
  const claim=body('review_shift_claim');
  assert.match(claim,/select shift_id into v_shift_id[\s\S]*status='pending';[\s\S]*from public\.schedule_shifts/i);
  const pool=body('review_shift_pool_bid');
  assert.match(pool,/select offer_id into v_offer_id[\s\S]*status='pending';[\s\S]*select shift_id into v_shift_id[\s\S]*status='open';[\s\S]*from public\.schedule_shifts/i);
});
