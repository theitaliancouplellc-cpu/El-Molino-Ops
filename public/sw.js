const CACHE='el-molino-static-v3';
const STATIC=['/manifest.webmanifest','/icon.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(STATIC))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;

  // Never serve cached HTML/navigation. The installed app should always ask
  // production for the newest application shell when online.
  if(req.mode==='navigate'||req.destination==='document'){
    event.respondWith(
      fetch(req,{cache:'no-store'}).catch(()=>new Response(
        '<!doctype html><html><body style="font-family:system-ui;padding:32px"><h2>El Molino Ops is offline</h2><p>Reconnect to load the latest version.</p></body></html>',
        {headers:{'content-type':'text/html; charset=utf-8'}}
      ))
    );
    return;
  }

  // Next.js build assets are content-hashed, so they are safe to cache.
  if(url.pathname.startsWith('/_next/static/')){
    event.respondWith(
      caches.match(req).then(hit=>hit||fetch(req).then(res=>{
        if(res.ok){const copy=res.clone();void caches.open(CACHE).then(cache=>cache.put(req,copy));}
        return res;
      }))
    );
    return;
  }

  // Everything else prefers the network and only falls back to a cached copy.
  event.respondWith(
    fetch(req,{cache:'no-store'}).then(res=>{
      if(res.ok&&STATIC.includes(url.pathname)){
        const copy=res.clone();void caches.open(CACHE).then(cache=>cache.put(req,copy));
      }
      return res;
    }).catch(()=>caches.match(req).then(hit=>hit||Response.error()))
  );
});
