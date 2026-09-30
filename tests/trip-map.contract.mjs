import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(p,'utf8'),assert=(v,m)=>{if(!v)throw new Error(`Trip Map contract failed: ${m}`)};
const app=read('public/mobile-app.js'),css=read('public/mobile-app.css'),index=read('public/index.html'),routeSource=read('public/mobile-routes.js'),workerIndex=read('apps/worker/src/index.ts'),weather=read('apps/worker/src/routes/weather.ts'),headers=read('public/_headers');

// --- Contextual entry, never a permanent tab ------------------------------
const nav=app.slice(app.indexOf('function navigationSheet('),app.indexOf('function totalNotificationCount('));
assert(!nav.includes('data-screen="trip-map"'),'a permanent Trip Map tab leaked into the bottom navigation');
assert(!app.includes('Timeline|Map')&&!app.includes('data-action="toggle-map"')&&!app.includes('timeline-map-switch'),'a permanent Timeline/Map switch is forbidden');
const plus=app.slice(app.indexOf('function addIntentRows('),app.indexOf('function dayPlanScreen('));
assert(!plus.includes('open-trip-map')&&!plus.includes('View Trip Map'),'Trip Map must NOT appear in the + menu — it lives in the trip options menu');
const tripMenu=app.slice(app.indexOf('function tripOptionsScreen('),app.indexOf('// ===== Free trip collaboration'));
assert(tripMenu.includes('canShowTripMap()')&&tripMenu.includes('data-action="open-trip-map"'),'Trip Map must appear inside the trip options menu');
assert(tripMenu.includes('data-action="open-weather"')&&tripMenu.indexOf('data-action="open-weather"')<tripMenu.indexOf('data-action="open-trip-map"'),'Trip options menu must render Weather before Trip Map');

// --- Canonical domain model (single source of truth) ----------------------
for(const fn of ['function getMappableTripLocations(','function canShowTripMap(','function locationIsMappable(','function mapPlaceKey(','function mappableBookingRefs(','function orderedTripMapPlaces('])assert(app.includes(fn),`canonical helper missing: ${fn}`);
assert(app.includes('getMappableTripLocations().length >= 1'),'canonical eligibility rule (1+ mappable place) missing');

// --- Eligibility states A-J -----------------------------------------------
// A/B: no mappable places -> graceful fallback, no map.
assert(app.includes('function tripMapScreen(')&&app.includes('has no places to map yet'),'State A/B: no-places fallback missing');
// C: 2+ distinct places -> place rows rendered (in the bottom sheet).
assert(app.includes('class="trip-map__row'),'State C: place rows not rendered for eligible trips');
// D: duplicate physical place counts once (dedup by coords/address/name).
assert(app.includes('`c:${geo.lat.toFixed(4)},${geo.lon.toFixed(4)}`')&&app.includes('`a:${geo.address'),'State D: distinct-location dedup key missing');
// E: city-only (no coords, no address) is excluded.
assert(app.includes('return Boolean(geo.hasCoords || geo.address);'),'State E: city-only exclusion rule missing');
// F: cancelled bookings never contribute a place.
assert(app.includes('.filter((t) => !isCancelled(t))')&&app.includes('.filter((s) => !isCancelled(s))')&&app.includes('.filter((it) => !isCancelled(it))'),'State F: cancelled bookings must be excluded');
// G: address-only place resolved through the keyless geocoder (precise pins + directions).
assert(app.includes('function geocodeMissingTripPlaces(')&&app.includes('/api/v1/geocode?q='),'State G: address geocoding missing');
// H: offline -> no geocode attempt, live map hidden, saved-place list still available, directions guarded.
assert(app.includes('if (state.offline) return')&&app.includes('&& !state.offline')&&app.includes('Offline — showing your saved places')&&app.includes('Connect to open directions'),'State H: offline degradation missing');
// J: NEXT badge = soonest future booking.
assert(app.includes('function tripMapNextKey(')&&app.includes('trip-map__next')&&app.includes('>NEXT<'),'State J: NEXT badge missing');

// --- Live interactive map engine (MapLibre GL + OpenFreeMap) --------------
for(const fn of ['function ensureMapLibre(','function initLiveMap(','function refreshLiveMap(','function syncLiveMapScreen(','function fitLiveMap(','function mapDarkStyle(','function mapPinElement(','function mapLocate('])assert(app.includes(fn),`live-map engine helper missing: ${fn}`);
assert(app.includes('cdn.jsdelivr.net/npm/maplibre-gl'),'MapLibre GL must be runtime-loaded from jsDelivr');
assert(app.includes('https://tiles.openfreemap.org/planet')&&app.includes('tiles.openfreemap.org/fonts'),'OpenFreeMap vector tiles + glyphs must back the custom dark style');
assert(app.includes('"live-map-canvas"')&&app.includes('document.body.appendChild(root)'),'the WebGL map must live in a persistent element appended to <body> (render() rewrites #app)');
const bind=app.slice(app.indexOf('function bindDynamic('),app.indexOf('function bindDynamic(')+400);
assert(bind.includes('syncLiveMapScreen()'),'bindDynamic must sync the live map after every render');
// The map is a background layer; overlay controls render inside #app.
assert(css.includes('#live-map-root')&&css.includes('.map-overlay')&&css.includes('.map-sheet')&&css.includes('.map-fab')&&css.includes('.map-pin')&&css.includes('.map-dot')&&css.includes('.trip-map__row'),'live-map overlay styling missing');
assert(css.includes('pointer-events:none')&&css.includes('.map-overlay>*{pointer-events:auto}'),'map overlay must pass gestures through to the map while keeping controls interactive');

