import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('public/mobile-app.js', 'utf8');
const part = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const val = (row, ...keys) => keys.map(key => row?.[key]).find(value => value != null && value !== '') ?? null;
const itemId = row => String(row?.id || row?.trip_item_id || '');

function harness({ cache = 'full', screen = 'collection', rawId = 'old-town', missing = false } = {}) {
  const trip = { id: 'trip-1', title: 'Local QA trip', lifecycle_state: 'active' };
  const collection = { id: 'collection-1', trip_item_id: 'item-1', trip_id: trip.id, title: 'Old town', collection_type: 'neighborhood' };
  const replies = new Map([
    ['/api/v1/trips', { trips: [trip] }],
    ['/api/v1/account', { account: { mode: 'guest' } }],
    [`/api/v1/trips/${trip.id}/timeline`, { items: [collection] }],
    [`/api/v1/trips/${trip.id}/collections`, { collections: missing ? [] : [collection], stops: [] }],
  ]);
  const cached = new Map(cache === 'none' ? [] : replies);
  if (cache === 'partial') cached.delete(`/api/v1/trips/${trip.id}/collections`);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const state = { screen, selectedId: rawId, loading: true, tripsLoaded: false, trips: [], trip: null,
    collections: [], collectionStops: [], timeline: [], transport: [], stays: [], locations: [], travelers: [] };
  const frames = [];
  const ctx = vm.createContext({ state, val, itemId, PREVIEW_MODE: false, URL, URLSearchParams,
    localStorage: { getItem: key => key === 'tripto_selected_trip' ? trip.id : null, setItem() {} },
    cacheRead: path => cached.has(path) ? { data: cached.get(path) } : null,
    apiGet: async path => { await gate; return replies.get(path) || {}; },
    normalizeChecklist: rows => rows, listLocalDocs: async () => [], ensureWeather() {}, loadSharingStatus() {}, resetCollaborationState() {},
    maybeLoadScreenData() {}, routeHistoryIndex: () => 0,
    routeHistoryState: (nextScreen, id) => ({ tripto: true, screen: nextScreen, id }),
  });
  vm.runInContext(readFileSync('public/mobile-routes.js', 'utf8'), ctx);
  ctx.routes = ctx.TriptoRoutes;
  ctx.location = new URL('http://localhost' + ctx.routes.pathFor(screen, rawId));
  ctx.history = { replaceState(value, _, url) { this.state = value; ctx.location = new URL(url, ctx.location); } };
  ctx.render = () => frames.push(state.loading ? 'loading' : state.error ? 'error' :
    ['collection', 'collection-form', 'stop-form'].includes(state.screen)
      ? ctx.collectionForItem(state.selectedId) ? 'plan' : 'Plan unavailable' : state.screen);
  vm.runInContext(part('  function parseRoute()', '  function quickDraftKey('), ctx);
  vm.runInContext(part('  function hydrateAppFromCache()', '  async function refreshBookingEmailInbox()'), ctx);
  vm.runInContext(part('  function collectionForItem(', '  function collectionStopsFor('), ctx);
  return { ctx, state, frames, release, replies, trip };
}

for (const screen of ['collection', 'collection-form', 'stop-form']) {
  for (const cache of ['full', 'partial', 'none']) {
    const h = harness({ screen, cache });
    const pending = h.ctx.loadApp();
    assert.equal(h.frames[0], cache === 'full' ? 'plan' : 'loading', `${screen}: ${cache} cache must not flash an unavailable plan before requests resolve`);
    h.release();
    await pending;
    assert.equal(h.state.selectedId, 'collection-1', `${screen}: readable URL must resolve to its record`);
    assert(!h.frames.includes('Plan unavailable'), `${screen}: no intermediate unavailable frame`);
  }
}

for (const rawId of ['collection-1', 'item-1']) {
  const h = harness({ rawId });
  const pending = h.ctx.loadApp();
  assert.equal(h.frames[0], 'plan', 'Both collection identifiers render cached content immediately');
  h.release(); await pending;
  assert(!h.frames.includes('Plan unavailable'));
}

