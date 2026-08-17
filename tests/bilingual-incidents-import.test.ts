import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=(p:string)=>fs.readFileSync(path.join(root,p),'utf8');

test('incident localization preserves private authoritative case tokens',()=>{
  const src=read('app/incidents/page.tsx');
  assert.match(src,/useI18n/);
  assert.match(src,/locale==='es'/);
  assert.match(src,/kind:'incident'/);
  assert.match(src,/status:'open'/);
  assert.match(src,/priority:form\.priority/);
  assert.match(src,/sensitivity:'private'/);
  assert.match(src,/tags:\['incident',form\.type\]/);
  assert.match(src,/incident_type:form\.type/);
  assert.match(src,/`\$\{form\.type\} · \$\{occurred\.toISOString\(\)\.slice\(0,10\)\}`/);
  assert.doesNotMatch(src,/form\.type\.replaceAll\('_',' '\).*title/);
});

test('CSV import localization preserves raw import types and staging semantics',()=>{
  const src=read('app/import/page.tsx');
  assert.match(src,/useI18n/);
  assert.match(src,/locale==='es'/);
  for(const token of ['generic','employees','menu','inventory','toast','vendors']) assert.match(src,new RegExp(`value="${token}"`));
  assert.match(src,/import_type:type/);
  assert.match(src,/status:'staged'/);
  assert.match(src,/status:'failed',error_count:1/);
  assert.match(src,/validation_errors:\[\]/);
  assert.match(src,/validCsvShape\(parsed\.headers,parsed\.rows\)/);
  assert.match(src,/import_jobs/);
  assert.match(src,/import_rows/);
});
