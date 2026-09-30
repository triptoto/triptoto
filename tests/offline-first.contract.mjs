// Offline-first contract: exercises the real queue / sync / overlay / next-item
// code from public/mobile-app.js inside a VM with a fake localStorage, network
// and server. Scenarios follow the offline-first spec (1-12).
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';

const app = readFileSync('public/mobile-app.js', 'utf8');
const css = readFileSync('public/mobile-app.css', 'utf8');
let passed = 0;
const assert = (v, m) => { if (!v) throw new Error(`Offline-first contract failed: ${m}`); passed += 1; };
const slice = (from, to) => {
  const start = app.indexOf(from);
  const end = app.indexOf(to, start + from.length);
  if (start < 0 || end < 0) throw new Error(`Offline-first contract: cannot find ${from}`);
  return app.slice(start, end);
};

const queueSrc = slice('  // Offline change queue', '  function ageLabel(');
const checklistFlushSrc = slice('  function flushChecklistQueue()', '  function mapQueryForLocation(');
const versionSrc = slice('  async function currentChecklistVersion(', '\n  }\n') + '\n  }\n';
const overlaySrc = slice('  function overlayPendingChanges()', '  // Imports that still need');
const nextSrc = slice('  function nextItem(now = Date.now())', '  function nextFlight()');

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
    _map: map,
  };
}

// Fake server: checklist items with versions; records every request.
function makeServer() {
  const items = new Map([['srv-1', { id: 'srv-1', title: 'Passport', completed: false, version: 3 }]]);
  const idem = new Map();
  const log = [];
  let seq = 100;
  const server = {
    items, log, down: false, fail: null,
    async api(path, opts = {}) {
      const method = opts.method || 'GET';
      log.push({ method, path, headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : null });
      if (server.down) throw Object.assign(new TypeError('Failed to fetch'), { status: 0 });
      if (server.fail) { const f = server.fail; server.fail = null; throw Object.assign(new Error('fail'), f); }
      const m = path.match(/\/checklist(?:\/([^/?]+))?$/);
      if (!m) throw Object.assign(new Error('unknown'), { status: 404 });
      const id = m[1] && decodeURIComponent(m[1]);
      const body = opts.body ? JSON.parse(opts.body) : {};
      if (method === 'GET') return { items: [...items.values()] };
      if (method === 'POST') {
        const key = opts.headers?.['Idempotency-Key'];
        if (key && idem.has(key)) return { item: idem.get(key) };
        const item = { id: `srv-${++seq}`, title: body.title, completed: false, version: 1 };
        items.set(item.id, item); if (key) idem.set(key, item);
        return { item };
      }
      const item = items.get(id);
      if (!item) throw Object.assign(new Error('gone'), { status: 404 });
      if (Number(body.version) !== item.version)
        throw Object.assign(new Error('conflict'), { status: 409, code: 'VERSION_CONFLICT', details: { currentVersion: item.version } });
      if (method === 'DELETE') { items.delete(id); return { ok: true }; }
      Object.assign(item, 'completed' in body ? { completed: body.completed } : {}, body.title ? { title: body.title } : {}, { version: item.version + 1 });
      return { item };
    },
  };
  return server;
}

function makeApp({ identity = 'user-a', storage = makeStorage(), server = makeServer(), online = true } = {}) {
  const navigator = { onLine: online };
  const state = { token: 'tok', trip: { id: 't1' }, checklist: [], collections: [], collectionStops: [], timeline: [], brain: null, pendingCount: 0 };
  const ctx = {
    state, navigator, localStorage: storage, crypto: { randomUUID }, PREVIEW_MODE: false, PENDING_KEY: 'tripto_pending_mutations_v1',
    sessionIdentity: () => ctx.__identity, __identity: identity,
    api: (...a) => server.api(...a), apiGet: (p) => server.api(p),
    normalizeChecklist: (rows) => rows, toStopRow: (b) => b, isCancelled: (i) => String(i.status || '') === 'cancelled',
    val: (o, ...keys) => { for (const k of keys) if (o && o[k] != null && o[k] !== '') return o[k]; return undefined; },
    Date, Number, String, Math, JSON, Object, Array, Set, Map, Promise, Error, TypeError, console,
  };
  runInNewContext(`${queueSrc}\n${versionSrc}\n${checklistFlushSrc}\n${overlaySrc}\n${nextSrc}\n` +
    'Object.assign(globalThis,{pendingMutations,myPendingMutations,queuePendingMutation,updatePendingRow,migratePendingOwner,rememberServerId,resolvePendingId,isNetworkFailure,flushPendingKind,recoverInterruptedPending,discardPendingRow,flushChecklistQueue,overlayPendingChanges,nextItem});', ctx);
  return { ctx, state, navigator, storage, server };
}

