import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('docs/database/pilot_operation_attempts_v1.sql','utf8');
const edge=fs.readFileSync('supabase/functions/pilot-mutation-gateway/index.ts','utf8');
const client=fs.readFileSync('lib/supabase.ts','utf8');

test('attempt ledger is private and scorecard excludes policy rejection denominator',()=>{
 assert.match(sql,/create table if not exists public\.pilot_operation_attempts/i);
 assert.match(sql,/revoke all on public\.pilot_operation_attempts from public,anon,authenticated/i);
 assert.match(sql,/outcome in\('success','failure'\)/i);
 assert.match(sql,/policy_rejections/i);
 assert.match(sql,/successful_expected_mutations_without_commit_evidence/i);
});

test('committed mutation evidence is linked by request operation id',()=>{
 assert.match(sql,/x-pilot-operation-id/i);
 assert.match(sql,/current_setting\('request\.headers',true\)/i);
 assert.match(sql,/operation_id uuid/i);
 assert.match(sql,/employee_availability/i);
 assert.match(sql,/employee_availability_overrides/i);
});

test('gateway authenticates users, whitelists RPCs, and persists only bounded outcome fields',()=>{
 assert.match(edge,/withSupabase\(\{auth:'user'\}/i);
 assert.match(edge,/ctx\.supabase\.auth\.getUser\(\)/i);
 assert.match(edge,/OPERATION_NOT_ALLOWED/i);
 assert.match(edge,/ARGUMENT_NOT_ALLOWED/i);
 assert.match(edge,/x-pilot-operation-id/i);
 const insert=edge.match(/ctx\.supabaseAdmin\.from\('pilot_operation_attempts'\)\.insert\(\{([^}]*)\}\)/i)?.[1]||'';
 assert.ok(insert,'missing authoritative attempt insert');
 for(const required of ['operation_id','location_id','actor_user_id','operation','outcome','error_code','upstream_status','expected_mutation','duration_ms']) assert.ok(insert.includes(required),`missing bounded field ${required}`);
 for(const forbidden of ['message','stack','payload','args','reason','note']) assert.ok(!insert.includes(forbidden),`raw field ${forbidden} must not persist`);
});

test('shared Supabase client routes critical writes through gateway but leaves other RPCs direct',()=>{
 assert.match(client,/PILOT_MUTATION_RPCS/i);
 assert.match(client,/pilot-mutation-gateway/i);
 assert.match(client,/if \(!PILOT_MUTATION_RPCS\.has\(fn\)\) return target\.rpc/i);
 for(const rpc of ['clock_in','submit_my_time_off_request','submit_my_shift_change_request','publish_schedule_period_with_notifications','finalize_tip_pool_run']) assert.ok(client.includes(`'${rpc}'`),`missing ${rpc}`);
});
