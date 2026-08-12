import test from 'node:test';
import assert from 'node:assert/strict';
import { OPS_MODULES, OPS_MODULE_BY_KIND, normalizeOpsData, validateOpsRecord } from '../lib/ops-modules.ts';

test('all operations modules have unique kinds and labels',()=>{
  assert.equal(new Set(OPS_MODULES.map(x=>x.kind)).size,OPS_MODULES.length);
  assert.equal(new Set(OPS_MODULES.map(x=>x.title)).size,OPS_MODULES.length);
  assert.ok(OPS_MODULES.length>=30);
});

test('registry resolves every configured module',()=>{
  for(const mod of OPS_MODULES) assert.equal(OPS_MODULE_BY_KIND[mod.kind].title,mod.title);
});

test('every module rejects empty title',()=>{
  for(const mod of OPS_MODULES) assert.ok(validateOpsRecord(mod.kind,'',{}).some(x=>x.includes('Title')));
});

test('required dynamic fields are enforced',()=>{
  for(const mod of OPS_MODULES){
    const required=mod.fields.filter(f=>f.required);
    if(!required.length) continue;
    const errors=validateOpsRecord(mod.kind,'Valid title',{});
    for(const field of required) assert.ok(errors.some(x=>x.startsWith(field.label)),`${mod.kind}.${field.key} was not enforced`);
  }
});

test('numeric bounds are enforced',()=>{
  assert.ok(validateOpsRecord('temperature_log','Temp',{item:'Walk in',temperature:999}).some(x=>x.includes('at most')));
  assert.ok(validateOpsRecord('waste_log','Waste',{item:'Chicken',quantity:-1}).some(x=>x.includes('at least')));
  assert.ok(validateOpsRecord('training_progress','Training',{employee:'A',module:'B',state:'Complete',score:101}).some(x=>x.includes('at most')));
});

test('normalization trims strings and converts numbers and booleans',()=>{
  const x=normalizeOpsData('daily_recap',{sales:'123.45',labor_pct:'21.5',wins:'  good shift  '});
  assert.equal(x.sales,123.45);assert.equal(x.labor_pct,21.5);assert.equal(x.wins,'good shift');
  const y=normalizeOpsData('announcement',{body:' hello ',pinned:1});assert.equal(y.pinned,true);assert.equal(y.body,'hello');
});

test('valid representative records pass validation',()=>{
  const cases:[any,string,Record<string,unknown>][]=[
    ['incident','Guest incident',{incident_type:'Guest',occurred_at_text:'2026-08-12T12:00',details:'Slip reported'}],
    ['temperature_log','Walk in temp',{item:'Walk in',temperature:38}],
    ['recipe','Chicken prep',{ingredients:'Chicken 10 lb',steps:'Trim and portion'}],
    ['certification','Food safety',{employee:'Alex',certification:'ServSafe'}],
    ['maintenance_ticket','Door gasket',{problem:'Gasket separating'}],
  ];
  for(const [kind,title,data] of cases) assert.deepEqual(validateOpsRecord(kind,title,data),[]);
});
