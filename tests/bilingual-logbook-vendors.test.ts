import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=(p:string)=>fs.readFileSync(path.join(root,p),'utf8');

test('manager logbook localization is presentation-only',()=>{
  const src=read('app/logbook/page.tsx');
  assert.match(src,/useI18n/);
  assert.match(src,/locale==='es'/);
  assert.match(src,/kind:'manager_log'/);
  assert.match(src,/status:'active'/);
  assert.match(src,/priority:form\.priority/);
  assert.match(src,/tags:\['manager-log',form\.shift\.toLowerCase\(\)\]/);
  assert.match(src,/`\$\{form\.shift\} shift log — \$\{today\(\)\}`/);
  assert.doesNotMatch(src,/toLocaleDateString\(localeCode\).*title/);
});

test('vendor localization preserves authoritative vendor data and note tokens',()=>{
  const src=read('app/vendors/page.tsx');
  assert.match(src,/useI18n/);
  assert.match(src,/locale==='es'/);
  assert.match(src,/onConflict:'location_id,name'/);
  assert.match(src,/kind:'vendor'/);
  assert.match(src,/status:'active'/);
  assert.match(src,/priority:'normal'/);
  assert.match(src,/tags:\['vendor','service-note'\]/);
  assert.match(src,/vendor_name:vendor\?\.name\|\|''/);
});
