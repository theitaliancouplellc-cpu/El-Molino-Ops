import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/push_delivery_recovery_v1.sql','utf8');

function body(name:string){
  const marker=`create or replace function public.${name}`;
  const start=sql.toLowerCase().indexOf(marker.toLowerCase());
  assert.ok(start>=0,`${name} must exist`);
  const next=sql.toLowerCase().indexOf('create or replace function public.',start+marker.length);
  return sql.slice(start,next<0?sql.length:next);
}

test('web and native claimers recover stale locks below the attempt limit',()=>{
  for(const name of ['claim_web_push_deliveries','claim_native_push_deliveries']){
    const fn=body(name);
    assert.match(fn,/status='retry'[\s\S]*error_class='recovered_stale_lock'/i,`${name} stale retry`);
    assert.match(fn,/status='sending'[\s\S]*locked_at<now\(\)-interval '5 minutes'[\s\S]*attempt_count<5/i,`${name} stale predicate`);
  }
});

test('stale fifth-attempt deliveries become terminal instead of remaining sending forever',()=>{
  for(const name of ['claim_web_push_deliveries','claim_native_push_deliveries']){
    const fn=body(name);
    assert.match(fn,/status='permanent_failure'[\s\S]*error_class='stale_lock_attempt_limit'/i,`${name} terminal status`);
    assert.match(fn,/attempt_count>=5/i,`${name} attempt ceiling`);
  }
});

test('claimers retain skip-locked bounded queue claiming',()=>{
  for(const name of ['claim_web_push_deliveries','claim_native_push_deliveries']){
    const fn=body(name);
    assert.match(fn,/for update of a skip locked/i,`${name} skip locked`);
    assert.match(fn,/attempt_count<5/i,`${name} retry ceiling`);
    assert.match(fn,/limit greatest\(1,least\(coalesce\(p_limit,50\),100\)\)/i,`${name} bounded batch`);
  }
});

test('both delivery channels have independent minute recovery jobs',()=>{
  assert.match(sql,/cron\.schedule\([\s\S]*'web-push-recovery-v2'[\s\S]*'\* \* \* \* \*'/i);
  assert.match(sql,/cron\.schedule\([\s\S]*'native-push-recovery-v1'[\s\S]*'\* \* \* \* \*'/i);
  assert.match(sql,/functions\/v1\/web-push-dispatch/i);
  assert.match(sql,/functions\/v1\/native-push-dispatch/i);
});

test('cron wake predicates include due queued work and stale sending locks',()=>{
  assert.match(sql,/public\.push_delivery_attempts[\s\S]*status in \('pending','retry'\)[\s\S]*next_attempt_at<=now\(\)[\s\S]*status='sending'[\s\S]*locked_at<now\(\)-interval '5 minutes'/i);
  assert.match(sql,/public\.native_push_delivery_attempts[\s\S]*status in \('pending','retry'\)[\s\S]*next_attempt_at<=now\(\)[\s\S]*status='sending'[\s\S]*locked_at<now\(\)-interval '5 minutes'/i);
});

test('claim RPCs remain service-role only',()=>{
  for(const name of ['claim_web_push_deliveries','claim_native_push_deliveries']){
    assert.match(sql,new RegExp(`revoke all on function public\\.${name}\\(uuid,integer\\)\\s+from public,anon,authenticated`,'i'));
    assert.match(sql,new RegExp(`grant execute on function public\\.${name}\\(uuid,integer\\)\\s+to service_role`,'i'));
  }
});

test('legacy web retry job is removed before replacement',()=>{
  assert.match(sql,/jobname='web-push-retry-v1'/i);
  assert.match(sql,/cron\.unschedule\('web-push-retry-v1'\)/i);
});
