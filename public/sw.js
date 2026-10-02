const CACHE='tripto-shell-product-v852-night-icon-hues';
// Locale bundles are hashless + immutable, so we version their query with the
// deploy token (same one baked into index.html) and serve them by EXACT url via
// the shell handler — a new token is a new url that bypasses the immutable HTTP
// cache. Without this a locale content change never reaches a warm browser.
const SHELL_VER=CACHE.slice('tripto-shell-product-'.length);
const LOCALE_ASSETS=['source-map','patterns','en','de','fr','es','ru'].map(n=>`/lang/${n}.json?v=${SHELL_VER}`);
const PLACES_CACHE='tripto-places-2026-08-26';
const PLACES_PATHS=new Set(['/places-provider.js','/places-search-worker.js','/data/places-2026-08-26.json']);
// App-shell code. Served cache-first keyed by the EXACT versioned URL (the
// `?v=` token stamped into index.html on deploy). Because each `?v=` is an
// immutable URL, an exact-URL hit is always correct, so warm starts never wait
// on the network; a deploy mints a new `?v=` (delivered by the network-first
// index.html), which misses cache and fetches fresh. This is the freshness the
// old `ignoreSearch` cache-first lacked — without the per-launch network wait
// that the network-first workaround imposed.
const SHELL_PATHS=new Set(['/mobile-app.min.css','/mobile-app.min.js','/mobile-routes.js','/mobile-trip-rules.js','/shell-update.js','/canonical-host.js','/google-auth-client.js','/manual-booking-attachments.js','/i18n.js','/legal-navigation.js','/legal-navigation.css','/legal-page.css','/lang/source-map.json','/lang/patterns.json','/lang/en.json','/lang/de.json','/lang/fr.json','/lang/es.json','/lang/ru.json']);
// Essential shell — must cache atomically before the worker takes over so we
// never activate a half-broken shell.
const CORE=['/','/index.html','/shell-update.js','/canonical-host.js','/mobile-routes.js','/legal-navigation.css','/legal-navigation.js','/mobile-trip-rules.js','/mobile-app.min.css','/google-auth-client.js','/i18n.js','/manual-booking-attachments.js','/mobile-app.min.js','/manifest.webmanifest'];
// Nice-to-have assets (icons, images, favicons). Cached best-effort so a single
// slow/missing extra never blocks or fails the update on flaky mobile networks.
const EXTRA=['/app','/icons/tripto-system.svg','/assets/google-g.svg','/assets/trips-bg.jpg','/assets/trips-banner-dark.png','/assets/trips-banner-day.png','/favicon.svg','/favicon-mask.svg','/favicon-32.png','/favicon-16.png','/apple-touch-icon.png','/icon-192.png','/icon-512.png',
// Versioned locale bundles (see LOCALE_ASSETS) + PDF export: the lazy renderer +
// embeddable fonts. Precached best-effort so the app is fully localized and can
// export to PDF offline. Locale urls carry the ?v= token so cache.add fetches
// fresh bytes past the immutable HTTP cache; the shell handler serves them by
// exact url. Other assets use the generic ignoreSearch handler.
...LOCALE_ASSETS,'/pdf-export.js','/airline-directory.js','/vendor/space-grotesk/space-grotesk-latin-wght-normal.woff2','/vendor/pdf/standard_fonts/LiberationSans-Regular.ttf','/vendor/pdf/standard_fonts/LiberationSans-Bold.ttf','/vendor/pdf/standard_fonts/LiberationSans-Italic.ttf'];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(CORE);
    await Promise.allSettled(EXTRA.map(asset=>cache.add(asset)));
    // Take over immediately so a deploy reaches open pages without waiting for
    // every tab to close (paired with clients.claim + controllerchange reload).
    await self.skipWaiting();
  })());
});

self.addEventListener('message',event=>{
  if(event.data==='skipWaiting')self.skipWaiting();
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

  if(url.origin===self.location.origin&&SHELL_PATHS.has(url.pathname)){
    event.respondWith((async()=>{
      // Versioned (?v=) shell URLs are immutable, so an EXACT-URL cache hit is
      // always the correct bytes — serve it instantly for near-zero warm start.
      // A deploy changes the ?v= token (the network-first index.html carries
      // it), which is a fresh URL => cache miss => network fetch => cached. This
      // keeps launches instant without ever painting a stale shell. Matching by
      // full URL (no ignoreSearch) is what makes freshness-on-deploy safe.
      const cache=await caches.open(CACHE);
      const cached=await cache.match(request);
      if(cached)return cached;
      try{
        const response=await fetch(request);
        if(response.ok)await cache.put(request,response.clone()).catch(()=>{});
        return response;
      }catch(_){
        return(await cache.match(url.pathname))||(await caches.match(request,{ignoreSearch:true}))||Response.error();
      }
    })());
    return;
  }

  if(request.mode==='navigate'){
    // / is the public landing page, not the app shell; caching it under
    // /index.html would replace the offline app with the landing page.
    const isMobileShell=['/app','/index.html'].includes(url.pathname);
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
    const cached=await caches.match(request,{ignoreSearch:true});
    if(cached)return cached;
    const response=await fetch(request);
    if(response.ok&&url.origin===self.location.origin){
      const cache=await caches.open(CACHE);
      await cache.put(request,response.clone());
    }
    return response;
  })());
});
