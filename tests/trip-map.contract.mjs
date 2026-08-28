import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(p,'utf8'),assert=(v,m)=>{if(!v)throw new Error(`Trip Map contract failed: ${m}`)};
const app=read('public/mobile-app.js'),css=read('public/mobile-app.css'),index=read('public/index.html'),routeSource=read('public/mobile-routes.js'),workerIndex=read('apps/worker/src/index.ts'),weather=read('apps/worker/src/routes/weather.ts');

// --- Contextual entry, never a permanent tab ------------------------------
const nav=app.slice(app.indexOf('function bottomNav('),app.indexOf('function mobileAlert('));
assert(!nav.toLowerCase().includes('"map"')&&!nav.includes('data-screen="trip-map"')&&!nav.includes('map-trifold'),'a permanent Map tab leaked into the bottom navigation');
assert(!app.includes('Timeline|Map')&&!app.includes('data-action="toggle-map"')&&!app.includes('timeline-map-switch'),'a permanent Timeline/Map switch is forbidden');
const plus=app.slice(app.indexOf('function addSheet('),app.indexOf('function tripMenuSheet('));
assert(!plus.includes('open-trip-map')&&!plus.includes('View Trip Map'),'Trip Map must NOT appear in the + menu — it lives in the trip options menu');
const tripMenu=app.slice(app.indexOf('function tripMenuSheet('),app.indexOf('function weatherScreen('));
assert(tripMenu.includes('canShowTripMap()')&&tripMenu.includes('data-action="open-trip-map"')&&tripMenu.includes('Trip Map'),'Trip Map must appear inside the trip options menu');
assert(tripMenu.includes('data-action="open-weather"')&&tripMenu.indexOf('data-action="open-weather"')<tripMenu.indexOf('data-action="open-trip-map"'),'Trip options menu must render Weather before Trip Map');

// --- Canonical domain model (single source of truth) ----------------------
for(const fn of ['function getMappableTripLocations(','function canShowTripMap(','function locationIsMappable(','function mapPlaceKey(','function mappableBookingRefs(','function orderedTripMapPlaces('])assert(app.includes(fn),`canonical helper missing: ${fn}`);
assert(app.includes('getMappableTripLocations().length >= 2'),'canonical eligibility rule (2+ distinct places) missing');

// --- Eligibility states A-J -----------------------------------------------
// A/B: fewer than 2 distinct places -> graceful fallback, no map.
assert(app.includes('function tripMapScreen(')&&app.includes('does not have enough places to map yet'),'State A/B: too-few-places fallback missing');
// C: 2+ distinct places -> place rows rendered.
assert(app.includes('class="trip-map__row'),'State C: place rows not rendered for eligible trips');
// D: duplicate physical place counts once (dedup by coords/address/name).
assert(app.includes('`c:${geo.lat.toFixed(4)},${geo.lon.toFixed(4)}`')&&app.includes('`a:${geo.address'),'State D: distinct-location dedup key missing');
// E: city-only (no coords, no address) is excluded.
assert(app.includes('return Boolean(geo.hasCoords || geo.address);'),'State E: city-only exclusion rule missing');
// F: cancelled bookings never contribute a place.
assert(app.includes('.filter((t) => !isCancelled(t))')&&app.includes('.filter((s) => !isCancelled(s))')&&app.includes('.filter((it) => !isCancelled(it))'),'State F: cancelled bookings must be excluded');
// G: address-only place resolved through the keyless geocoder (for precise pins).
assert(app.includes('function geocodeMissingTripPlaces(')&&app.includes('/api/v1/geocode?q='),'State G: address geocoding missing');
// H: offline -> no geocode attempt, list still available, Google Maps guarded.
assert(app.includes('if (state.offline) return')&&app.includes('trip-map__offline')&&app.includes('Connect to open Google Maps'),'State H: offline degradation missing');
// I: no mappable tokens -> open-all guarded, nothing silently broken.
assert(app.includes('No mappable places to open yet'),'State I: empty open-all guard missing');
// J: NEXT badge = soonest future booking.
assert(app.includes('function tripMapNextKey(')&&app.includes('trip-map__next')&&app.includes('>NEXT<'),'State J: NEXT badge missing');

