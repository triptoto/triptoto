const CACHE='tripto-shell-product-v2-live-flights-v1';
const PLACES_CACHE='tripto-places-2026-08-26';
const PLACES_PATHS=new Set(['/places-provider.js','/places-search-worker.js','/data/places-2026-08-26.json']);
const ASSETS=['/','/app','/index.html','/mobile-routes.js','/mobile-trip-rules.js','/vendor/phosphor/phosphor.css','/vendor/phosphor/Phosphor.woff2','/mobile-app.css','/google-auth-client.js','/manual-booking-attachments.js','/mobile-app.js','/manifest.webmanifest','/assets/google-g.svg','/assets/welcome-bg-3.jpg','/assets/trips-bg.jpg','/favicon.svg','/favicon-32.png','/favicon-16.png','/apple-touch-icon.png','/icon-192.png','/icon-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(key=>(key.startsWith('tripto-shell-')&&key!==CACHE)||(key.startsWith('tripto-places-')&&key!==PLACES_CACHE)).map(key=>caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/')||url.pathname==='/health')return;

  if(url.origin===self.location.origin&&PLACES_PATHS.has(url.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(PLACES_CACHE);
      const cached=await cache.match(request,{ignoreSearch:true});
      if(cached)return cached;
      const response=await fetch(request);
      if(response.ok)await cache.put(request,response.clone()).catch(()=>{});
      return response;
    })());
    return;
  }

  if(request.mode==='navigate'){
    const isMobileShell=['/','/app','/index.html'].includes(url.pathname);
    const navigationCacheKey=isMobileShell?'/index.html':url.pathname;
    event.respondWith((async()=>{
      try{
        const response=await fetch(request);
        if(response.ok&&url.origin===self.location.origin){
          const cache=await caches.open(CACHE);
          await cache.put(navigationCacheKey,response.clone());
        }
        return response;
      }catch(_){
        return(await caches.match(navigationCacheKey))||(await caches.match('/index.html'))||Response.error();
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cached=await caches.match(request);
    if(cached)return cached;
    const response=await fetch(request);
    if(response.ok&&url.origin===self.location.origin){
      const cache=await caches.open(CACHE);
      await cache.put(request,response.clone());
    }
    return response;
  })());
});
