import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const listeners = new Map();
const stores = new Map();
const cacheFor = (name) => {
  if (!stores.has(name)) stores.set(name, new Map());
  const store = stores.get(name);
  return {
    addAll: async () => undefined,
    match: async (request, options = {}) => {
      const url = new URL(typeof request === 'string' ? request : request.url, 'https://tripto.test');
      const key = options.ignoreSearch ? url.pathname : `${url.pathname}${url.search}`;
      return store.get(key);
    },
    put: async (request, response) => {
      const url = new URL(typeof request === 'string' ? request : request.url, 'https://tripto.test');
      store.set(`${url.pathname}${url.search}`, response);
      store.set(url.pathname, response);
    },
  };
};

let network = async () => { throw new TypeError('offline'); };
const context = vm.createContext({
  URL, Request, Response, Promise, Set,
  fetch: (...args) => network(...args),
  caches: {
    open: async (name) => cacheFor(name),
    keys: async () => Array.from(stores.keys()),
    delete: async (name) => stores.delete(name),
    match: async (request) => {
      for (const name of stores.keys()) {
        const match = await cacheFor(name).match(request);
        if (match) return match;
      }
      return undefined;
    },
  },
  self: {
    location: { origin: 'https://tripto.test' },
    clients: { claim: async () => undefined },
    skipWaiting: () => undefined,
    addEventListener: (name, listener) => listeners.set(name, listener),
  },
});
vm.runInContext(readFileSync('public/sw.js', 'utf8'), context);

async function fetchThroughServiceWorker() {
  let responsePromise;
  listeners.get('fetch')({
    request: new Request('https://tripto.test/data/places-2026-08-26.json'),
    respondWith(value) { responsePromise = value; },
  });
  assert.ok(responsePromise, 'the places request is handled by the service worker');
  return responsePromise;
}

await assert.rejects(fetchThroughServiceWorker(), /offline/, 'before the first download there is no invented fallback');
network = async () => new Response('{"version":"2026-08-26"}', { status: 200 });
assert.equal((await (await fetchThroughServiceWorker()).json()).version, '2026-08-26');
network = async () => { throw new TypeError('offline'); };
assert.equal((await (await fetchThroughServiceWorker()).json()).version, '2026-08-26', 'a downloaded dataset remains available offline');

stores.set('tripto-places-older-version', new Map());
let activation;
listeners.get('activate')({ waitUntil(value) { activation = value; } });
await activation;
assert.equal(stores.has('tripto-places-older-version'), false, 'a version upgrade removes only the stale places cache');
assert.equal(stores.has('tripto-places-2026-08-26'), true);

console.log('Offline places first-download, cached-offline, and version-upgrade scenarios passed.');