const missing = harness({ missing: true });
const missingRequest = missing.ctx.loadApp();
assert.equal(missing.frames[0], 'loading', 'Missing cached data is not a confirmed missing plan');
missing.release(); await missingRequest;
assert.equal(missing.state.screen, 'planning', 'A confirmed missing plan still recovers to the planning list');
assert(!missing.frames.includes('Plan unavailable'));

const waitingRoute = harness({ cache: 'partial' });
waitingRoute.state.loading = false;
waitingRoute.state.tripsLoaded = true;
waitingRoute.state.tripDetailsLoading = true;
waitingRoute.ctx.canonicalizeAppRoute();
assert.equal(waitingRoute.state.screen, 'collection', 'Route recovery must wait for the active detail request');
assert.equal(waitingRoute.ctx.location.pathname, '/collections/old-town');

const refresh = harness();
refresh.release(); await refresh.ctx.loadApp();
const refreshPending = refresh.ctx.loadApp();
assert.equal(refresh.frames.at(-1), 'plan', 'Background revalidation preserves the loaded plan');
await refreshPending;

for (const completionOrder of [[0, 1], [1, 0]]) {
  const h = harness();
  h.release(); await h.ctx.loadApp();
  const requests = [];
  h.ctx.apiGet = path => new Promise(resolve => requests.push({ path, resolve }));
  const loads = [h.ctx.loadTripDetails(), h.ctx.loadTripDetails()];
  assert(h.state.tripDetailsLoading, 'Every detail refresh advertises its pending state');
  for (const wave of completionOrder) {
    for (const request of requests.slice(wave * 17, (wave + 1) * 17))
      request.resolve(request.path.endsWith('/collections') ? { collections: [{ id: `wave-${wave}` }], stops: [] } : {});
    await loads[wave];
    if (wave === 0 && completionOrder[0] === 0)
      assert(h.state.tripDetailsLoading, 'An older completion cannot dismiss the newer request');
  }
  assert.equal(h.state.collections[0].id, 'wave-1', 'Late responses cannot overwrite newer trip details');
  assert.equal(h.state.tripDetailsLoading, false);
  h.ctx.apiGet = async () => { throw new Error('temporary network failure'); };
  await h.ctx.loadTripDetails();
  assert.equal(h.state.collections[0].id, 'wave-1', 'Failed refresh retains the known plan');
  assert.equal(h.state.tripDetailsLoading, false, 'Failed requests cannot leave permanent loading');
  h.state.trip = null;
  await h.ctx.loadTripDetails();
  assert.equal(h.state.collections.length, 0, 'No trip must not retain another trip\'s collections');
}

const navigation = harness();
const navigationPending = navigation.ctx.loadApp();
navigation.state.screen = 'trips'; navigation.state.selectedId = null;
navigation.ctx.location = new URL('http://localhost/trips');
navigation.release(); await navigationPending;
assert.equal(navigation.frames.at(-1), 'trips', 'Background completion cannot return the user to the old detail route');

// Detail loading is shared by every missing-detail renderer, including booking
// and stop forms reached while a trip switch is still waiting on the network.
const pendingDetail = { loading: false, tripDetailsLoading: true, screen: 'collection' };
const detailContext = vm.createContext({ state: pendingDetail,
  appBar: title => `<header>${title}</header>`, EmptyState: title => `<h1>${title}</h1>`, bottomNav: () => '<nav></nav>',
  loadingSkeleton: () => '<div role="status">Loading</div>' });
vm.runInContext(part('  function missingDetailScreen(', '  function hotelScreen()'), detailContext);
assert(!detailContext.missingDetailScreen('Plan unavailable', 'This plan is not available.').includes('Plan unavailable'), 'An in-flight detail request must not render an error state');
pendingDetail.tripDetailsLoading = false;
assert(detailContext.missingDetailScreen('Plan unavailable', 'This plan is not available.').includes('Plan unavailable'), 'Actual missing records are not hidden indefinitely');

console.log('Detail loading: cached slugs, both IDs, partial/cold cache, refresh races, network failure, navigation, confirmed missing data and pending-detail rendering passed.');
