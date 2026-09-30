import { frontendResponse } from '../apps/worker/src/index.ts';
import type { Env } from '../apps/worker/src/types.ts';
import { readFileSync } from 'node:fs';

const equal = (actual: unknown, expected: unknown) => {
  if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
};

const requests: string[] = [];
const env = {
  ASSETS: {
    async fetch(request: Request) {
      const path = new URL(request.url).pathname;
      requests.push(path);
      return new Response(`<html>${path}</html>`, { headers: { 'Content-Type': 'text/html' } });
    },
  },
} as Env;

const get = (path: string, method = 'GET') => frontendResponse(new Request(`https://tripto.to${path}`, { method }), env, path);

let response = await get('/');
equal(response?.status, 200);
equal(requests.at(-1), '/');

for (const path of ['/landing', '/landing/', '/landing.html']) {
  response = await get(path);
  equal(response?.status, 200);
  equal(requests.at(-1), '/landing.html');
  equal(response?.headers.get('X-Robots-Tag'), null);
}

response = await get('/privacy');
equal(requests.at(-1), '/privacy.html');
response = await get('/cookies');
equal(requests.at(-1), '/cookies.html');
response = await get('/contact');
equal(requests.at(-1), '/contact.html');
equal(response?.headers.get('X-Robots-Tag'), null);

response = await get('/trips/example-trip');
equal(requests.at(-1), '/index.html');
equal(response?.status, 200);
equal(response?.headers.get('X-Robots-Tag'), 'noindex, nofollow');

response = await get('/weather', 'HEAD');
equal(response?.status, 200);
equal(await response?.text(), '');
equal(response?.headers.get('X-Robots-Tag'), 'noindex, nofollow');

response = await get('/tax-free', 'HEAD');
equal(response?.status, 200);
equal(await response?.text(), '');
equal(response?.headers.get('X-Robots-Tag'), 'noindex, nofollow');

response = await get('/esim');
equal(response?.status, 200);
equal(requests.at(-1), '/index.html');
equal(response?.headers.get('X-Robots-Tag'), 'noindex, nofollow');

response = await get('/does-not-exist');
equal(response?.status, 404);
equal(response?.headers.get('X-Robots-Tag'), 'noindex, nofollow');
equal(response?.headers.get('Cache-Control'), 'no-store');

// Every static client route must be whitelisted for the SPA shell — a hard
// refresh (or shared link) on any of them must return index.html, never the
// styled 404. Regression guard: /saved-spots shipped in the client router but
// was missing from the worker's APP_PATHS, so refreshing it served 404.html.
const routesSrc = readFileSync('public/mobile-routes.js', 'utf8');
const staticBlock = routesSrc.slice(routesSrc.indexOf('STATIC_PATHS'), routesSrc.indexOf('DETAIL_PATHS'));
const clientPaths = [...staticBlock.matchAll(/:\s*"(\/[a-z0-9/-]+)"/gi)].map((m) => m[1]);
if (clientPaths.length < 20) throw new Error(`Expected to parse the STATIC_PATHS route table, found ${clientPaths.length}`);
for (const path of clientPaths) {
  const shell = await get(path);
  if (shell?.status !== 200) throw new Error(`Static client route ${path} is not served as the app shell (status ${shell?.status}) — add it to APP_PATHS in apps/worker/src/index.ts`);
  equal(requests.at(-1), '/index.html');
}

response = await get('/mobile-app.min.js');
equal(requests.at(-1), '/mobile-app.min.js');

console.log('Frontend public, private deep-link, static asset, HEAD, and unknown-route contracts passed.');
