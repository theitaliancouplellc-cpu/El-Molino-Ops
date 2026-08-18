import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('app/page.tsx','utf8');

test('root shell is bilingual across authentication and every primary workspace',()=>{
  assert.match(source,/useI18n/);
  assert.match(source,/LanguageToggle/);
  for(const marker of [
    'Crear cuenta invitada','Buenos días','Tareas abiertas','Creador de procedimientos',
    'Plantilla','Preguntar a El Molino','Estudio de Conocimiento','Archivos y Multimedia',
    'Centro de Administración','Buscar en todo','Cerrar notificaciones','Comenzar a usar la aplicación',
  ])assert.ok(source.includes(marker),`missing Spanish root marker: ${marker}`);
});

test('root locale covers dynamic system presentation',()=>{
  assert.match(source,/formatDue\(t\.due_at,locale\)/);
  assert.match(source,/timeAgo\(a\.created_at,locale\)/);
  assert.match(source,/formatBytes\(f\.size_bytes,locale\)/);
  assert.match(source,/rootToken\(t\.status,locale\)/);
  assert.match(source,/toLocaleDateString\(locale==='es'\?'es-US':'en-US'\)/);
});

test('root localization preserves authored content and authoritative contracts',()=>{
  for(const raw of [
    't.title','x.title','x.description','e.full_name','k.title','n.title','n.body',
    'm.content','r.subtitle','a.summary||a.action','r.summary||r.action',
  ])assert.ok(source.includes(raw),`authored field must remain raw: ${raw}`);
  for(const contract of [
    "category:'operational_knowledge'","status:'draft'","status:done?'done':'open'",
    "supabase.rpc('global_search'","storage_bucket:'el-molino-files'",
    "safeInternalHref(n.href,'/')","logActivity('created','station'","entity_type:entityType",
  ])assert.ok(source.includes(contract),`authoritative contract changed: ${contract}`);
  assert.ok(!source.includes('translate('));
});

test('root shell has no remaining literal English UI props',()=>{
  assert.doesNotMatch(source,/(?:title|subtitle|body|label|placeholder|aria-label)="[A-Za-z][^"]*"/);
});
