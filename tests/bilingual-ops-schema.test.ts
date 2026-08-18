import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {OPS_MODULES} from '../lib/ops-modules';
import {opsCategoryText,opsFieldText,opsModuleText,opsOptionText,opsValidationText} from '../lib/ops-i18n';

const page=fs.readFileSync('app/ops/page.tsx','utf8');

test('every Ops module has Spanish title and description',()=>{
  assert.equal(OPS_MODULES.length,31);
  for(const module of OPS_MODULES){
    const translated=opsModuleText(module,'es');
    assert.notEqual(translated.title,module.title,`missing title translation: ${module.kind}`);
    assert.notEqual(translated.description,module.description,`missing description translation: ${module.kind}`);
  }
});

test('Ops schema localization covers categories, fields, options, and validation',()=>{
  for(const category of new Set(OPS_MODULES.map(module=>module.category)))assert.notEqual(opsCategoryText(category,'es'),category,`missing category: ${category}`);
  for(const module of OPS_MODULES)for(const field of module.fields){
    assert.ok(opsFieldText(field,'es').trim(),`blank field label: ${module.kind}.${field.key}`);
    if(field.key!=='par')assert.notEqual(opsFieldText(field,'es'),field.label,`missing field translation: ${module.kind}.${field.key}`);
    for(const option of field.options??[])assert.notEqual(opsOptionText(option,'es'),option,`missing option translation: ${module.kind}.${field.key}.${option}`);
  }
  assert.equal(opsOptionText('Available','es'),'Disponible');
  assert.equal(opsValidationText('Title is required.','es'),'El título es obligatorio.');
  assert.equal(opsValidationText('Temperature °F must be a number.','es'),'Temperatura °F debe ser un número.');
});

test('Ops page localizes system chrome without rewriting authored records or raw contracts',()=>{
  assert.match(page,/useI18n/);
  for(const helper of ['opsModuleText','opsCategoryText','opsFieldText','opsOptionText','opsStatusText','opsBooleanText','opsValidationText'])assert.ok(page.includes(helper),`missing helper: ${helper}`);
  for(const contract of ["kind,title:draft.title.trim()",'data:clean','created_by:u.user.id',"action:'updated'","action:'created'",'.eq(\'updated_at\',editing.updated_at)'])assert.ok(page.includes(contract),`missing contract: ${contract}`);
  assert.match(page,/<b>\{row\.title\}<\/b>/);
  assert.match(page,/JSON\.stringify\(r\.data\)/);
});
