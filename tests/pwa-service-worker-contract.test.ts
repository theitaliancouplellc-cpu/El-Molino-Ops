import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');

test('cached static assets survive deployment-time 404 or 5xx responses',()=>{
  assert.match(sw,/if\(res\.ok\)\{/);
  assert.match(sw,/if\(cacheable\)\{const hit=await caches\.match\(req\);if\(hit\)return hit\}return res/);
  assert.match(sw,/url\.pathname\.startsWith\('\/_next\/static\/'\).*networkFirst\(req,true\)/s);
});

test('document navigations stay network-only and fail closed to offline HTML',()=>{
  assert.match(sw,/req\.mode==='navigate'\|\|req\.destination==='document'/);
  assert.match(sw,/new Response\(OFFLINE_HTML,\{status:503/);
  assert.match(sw,/Changes are not accepted while the app cannot reach the server/);
});
