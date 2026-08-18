import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const localizedHelpers=[
  'app/ai-runtime-test/runtime-test-client.tsx',
  'app/employee/connection-state.tsx',
  'app/error.tsx',
  'app/ops/record-extras.tsx',
  'app/schedule/pool/layout.tsx',
  'app/schedule/requests/layout.tsx',
  'app/team/layout.tsx',
  'app/training/courses/layout.tsx',
];

test('remaining client helpers consume the shared app locale',()=>{
  for(const path of localizedHelpers){
    const source=fs.readFileSync(path,'utf8');
    assert.match(source,/useI18n/,`${path} must consume the shared locale`);
    assert.match(source,/locale\s*===\s*['"]es['"]/,`${path} must render Spanish copy`);
  }
});

test('the root recovery boundary restores the persisted locale without hydration drift',()=>{
  const source=fs.readFileSync('app/global-error.tsx','utf8');
  assert.match(source,/LOCALE_STORAGE_KEY/);
  assert.match(source,/useState<'en'\|'es'>\('en'\)/);
  assert.match(source,/useEffect\(\(\)=>setLocale/);
  assert.match(source,/El Molino Ops necesita volver a cargar/);
});

test('localized helper changes preserve operational identifiers and routes',()=>{
  const extras=fs.readFileSync('app/ops/record-extras.tsx','utf8');
  assert.match(extras,/entity_type','ops_record'/);
  assert.match(extras,/entityType=ops_record&entityId=/);
  assert.match(extras,/file\.storage_bucket/);

  const redirects=[
    ['app/team/layout.tsx','/employee/team'],
    ['app/training/courses/layout.tsx','/employee/training'],
    ['app/schedule/pool/layout.tsx','/employee/shift-pool'],
    ['app/schedule/requests/layout.tsx','/employee/requests'],
  ] as const;
  for(const [path,route] of redirects){
    assert.ok(fs.readFileSync(path,'utf8').includes(route),`${path} must preserve ${route}`);
  }
});
