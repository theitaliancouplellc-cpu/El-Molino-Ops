import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/schedule_review_lock_order_v1.sql','utf8');

function body(name:string){
  const marker=`create function public.${name}`;
  const start=sql.toLowerCase().indexOf(marker.toLowerCase());
  assert.ok(start>=0,`${name} wrapper must exist`);
  const next=sql.toLowerCase().indexOf('alter function public.',start+marker.length);
  return sql.slice(start,next<0?sql.length:next);
}

test('existing review implementations are hidden rather than duplicated',()=>{
  for(const name of ['review_shift_claim','review_shift_pool_bid','review_shift_change_request']){
    assert.match(sql,new RegExp(`alter function public\\.${name}\\(uuid,text\\)\\s+rename to ${name}_unlocked_v1`,'i'));
    assert.match(sql,new RegExp(`revoke all on function public\\.${name}_unlocked_v1\\(uuid,text\\)[\\s\\S]*from public, anon, authenticated`,'i'));
  }
});

test('shift claim wrapper locks the parent shift before delegating',()=>{
  const fn=body('review_shift_claim');
  const discovery=fn.indexOf('from public.shift_claims');
  const shift=fn.indexOf('from public.schedule_shifts');
  const shiftLock=fn.indexOf('for update;',shift);
  const delegated=fn.indexOf('review_shift_claim_unlocked_v1');
  assert.ok(discovery>=0&&shift>discovery&&shiftLock>shift,'parent must be discovered then locked');
  assert.ok(delegated>shiftLock,'delegate must run after parent lock');
});

test('shift pool wrapper uses canonical shift then offer lock order',()=>{
  const fn=body('review_shift_pool_bid');
  const shift=fn.indexOf('from public.schedule_shifts');
  const shiftLock=fn.indexOf('for update;',shift);
  const offer=fn.indexOf('from public.shift_pool_offers',shiftLock);
  const offerLock=fn.indexOf('for update;',offer);
  const delegated=fn.indexOf('review_shift_pool_bid_unlocked_v1');
  assert.ok(shift>=0&&shiftLock>shift,'shift lock missing');
  assert.ok(offer>shiftLock&&offerLock>offer,'offer must lock after shift');
  assert.ok(delegated>offerLock,'delegate must run after parent locks');
});

test('manager shift-change reviews serialize per location without reversing employee row-lock order',()=>{
  const fn=body('review_shift_change_request');
  assert.match(fn,/pg_advisory_xact_lock/i);
  assert.match(fn,/hashtextextended\('el-molino:shift-change-review:'\|\|loc::text,0\)/i);
  assert.match(fn,/return public\.review_shift_change_request_unlocked_v1\(p_request_id,p_decision\)/i);
  assert.doesNotMatch(fn,/for update/i,'wrapper must not pre-lock shifts ahead of the existing request lock');
});

test('all public wrappers keep manager-only decisions and private internal RPCs',()=>{
  for(const name of ['review_shift_claim','review_shift_pool_bid','review_shift_change_request']){
    const fn=body(name);
    assert.match(fn,/auth\.uid\(\) is null/i,`${name} auth check`);
    assert.match(fn,/current_app_role\(\) not in \('admin','manager'\)/i,`${name} role check`);
    assert.match(fn,/p_decision not in \('approved','denied'\)/i,`${name} decision check`);
    assert.match(sql,new RegExp(`revoke all on function public\\.${name}\\(uuid,text\\) from public, anon`,'i'));
    assert.match(sql,new RegExp(`grant execute on function public\\.${name}\\(uuid,text\\) to authenticated`,'i'));
  }
});
