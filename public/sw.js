const CACHE='tripto-shell-product-v2';
const ASSETS=['/','/app','/index.html','/mobile-trip-rules.js','/mobile-app.css','/smart-import.js','/mobile-app.js','/manifest.webmanifest','/assets/mobile/hotel-fallback-premium.jpg','/assets/mobile/rome-silhouette.svg','/legacy.html','/legacy-bridge.js','/app.css','/app-v3.css','/app-v4.css','/app-v5.css','/app-v6.css','/app-v7.css','/app-beta.css','/app-milestone2.css','/app-milestone3.css','/app-milestone4.css','/major.css','/app.js','/major-workspace.js'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('tripto-shell-')&&key!==CACHE).map(key=>caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/')||url.pathname==='/health')return;

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
