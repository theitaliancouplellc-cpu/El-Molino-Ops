import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=fs.readFileSync('app/safety/page.tsx','utf8');

test('food safety workspace is bilingual and locale-aware',()=>{
  assert.match(source,/useI18n/);
  for(const marker of ['Seguridad Alimentaria','Configuración de puntos de temperatura','Control de temperatura','Listas de hoy','Crear plantilla de lista','Registros recientes de temperatura'])assert.ok(source.includes(marker),`missing Spanish marker: ${marker}`);
  assert.match(source,/toLocaleString\(localeCode\)/);
  assert.match(source,/periodLabel/);
});

test('safety localization preserves configured ranges, evidence, and atomic checklist contracts',()=>{
  for(const rpc of ['create_checklist_template_with_items','start_today_checklist','set_checklist_item_completed'])assert.ok(source.includes(`'${rpc}'`),`missing RPC: ${rpc}`);
  for(const table of ['food_safety_temperature_points','ops_records'])assert.ok(source.includes(`'${table}'`),`missing table: ${table}`);
  for(const value of ['temperature_f:temp','min_f:min','max_f:max','in_range:inRange','corrective_action:tempForm.corrective_action.trim()',"tags:['food-safety','temperature']"])assert.ok(source.includes(value),`missing safety evidence: ${value}`);
  assert.match(source,/template\.title/);
  assert.match(source,/itemLabel\(i\.template_item_id\)/);
});
