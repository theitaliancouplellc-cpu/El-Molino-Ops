import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/public_job_application_rate_limit_v1.sql','utf8');

test('anonymous job applications are bounded without exposing the rate table',()=>{
  assert.match(sql,/private\.public_job_application_rate_limits/);
  assert.match(sql,/revoke all on table private\.public_job_application_rate_limits/);
  assert.match(sql,/requested_at >= now\(\)-interval '10 minutes'/);
  assert.match(sql,/global_recent >= 100/);
  assert.match(sql,/requested_at >= now\(\)-interval '15 minutes'/);
  assert.match(sql,/ip_recent >= 8/);
  assert.match(sql,/cf-connecting-ip/);
  assert.match(sql,/x-forwarded-for/);
  assert.match(sql,/p_company_website/);
  assert.match(sql,/grant execute on function public\.submit_job_application[\s\S]*to anon/);
  assert.match(sql,/revoke all on function public\.submit_job_application[\s\S]*from public, authenticated/);
});
