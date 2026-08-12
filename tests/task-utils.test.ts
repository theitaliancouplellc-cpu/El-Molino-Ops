import test from 'node:test';
import assert from 'node:assert/strict';
import { dependencyWouldBeSelf, normalizeRecurrence, recurrenceFrequency, taskIsBlocked } from '../lib/task-utils.ts';

test('recurrence parser accepts supported frequencies',()=>{
  assert.equal(recurrenceFrequency('FREQ=DAILY'),'DAILY');
  assert.equal(recurrenceFrequency('freq=weekly'),'WEEKLY');
  assert.equal(recurrenceFrequency('FREQ=MONTHLY'),'MONTHLY');
  assert.equal(recurrenceFrequency('FREQ=HOURLY'),null);
});

test('recurrence normalization rejects unsupported rules',()=>{
  assert.equal(normalizeRecurrence('freq=daily'),'FREQ=DAILY');
  assert.throws(()=>normalizeRecurrence('FREQ=YEARLY'));
});

test('dependency blocking uses prerequisite completion state',()=>{
  const deps=[{task_id:'b',depends_on_task_id:'a'}];
  assert.equal(taskIsBlocked('b',deps,{a:'open',b:'open'}),true);
  assert.equal(taskIsBlocked('b',deps,{a:'done',b:'open'}),false);
});

test('self dependency is rejected',()=>assert.equal(dependencyWouldBeSelf('a','a'),true));
