import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const s=fs.readFileSync('docs/database/pilot_authoritative_event_ledger_v1.sql','utf8');

test('committed mutation ledger is private and trigger-only',()=>{
  assert.match(s,/create table if not exists public\.pilot_committed_mutations/i);
  assert.match(s,/enable row level security/i);
  assert.match(s,/revoke all on public\.pilot_committed_mutations from public,anon,authenticated/i);
  assert.doesNotMatch(s,/grant execute on function public\.record_pilot_operation_event/i);
  assert.match(s,/capture_pilot_committed_mutation/i);
});

test('critical committed mutation surfaces are covered',()=>{
  for(const t of ['availability_change_requests','time_off_requests','shift_change_requests','shift_claims','schedule_shifts','schedule_department_publications','time_clock_punches','time_clock_breaks','time_clock_pay_periods','tip_pool_runs','tip_distributions']) assert.ok(s.includes(`'${t}'`),`missing ${t}`);
  assert.match(s,/after insert or update or delete/i);
});

test('ledger does not fake an attempted-operation success rate',()=>{
  assert.doesNotMatch(s,/critical_mutation_success_rate/i);
  assert.match(s,/attempted-operation outcomes require/i);
  assert.match(s,/pilot_committed_mutation_snapshot/i);
});

test('delete trigger path returns OLD and non-delete returns NEW',()=>{
  assert.match(s,/if tg_op='DELETE' then return old; else return new; end if/i);
});
