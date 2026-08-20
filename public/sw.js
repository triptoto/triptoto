const CACHE='tripto-shell-major-beta-5-8';
const ASSETS=['/','/app','/index.html','/app.css','/app-v3.css','/app-v4.css','/app-v5.css','/app-v6.css','/app-v7.css','/app-beta.css','/app-milestone2.css','/app-milestone3.css','/app-milestone4.css','/app.js','/major.css','/major-workspace.js','/manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);
  if(url.pathname.startsWith('/api/')||url.pathname==='/health')return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put('/index.html',copy));return res;}).catch(()=>caches.match('/index.html')));return;
  }
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res;})));
});
