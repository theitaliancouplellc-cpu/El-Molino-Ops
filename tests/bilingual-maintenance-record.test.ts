import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=(p:string)=>fs.readFileSync(path.join(root,p),'utf8');

test('maintenance localization preserves operational write contracts',()=>{
  const src=read('app/maintenance/page.tsx');
  assert.match(src,/useI18n/);
  assert.match(src,/kind:'maintenance_ticket'/);
  assert.match(src,/status:'open'/);
  assert.match(src,/priority:ticket\.priority/);
  assert.match(src,/sensitivity:'team'/);
  assert.match(src,/tags:\['maintenance','repair'\]/);
  assert.match(src,/kind:'equipment'/);
  assert.match(src,/sensitivity:'manager'/);
  assert.match(src,/kind:'equipment_service'/);
  assert.match(src,/status:'completed'/);
  assert.match(src,/cost:Math\.max\(0,Number\(service\.cost\)\|\|0\)/);
  assert.match(src,/equipment_id:service\.equipment_id/);
});

test('ops record localization preserves record, favorite, recent-view and attachment identity',()=>{
  const src=read('app/ops-record/[id]/page.tsx');
  assert.match(src,/useI18n/);
  assert.match(src,/entity_type','ops_record/);
  assert.match(src,/entity_id:id/);
  assert.match(src,/title:record\.title/);
  assert.match(src,/href:`\/ops-record\/\$\{id\}`/);
  assert.match(src,/file\.storage_bucket/);
  assert.match(src,/file\.storage_path/);
  assert.match(src,/row\.title/);
  assert.match(src,/String\(v\)/);
});
