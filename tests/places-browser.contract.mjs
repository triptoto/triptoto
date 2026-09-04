import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('public/mobile-app.js', 'utf8');
const css = readFileSync('public/mobile-app.css', 'utf8');
const sw = readFileSync('public/sw.js', 'utf8');
const provider = readFileSync('packages/places/src/browser-provider.ts', 'utf8');
const worker = readFileSync('packages/places/src/worker.ts', 'utf8');
const model = readFileSync('packages/places/src/model.ts', 'utf8');

for (const method of ['searchPlaces', 'getPlaceById', 'resolveAirport', 'resolveTimezone']) {
  assert.match(model, new RegExp(`${method}\\(`));
}
assert.match(provider, /BrowserOfflinePlacesProvider/);
assert.match(provider, /OnlinePlacesProvider/);
assert.match(provider, /new Worker\(`\/places-search-worker\.js/);
assert.match(worker, /fetch\(PLACES_DATA_URL, \{ cache: 'force-cache' \}\)/);
assert.doesNotMatch(app, /googleapis\.com\/maps|maps\.googleapis|api\.mapbox|places\.hereapi|apple\.com\/maps\/search/i);

assert.match(app, /setAttribute\("role", "combobox"\)/);
assert.match(app, /setAttribute\("aria-autocomplete", "list"\)/);
assert.match(app, /setAttribute\("role", "listbox"\)/);
assert.match(app, /role="option"/);
assert.match(app, /aria-activedescendant/);
assert.match(app, /event\.key === "ArrowDown"/);
assert.match(app, /event\.key === "ArrowUp"/);
assert.match(app, /event\.key === "Escape"/);
assert.match(app, /event\.key === "Enter"/);
assert.match(app, /Try again/);
assert.match(app, /Enter manually/);
assert.match(app, /if \(moduleLoaders\[src\]\) return moduleLoaders\[src\]/);
assert.match(app, /el\.onerror = \(\) => \{[\s\S]*?el\.remove\(\);[\s\S]*?delete moduleLoaders\[src\]/);
assert.match(app, /Loaded \$\{src\} without \$\{globalName\}/);
assert.match(css, /\.place-option\s*\{[\s\S]*?min-height:\s*56px/);
assert.match(css, /\.place-empty button\s*\{[\s\S]*?min-height:\s*44px/);
assert.match(css, /\.place-option:focus-visible/);

assert.match(app, /name="destinationPlace"/);
assert.match(app, /data-place-types="city,airport" data-place-preferred="city"/);
assert.match(app, /name="fromLocationPlace"/);
assert.match(app, /name="toLocationPlace"/);
assert.match(app, /data-place-types="airport" data-place-preferred="airport"/);
assert.match(app, /function placeTimezoneForInput\(input, kind = "flight"\)/);
assert.match(app, /selectedPlaceForInput\(input\)\?\.timezone/);
assert.match(app, /placeId:\s*place\.id/);
assert.match(app, /countryName:\s*place\.countryName/);
assert.match(app, /timezone:\s*place\.timezone/);

assert.match(sw, /const PLACES_CACHE='tripto-places-2026-08-26'/);
assert.match(sw, /key\.startsWith\('tripto-places-'\)/);
assert.match(sw, /cache\.match\(request,\{ignoreSearch:true\}\)/);
const shellAssets = sw.match(/const ASSETS=\[(.*?)\];/s)?.[1] || '';
assert.doesNotMatch(shellAssets, /places-provider|places-search-worker|places-2026-08-26/);
assert.match(sw, /PLACES_PATHS\.has\(url\.pathname\)/);

console.log('Offline places browser, privacy, accessibility, form, and lazy-cache contracts passed.');
