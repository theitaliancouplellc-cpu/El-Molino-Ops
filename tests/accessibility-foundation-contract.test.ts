import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const layout=fs.readFileSync('app/layout.tsx','utf8');
const css=fs.readFileSync('app/accessibility.css','utf8');
const bridge=fs.readFileSync('app/root-accessibility.tsx','utf8');
const staffCss=fs.readFileSync('app/employee/mobile-polish.css','utf8');
const staffNav=fs.readFileSync('app/employee/staff-bottom-nav.tsx','utf8');
const browser=fs.readFileSync('e2e/production-smoke.spec.ts','utf8');

test('global shell exposes a keyboard skip target and visible focus contract',()=>{
 assert.match(layout,/className="skip-link" href="#app-primary-content"/);
 assert.match(layout,/id="app-primary-content" tabIndex=\{-1\}/);
 assert.match(layout,/import '\.\/accessibility\.css'/);
 assert.match(css,/\.skip-link:focus-visible\{transform:translateY\(0\)\}/);
 assert.match(css,/:where\(a,button,input,textarea,select,\[tabindex\]\):focus-visible/);
 assert.match(css,/outline:3px solid/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});

test('legacy root authentication controls receive deterministic label bindings after hydration',()=>{
 assert.match(layout,/RootAccessibility/);
 assert.match(bridge,/AUTH_CONTROL_IDS/);
 assert.match(bridge,/auth-email/);
 assert.match(bridge,/auth-password/);
 assert.match(bridge,/label\.htmlFor=id/);
 assert.match(bridge,/control\.id=id/);
 assert.match(bridge,/MutationObserver/);
});

test('legacy settings switches receive an accessible name from their visible setting title',()=>{
 assert.match(bridge,/button\[role="switch"\]/);
 assert.match(bridge,/getAttribute\('aria-label'\)/);
 assert.match(bridge,/querySelector\('b'\)/);
 assert.match(bridge,/setAttribute\('aria-label',title\)/);
});

test('Staff keeps one visible shared primary navigation with touch and focus affordances',()=>{
 assert.match(staffCss,/\.employee-shell main>nav\{display:none!important\}/);
 assert.match(staffCss,/\.employee-shell>nav\{display:grid\}/);
 assert.match(staffCss,/min-height:44px/);
 assert.match(staffCss,/focus-visible/);
 assert.match(staffNav,/data-staff-primary-nav/);
 assert.match(staffNav,/aria-current=\{active===key\?'page':undefined\}/);
});

test('browser acceptance proves keyboard entry, visible focus, and auth label lookup',()=>{
 assert.match(browser,/keyboard entry, focus visibility, and sign-in labels are programmatically accessible/);
 assert.match(browser,/getByLabel\(\/Email\|Correo electrónico\//);
 assert.match(browser,/getByLabel\(\/Password\|Contraseña\//);
 assert.match(browser,/getComputedStyle\(node\)/);
 assert.match(browser,/toBeFocused\(\)/);
 assert.match(browser,/#app-primary-content/);
});
