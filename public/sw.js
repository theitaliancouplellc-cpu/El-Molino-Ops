const CACHE='el-molino-static-v4';
const STATIC=['/manifest.webmanifest','/icon.svg'];
const OFFLINE_HTML='<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#173d2a"><title>El Molino Ops · Offline</title></head><body style="font-family:system-ui;padding:max(32px,env(safe-area-inset-top)) 24px;background:#f5f2ea;color:#171713"><main role="main"><h1 style="font-size:24px">El Molino Ops is offline</h1><p>Reconnect to load the latest restaurant data. Changes are not accepted while the app cannot reach the server.</p><button onclick="location.reload()" style="min-height:44px;padding:10px 16px">Try again</button></main></body></html>';

async function safePrime(){const cache=await caches.open(CACHE);await Promise.allSettled(STATIC.map(async path=>{try{const res=await fetch(path,{cache:'no-store'});if(res.ok)await cache.put(path,res.clone())}catch{}}))}
async function purgeOld(){const keys=await caches.keys();await Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('el-molino-')).map(k=>caches.delete(k)))}
async function networkFirst(req,cacheable=false){try{const res=await fetch(req,{cache:'no-store'});if(res.ok){if(cacheable){const cache=await caches.open(CACHE);await cache.put(req,res.clone())}return res}if(cacheable){const hit=await caches.match(req);if(hit)return hit}return res}catch{const hit=await caches.match(req);return hit||Response.error()}}

self.addEventListener('install',event=>{event.waitUntil(safePrime().then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(purgeOld().then(()=>self.clients.claim()))});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();if(event.data?.type==='CLEAR_CACHES')event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('el-molino-')).map(k=>caches.delete(k)))).then(()=>safePrime()))});
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==self.location.origin)return;
  if(req.mode==='navigate'||req.destination==='document'){event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>new Response(OFFLINE_HTML,{status:503,statusText:'Offline',headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}})));return}
  if(url.pathname.startsWith('/_next/static/')){event.respondWith(networkFirst(req,true));return}
  if(STATIC.includes(url.pathname)){event.respondWith(networkFirst(req,true));return}
  event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>Response.error()));
});
