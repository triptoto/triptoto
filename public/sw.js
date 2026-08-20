const CACHE='tripto-shell-beta-candidate-1';
const ASSETS=['/','/app','/index.html','/app.css','/app-v3.css','/app-v4.css','/app-v5.css','/app-v6.css','/app-v7.css','/app-beta.css','/app-milestone2.css','/app-milestone3.css','/app-milestone4.css','/app.js','/major.css','/major-workspace.js','/manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('tripto-shell-')&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]));});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);
  if(url.pathname.startsWith('/api/')||url.pathname==='/health')return;
  if(req.mode==='navigate'){
    event.respondWith((async()=>{try{const res=await fetch(req);if(res.ok){const cache=await caches.open(CACHE);await cache.put('/index.html',res.clone());}return res;}catch(_){return (await caches.match('/index.html'))||Response.error();}})());return;
  }
  event.respondWith((async()=>{const cached=await caches.match(req);if(cached)return cached;const res=await fetch(req);if(res.ok&&url.origin===self.location.origin){const cache=await caches.open(CACHE);await cache.put(req,res.clone());}return res;})());
});