// --- Open ALL points in Google Maps (the primary action) ------------------
assert(app.includes('function tripMapAllPointsUrl(')&&app.includes('data-action="trip-map-open-all"')&&app.includes('Open all points in Google Maps'),'open-all-points action missing');
assert(app.includes('https://www.google.com/maps/dir/?api=1&origin=')&&app.includes('&waypoints=')&&app.includes('https://www.google.com/maps/search/?api=1&query='),'multi-point Google Maps URL construction missing');
// Waypoint cap is reported, never silently truncated.
assert(app.includes('built.dropped > 0')&&app.includes('not shown)'),'dropped-stop reporting missing (no silent truncation)');

// --- Day filter -----------------------------------------------------------
assert(app.includes('data-action="trip-map-day"')&&app.includes('All Trip'),'day filter (All Trip + per-day) missing');

// --- Each place row opens THAT destination in Google Maps -----------------
assert(app.includes('class="trip-map__row-main" data-action="trip-map-navigate"')&&app.includes('data-action="trip-map-navigate"'),'each place row must open its destination in Google Maps');

// --- NO GPS anywhere ------------------------------------------------------
for(const src of [['mobile-app.js',app],['mobile-routes.js',routeSource]])assert(!src[1].includes('navigator.geolocation')&&!src[1].includes('getCurrentPosition')&&!src[1].includes('watchPosition'),`GPS API present in ${src[0]} — tripto.to must never request location`);
assert(!/You are here|Near you|km from you|minutes away/i.test(app),'proximity/current-location copy forbidden without a GPS source');

// --- All Google Maps use is via URL only (no embedded/paid SDK, no CSP change)
assert(app.includes('function openMaps(')&&app.includes('https://www.google.com/maps/search/?api=1&query='),'Navigate must use the Google Maps URL scheme');
assert(!app.includes('maps.googleapis.com')&&!index.includes('maps.googleapis.com'),'embedded/paid Google Maps SDK must not be loaded — URL scheme only');
const headers=read('public/_headers');
assert(!headers.includes('googleapis.com')&&!headers.includes('tile')&&!headers.includes('mapbox')&&!headers.includes('openstreetmap'),'CSP must not be loosened for external map hosts');

// --- Route wiring ---------------------------------------------------------
const routeContext={};runInNewContext(routeSource,routeContext);const router=routeContext.TriptoRoutes;
assert(router.pathFor('trip-map',null)==='/trip-map'&&router.parsePath('/trip-map').screen==='trip-map','trip-map route not registered');
assert(app.includes('case "trip-map": html = tripMapScreen();'),'render dispatch missing trip-map case');
for(const handler of ['case "open-trip-map":','case "trip-map-day":','case "trip-map-open-all":','case "trip-map-navigate":'])assert(app.includes(handler),`action handler missing: ${handler}`);
// The + menu option opens the Trip Map screen (separate destinations), not a combined route.
const openHandler=app.slice(app.indexOf('case "open-trip-map":'),app.indexOf('case "trip-map-day":'));
assert(openHandler.includes('route("trip-map")'),'open-trip-map must open the Trip Map screen');

// --- Server geocode endpoint (keyless Open-Meteo proxy) -------------------
assert(weather.includes('export async function geocodePlace(')&&workerIndex.includes("path === '/api/v1/geocode'")&&workerIndex.includes('geocodePlace(request, env)'),'server geocode endpoint not registered');

// --- Styling present ------------------------------------------------------
assert(css.includes('.trip-map__open')&&css.includes('.trip-map__row')&&css.includes('.trip-map__offline'),'Trip Map styling missing');

console.log('Contextual Trip Map contract passed.');
