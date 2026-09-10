import { frontendResponse } from '../apps/worker/src/index.ts';
import type { Env } from '../apps/worker/src/types.ts';

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

response = await get('/privacy');
equal(requests.at(-1), '/privacy.html');
equal(response?.headers.get('X-Robots-Tag'), null);

response = await get('/trips/example-trip');
equal(requests.at(-1), '/index.html');
equal(response?.status, 200);
equal(response?.headers.get('X-Robots-Tag'), 'noindex, nofollow');

response = await get('/weather', 'HEAD');
equal(response?.status, 200);
equal(await response?.text(), '');
equal(response?.headers.get('X-Robots-Tag'), 'noindex, nofollow');

response = await get('/does-not-exist');
equal(response?.status, 404);
equal(response?.headers.get('X-Robots-Tag'), 'noindex, nofollow');
equal(response?.headers.get('Cache-Control'), 'no-store');

response = await get('/mobile-app.min.js');
equal(requests.at(-1), '/mobile-app.min.js');

console.log('Frontend public, private deep-link, static asset, HEAD, and unknown-route contracts passed.');
