import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const i18n=fs.readFileSync('lib/i18n.tsx','utf8');
const brand=fs.readFileSync('app/brand.css','utf8');
const layout=fs.readFileSync('app/layout.tsx','utf8');
const design=fs.readFileSync('docs/design/EL_MOLINO_BRAND_SYSTEM.md','utf8');

test('El Molino restaurant palette is wired into the app shell',()=>{
 for(const hex of ['#079db6','#f39a1f','#d83b35','#2e8b57','#fff8e8'])assert.ok(brand.toLowerCase().includes(hex),`missing brand color ${hex}`);
 assert.match(layout,/import '\.\/brand\.css'/);
 assert.match(layout,/themeColor: '#079DB6'/);
 assert.match(design,/restaurant interior reference photos/i);
});

test('English and Spanish are first-class persistent locales',()=>{
 assert.match(i18n,/export type Locale='en'\|'es'/);
 assert.match(i18n,/localStorage\.setItem\(LOCALE_STORAGE_KEY,next\)/);
 assert.match(i18n,/document\.documentElement\.lang=next/);
 assert.match(i18n,/language\.spanish':'Español'/);
 assert.match(i18n,/nav\.schedule':'Horario'/);
 assert.match(i18n,/nav\.timeClock':'Reloj de tiempo'/);
 assert.match(layout,/I18nProvider/);
 assert.match(layout,/LanguageToggle/);
});

test('locale choice changes UI copy only, not operational records',()=>{
 assert.ok(!i18n.includes('supabase'));
 assert.ok(!i18n.includes('.update('));
 assert.ok(!i18n.includes('.insert('));
 assert.match(design,/No operational record, identifier, date, schedule, employee assignment or financial value is mutated/i);
});
