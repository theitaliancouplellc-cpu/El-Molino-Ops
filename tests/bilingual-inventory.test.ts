import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=fs.readFileSync('app/inventory/page.tsx','utf8');

test('inventory and food cost workspace is bilingual and locale-aware',()=>{
  assert.match(source,/useI18n/);
  for(const marker of ['Inventario y Costo de Alimentos','Conteo rápido','Desperdicio','Existencias bajas','Configuración de artículos','Costo de alimentos por receta','Órdenes de compra'])assert.ok(source.includes(marker),`missing Spanish marker: ${marker}`);
  assert.match(source,/money\(inventoryValue,localeCode\)/);
  assert.match(source,/categoryLabel/);
  assert.match(source,/statusLabel/);
});

test('inventory localization preserves financial and transactional contracts',()=>{
  for(const table of ['restaurant_vendors','inventory_items','inventory_counts','inventory_count_lines','waste_entries','purchase_orders','recipe_cost_components'])assert.ok(source.includes(`'${table}'`),`missing table: ${table}`);
  for(const rpc of ['finalize_inventory_count','create_suggested_purchase_orders'])assert.ok(source.includes(`'${rpc}'`),`missing RPC: ${rpc}`);
  for(const value of ["status:'draft'","onConflict:'location_id,counted_on'","onConflict:'count_id,item_id'",'quantity:Math.max(.001','reason:wasteForm.reason.trim()','unit_cost_snapshot'])assert.ok(source.includes(value),`missing inventory contract: ${value}`);
  assert.match(source,/wasteForm\.reason/);
  assert.match(source,/mi\.name/);
});