// --- Enabled GPS: one-shot my-location only, never continuous tracking ----
assert(app.includes('navigator.geolocation.getCurrentPosition'),'My location must use the Geolocation API');
assert(!app.includes('watchPosition'),'continuous location tracking (watchPosition) is forbidden — one-shot my-location only');
assert(headers.includes('geolocation=(self)'),'Permissions-Policy must allow first-party geolocation');
assert(app.includes('data-action="map-locate"')&&app.includes('My location'),'a locate control + My location layer must be present');
assert(!/km from you|minutes away|near you now/i.test(app),'proximity/ETA-from-you copy is forbidden');

// --- Privacy: never send the full itinerary as a multi-point route --------
assert(!app.includes('function tripMapAllPointsUrl(')&&!app.includes('data-action="trip-map-open-all"')&&!app.includes('Open all points in Google Maps'),'removed open-all-points action returned');
assert(!app.includes('https://www.google.com/maps/dir/?api=1&origin=')&&!app.includes('&waypoints='),'full itinerary must not be sent to Google Maps');
assert(app.includes('never shares your full itinerary'),'privacy note (location on-device, itinerary never shared) missing');

// --- Day filter + layers panel --------------------------------------------
assert(app.includes('data-action="trip-map-day"')&&app.includes('data-day=""')&&app.includes('Day ${i + 1}'),'day filter (All + per-day chips) missing');
assert(app.includes('data-action="toggle-map-layers"')&&app.includes('data-action="set-map-layer"')&&app.includes('data-layer="${key}"')&&app.includes('layerRow("route"')&&app.includes('layerRow("saved"')&&app.includes('layerRow("location"'),'layers toggle panel (route/saved/location) missing');

// --- Each place row opens THAT destination in Google Maps -----------------
assert(app.includes('class="trip-map__row-main" data-action="trip-map-navigate"'),'each place row must open its destination in Google Maps');

// --- Directions still use the Google Maps URL scheme (no paid embedded SDK)
assert(app.includes('function openMaps(')&&app.includes('https://www.google.com/maps/search/?api=1&query='),'Navigate must use the Google Maps URL scheme');
assert(!app.includes('maps.googleapis.com')&&!index.includes('maps.googleapis.com'),'embedded/paid Google Maps SDK must not be loaded — URL scheme only');
// CSP: the free MapLibre SDK (jsDelivr) and keyless OpenFreeMap tiles are the
// only new hosts. No paid map SDK (Google/Mapbox) is ever allowed.
assert(!headers.includes('maps.googleapis.com')&&!headers.includes('mapbox'),'CSP must not add a paid map SDK host (Google/Mapbox)');
assert(headers.includes('https://cdn.jsdelivr.net')&&headers.includes('https://tiles.openfreemap.org'),'CSP must allow the MapLibre SDK (jsDelivr) and OpenFreeMap tiles');
assert(headers.includes('worker-src')&&headers.includes('blob:'),'MapLibre needs worker-src blob: in the CSP');
assert(headers.includes('https://scripts.stay22.com')&&headers.includes('https://widgets.stay22.com'),'stay22 map widget hosts must stay allow-listed in the CSP (REL-002: keep the map widget)');

// --- Route wiring ---------------------------------------------------------
const routeContext={};runInNewContext(routeSource,routeContext);const router=routeContext.TriptoRoutes;
assert(router.pathFor('trip-map',null)==='/trip-map'&&router.parsePath('/trip-map').screen==='trip-map','trip-map route not registered');
assert(app.includes('case "trip-map": html = tripMapScreen();'),'render dispatch missing trip-map case');
for(const handler of ['case "open-trip-map":','case "trip-map-day":','case "trip-map-navigate":','case "toggle-map-layers":','case "set-map-layer":','case "map-locate":','case "map-fit":'])assert(app.includes(handler),`action handler missing: ${handler}`);
assert(!app.includes('case "trip-map-open-all":'),'removed trip-map-open-all handler returned');
const openHandler=app.slice(app.indexOf('case "open-trip-map":'),app.indexOf('case "trip-map-day":'));
assert(openHandler.includes('route("trip-map")'),'open-trip-map must open the Trip Map screen');

// --- Server geocode endpoint (keyless Open-Meteo proxy) -------------------
assert(weather.includes('export async function geocodePlace(')&&workerIndex.includes("path === '/api/v1/geocode'")&&workerIndex.includes('geocodePlace(request, env)'),'server geocode endpoint not registered');

console.log('Live interactive Trip Map contract passed.');