// --- Source-level guarantees ------------------------------------------------
assert(app.includes('headers: { "Idempotency-Key": row.id }'), 'queued creates must send the row id as Idempotency-Key');
assert(app.includes('function recoverInterruptedPending()') && /recoverInterruptedPending\(\);\s*state\.pendingCount/.test(app), 'interrupted sends are recovered at boot');
assert(app.includes('Promise.allSettled'), 'boot must not couple trips/account/subscription (one failure must not blank the app)');
assert(app.includes('Trip not available offline'), 'uncached trips show "Trip not available offline"');
assert(app.includes("Couldn't download for offline use."), 'download failure copy');
assert(app.includes('Live flight status unavailable. Scheduled flight details are still available.'), 'offline flight copy');
assert(app.includes('Last status: ${lastKnown}') && app.includes('Updated ${ageLabel(updatedAt)}'), 'offline flight shows last-known status + Updated time, never live');
assert(app.includes('Saved result. It updates when you reconnect.'), 'health shows provenance offline');
assert(/function checkShellOffline[\s\S]{0,600}caches\.match/.test(app), 'Ready Offline checks the app shell is really cached');
assert(/function readyOfflineRows[\s\S]{0,4000}cachedSection\("?\/?/.test(app) || app.includes('cachedSection('), 'Ready Offline rows are backed by real cache reads');
assert(app.includes('case "remove-offline-copy"') && !/case "remove-offline-copy"[\s\S]{0,1500}method: "DELETE"/.test(app), 'removing the offline copy never deletes the cloud trip');
assert(/clearLocalDeviceData[\s\S]{0,900}PENDING_IDMAP_KEY/.test(app) && /clearLocalDeviceData[\s\S]{0,1400}sessionStorage/.test(app), 'local data removal also clears id map and form drafts');
assert(!/console\.(log|info|debug)\([^)]*(qr|passport|confirmation)/i.test(app), 'no logging of QR / passport / confirmation data');
assert(!/setInterval\([^)]*sync/i.test(app), 'no polling sync loop');
assert(css.includes('.connection-slot{display:contents}'), 'connection slot must not change layout');
assert(css.includes('html body .phone-app > .screen > .connection-slot > .mobile-alert'), 'alert layout rule follows the slot');

// --- Scenario 4 + 8 + 7: offline checklist, killed mid-sync, reconnection ----
{
  const a = makeApp({ online: false });
  a.server.down = true;
  a.ctx.queuePendingMutation({ kind: 'checklist', op: 'create', tripId: 't1', tempId: 'local-x', body: { title: 'Adapter' } });
  a.ctx.queuePendingMutation({ kind: 'checklist', op: 'toggle', tripId: 't1', itemId: 'local-x', body: { completed: true } });
  a.ctx.queuePendingMutation({ kind: 'checklist', op: 'toggle', tripId: 't1', itemId: 'srv-1', body: { completed: true, version: 3 } });
  assert(a.state.pendingCount === 3, 'three offline changes counted');
  const res = await a.ctx.flushChecklistQueue();
  assert(res === false && a.server.log.length === 0, 'no request is sent while offline');

  // Overlay: a refresh from cache must not erase the offline edits.
  a.state.checklist = [{ id: 'srv-1', title: 'Passport', completed: false, version: 3 }];
  a.ctx.overlayPendingChanges();
  assert(a.state.checklist.some((i) => i.id === 'local-x' && i.completed === true), 'offline-created item survives refresh and keeps its toggle');
  assert(a.state.checklist.find((i) => i.id === 'srv-1').completed === true, 'offline toggle survives refresh');

  // App killed mid-send: simulate a row left in "sending".
  const rows = a.ctx.pendingMutations();
  rows[0].status = 'sending';
  a.storage.setItem('tripto_pending_mutations_v1', JSON.stringify(rows));
  // First real attempt reached the server before the kill (duplicate risk).
  a.server.down = false;
  await a.server.api('/api/v1/trips/t1/checklist', { method: 'POST', headers: { 'Idempotency-Key': rows[0].id }, body: JSON.stringify({ title: 'Adapter' }) });
  a.server.log.length = 0;

  const b = makeApp({ storage: a.storage, server: a.server, online: true });
  b.ctx.recoverInterruptedPending();
  assert(b.ctx.pendingMutations().every((r) => r.status !== 'sending'), 'sending rows recovered after kill');
  // Recovered rows are in backoff (attempts 0 -> no wait) - flush now.
  const touched = await b.ctx.flushChecklistQueue();
  assert(touched === true, 'reconnect flush applies changes');
  assert(b.ctx.pendingMutations().length === 0, 'queue drained after reconnect');
  const adapters = [...a.server.items.values()].filter((i) => i.title === 'Adapter');
  assert(adapters.length === 1, 'no duplicate item after kill + resend (idempotent create)');
  assert(adapters[0].completed === true, 'toggle on offline-created item resolved to its server id');
  assert(a.server.items.get('srv-1').completed === true, 'offline toggle applied on server');
  assert(b.ctx.resolvePendingId('local-x') === adapters[0].id, 'temp id mapped to server id');
}

// --- Scenario 10: server conflict — never silently dropped -------------------
{
  const a = makeApp();
  a.ctx.queuePendingMutation({ kind: 'checklist', op: 'rename', tripId: 't1', itemId: 'srv-1', body: { title: 'Passports', version: 3 } });
  a.server.items.get('srv-1').version = 5; // edited elsewhere meanwhile
  await a.ctx.flushChecklistQueue();
  assert(a.server.items.get('srv-1').title === 'Passports' && a.ctx.pendingMutations().length === 0, 'checklist: stale version re-read once, user intent applied (low-impact, deterministic)');

  // Persistent conflict: server keeps moving -> row kept as conflict, not dropped.
  a.ctx.queuePendingMutation({ kind: 'checklist', op: 'rename', tripId: 't1', itemId: 'srv-1', body: { title: 'Docs', version: 1 } });
  a.ctx.queuePendingMutation({ kind: 'checklist', op: 'toggle', tripId: 't1', itemId: 'srv-1', body: { completed: true, version: 1 } });
  const origApi = a.server.api;
  a.server.api = async (path, opts = {}) => {
    if ((opts.method || 'GET') === 'PATCH') throw Object.assign(new Error('conflict'), { status: 409, details: { currentVersion: 99 } });
    return origApi(path, opts);
  };
  await a.ctx.flushChecklistQueue();
  const rows = a.ctx.pendingMutations();
  assert(rows[0].status === 'conflict' && rows[0].body.title === 'Docs', 'conflicting change is kept for review, not overwritten or dropped');
  assert(rows[1].status === 'pending', 'later change to the same record waits behind the conflict (order preserved)');
  a.ctx.discardPendingRow(rows[0].id);
  assert(a.ctx.pendingMutations().length === 1, 'user can discard a conflict explicitly');
}

// --- Scenario 11: provider outage / 5xx — retried with backoff ---------------
{
  const a = makeApp();
  a.ctx.queuePendingMutation({ kind: 'checklist', op: 'toggle', tripId: 't1', itemId: 'srv-1', body: { completed: true, version: 3 } });
  a.server.fail = { status: 503 };
  await a.ctx.flushChecklistQueue();
  let row = a.ctx.pendingMutations()[0];
  assert(row.status === 'failed' && row.attempts === 1, '5xx keeps the change as failed for retry');
  const before = a.server.log.length;
  await a.ctx.flushChecklistQueue();
  assert(a.server.log.length === before, 'backoff: no immediate hammering after a failure');
  a.ctx.updatePendingRow(row.id, { lastAttemptAt: 0 });
  await a.ctx.flushChecklistQueue();
  assert(a.ctx.pendingMutations().length === 0, 'retry after backoff succeeds');
}

// --- Network failure while navigator.onLine is true (captive portal / DNS) ---
{
  const a = makeApp();
  assert(a.ctx.isNetworkFailure(Object.assign(new TypeError('Failed to fetch'), {})) === true, 'fetch TypeError counts as network failure even when onLine is true');
  assert(a.ctx.isNetworkFailure({ status: 500 }) === false, 'server answer is not a network failure');
}

// --- Account isolation: another identity never sends my queue -------------
{
  const storage = makeStorage();
  const a = makeApp({ identity: 'user-a', storage });
  a.ctx.queuePendingMutation({ kind: 'checklist', op: 'toggle', tripId: 't1', itemId: 'srv-1', body: { completed: true, version: 3 } });
  const b = makeApp({ identity: 'user-b', storage });
  await b.ctx.flushChecklistQueue();
  assert(b.server.log.length === 0 && b.ctx.myPendingMutations().length === 0, 'queued changes belong to the account that made them');
  b.ctx.migratePendingOwner('user-a', 'user-b');
  assert(b.ctx.myPendingMutations().length === 1, 'guest -> Google sign-in carries the queue over');
}

// --- Scenario 3/9/12: What's Next is computed on-device, never from stale brain
{
  const a = makeApp();
  const now = Date.UTC(2026, 9, 1, 12);
  const H = 3600e3;
  a.state.timeline = [
    { id: 'done', starts_at_utc: now - 5 * H },
    { id: 'hotel', starts_at_utc: now + 2 * H },
    { id: 'flight', starts_at_utc: now + 6 * H },
  ];
  a.state.brain = { nextItem: { id: 'done', title: 'stale pick' } };
  assert(a.ctx.nextItem(now).id === 'hotel', 'stale brain pick in the past is ignored');
  a.state.brain = { nextItem: { id: 'flight' } };
  assert(a.ctx.nextItem(now).id === 'hotel', 'brain pick later than a real upcoming item is ignored');
  a.state.brain = { nextItem: { id: 'gone-item' } };
  assert(a.ctx.nextItem(now).id === 'hotel', 'brain pick missing from the local timeline is ignored');
  a.state.timeline[1].status = 'cancelled';
  a.state.brain = null;
  assert(a.ctx.nextItem(now).id === 'flight', 'cancelled items are skipped');
  assert(a.ctx.nextItem(now + 10 * H) === null, 'completed trip: no fabricated next item');
}

console.log(`offline-first contract passed (${passed} checks).`);
