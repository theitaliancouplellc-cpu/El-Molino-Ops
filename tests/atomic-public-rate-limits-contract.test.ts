import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/atomic_public_rate_limits_v1.sql','utf8');

function body(name:string){
  const marker=`create or replace function public.${name}`;
  const start=sql.toLowerCase().indexOf(marker.toLowerCase());
  assert.ok(start>=0,`${name} must exist`);
  const next=sql.toLowerCase().indexOf('create or replace function public.',start+marker.length);
  return sql.slice(start,next<0?sql.length:next);
}

test('account deletion uses atomic global and per-IP counters',()=>{
  const fn=body('request_account_deletion_external');
  assert.match(fn,/consume_rate_limit\('public_account_deletion_global','global',100,600\)/i);
  assert.match(fn,/consume_rate_limit\('public_account_deletion_ip',ip_subject,5,3600\)/i);
  assert.doesNotMatch(fn,/count\(\*\)[\s\S]*public_account_deletion_rate_limits/i);
  assert.doesNotMatch(fn,/insert into private\.public_account_deletion_rate_limits/i);
});

test('job application uses atomic global and per-IP counters',()=>{
  const fn=body('submit_job_application');
  assert.match(fn,/consume_rate_limit\('public_job_application_global','global',100,600\)/i);
  assert.match(fn,/consume_rate_limit\('public_job_application_ip',ip_subject,8,900\)/i);
  assert.doesNotMatch(fn,/count\(\*\)[\s\S]*public_job_application_rate_limits/i);
  assert.doesNotMatch(fn,/insert into private\.public_job_application_rate_limits/i);
});

test('shared counter subjects do not store raw client IPs',()=>{
  for(const name of ['request_account_deletion_external','submit_job_application']){
    const fn=body(name);
    assert.match(fn,/ip_subject := encode\(extensions\.digest\(client_ip::text,'sha256'\),'hex'\)/i);
    assert.doesNotMatch(fn,/consume_rate_limit\([^;]*client_ip::text/i);
  }
});

test('honeypot behavior remains before rate-limit consumption',()=>{
  for(const name of ['request_account_deletion_external','submit_job_application']){
    const fn=body(name);
    const honeypot=fn.indexOf('p_company_website');
    const success=fn.indexOf("return jsonb_build_object('ok',true)",honeypot);
    const rateLimit=fn.indexOf('consume_rate_limit');
    assert.ok(honeypot>=0&&success>honeypot&&rateLimit>success,`${name} honeypot must short-circuit first`);
  }
});

test('anonymous public forms remain callable but counter primitive remains client-inaccessible',()=>{
  assert.match(sql,/grant execute on function public\.request_account_deletion_external\(text,text,text\) to anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.submit_job_application\(uuid,text,text,text,jsonb,text,text,boolean,boolean,text\) to anon, authenticated/i);
  assert.match(sql,/revoke all on function public\.consume_rate_limit\(text,text,integer,integer\) from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.consume_rate_limit\(text,text,integer,integer\) to service_role/i);
});
