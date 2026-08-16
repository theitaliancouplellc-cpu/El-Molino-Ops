import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ledger=JSON.parse(readFileSync('docs/employee-app-parity-ledger.json','utf8')) as {
  version:number;
  status_order:string[];
  release_rule:string;
  capabilities:Array<{id:string;priority:string;phase:number;status:string;owner:string;evidence:string[];next:string[]}>;
};

const allowedStatuses=new Set(['MISSING','STRUCTURE_EXISTS','FUNCTIONAL','HARDENED','POLISHED','PARITY','EXCEEDS_PARITY']);
const allowedPriorities=new Set(['P0','P1','P2']);

test('employee parity ledger is machine readable and uniquely keyed',()=>{
  assert.equal(ledger.version,1);
  assert.deepEqual(ledger.status_order,[...allowedStatuses]);
  assert.match(ledger.release_rule,/P0 and P1.*PARITY/i);
  assert.ok(ledger.capabilities.length>=25,'ledger must cover the complete employee product, not a token checklist');
  const ids=ledger.capabilities.map(x=>x.id);
  assert.equal(new Set(ids).size,ids.length,'capability ids must be unique');
});

test('every parity capability has release metadata and acceptance work',()=>{
  for(const capability of ledger.capabilities){
    assert.ok(/^[a-z0-9_]+\.[a-z0-9_.]+$/.test(capability.id),`invalid capability id ${capability.id}`);
    assert.ok(allowedPriorities.has(capability.priority),`${capability.id} has invalid priority`);
    assert.ok(Number.isInteger(capability.phase)&&capability.phase>=0&&capability.phase<=8,`${capability.id} has invalid phase`);
    assert.ok(allowedStatuses.has(capability.status),`${capability.id} has invalid status`);
    assert.ok(capability.owner.trim().length>0,`${capability.id} needs an owner`);
    assert.ok(Array.isArray(capability.evidence),`${capability.id} evidence must be an array`);
    assert.ok(Array.isArray(capability.next)&&capability.next.length>0,`${capability.id} must state its next acceptance work`);
    if(!['MISSING','STRUCTURE_EXISTS'].includes(capability.status))assert.ok(capability.evidence.length>0,`${capability.id} cannot claim ${capability.status} without evidence`);
  }
});

test('P0 trust boundaries are represented in the ledger',()=>{
  for(const id of [
    'identity.self_setup',
    'surface.employee_only_navigation',
    'schedule.personal_week',
    'schedule.publication_revisions',
    'notifications.event_identity',
    'notifications.center',
    'privacy.employee_data_minimization',
    'time_clock.employee_surface',
    'tips.employee_surface',
    'backup.parity_critical_data',
    'ci.employee_parity_contract'
  ]){
    const item=ledger.capabilities.find(x=>x.id===id);
    assert.ok(item,`missing P0 capability ${id}`);
    assert.equal(item?.priority,'P0',`${id} must remain P0`);
  }
});
