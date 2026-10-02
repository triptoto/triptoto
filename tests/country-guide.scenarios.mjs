import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as guide from '../packages/country-guide/src/index.ts';
import { validateDataset, validateOverrides, duplicateJsonKeys } from '../packages/country-guide/src/validate.ts';
import { FIELD_OWNERSHIP, DERIVED_FIELDS, GROUPS } from '../packages/country-guide/src/schema.ts';

// Country Guide: one canonical record per ISO 3166-1 code, no duplicated or
// derived fields stored, honest provenance, and the shared comparison module
// wired into the app. Run with: node --import tsx/esm tests/country-guide.scenarios.mjs
const raw = readFileSync('packages/country-guide/data/countries.generated.json', 'utf8');
const data = JSON.parse(raw);
const iso = JSON.parse(readFileSync('packages/country-guide/data/iso3166-1.json', 'utf8'));
const overrides = JSON.parse(readFileSync('packages/country-guide/data/country-overrides.json', 'utf8'));

// ---- coverage and duplicates
assert.equal(iso.codes.length, 249, 'ISO 3166-1 list must have 249 entries');
assert.equal(new Set(iso.codes).size, 249, 'ISO list has duplicate codes');
const codes = Object.keys(data.countries);
assert.equal(codes.length, 249, `dataset must cover 249 countries (has ${codes.length})`);
assert.deepEqual([...codes].sort(), [...iso.codes].sort(), 'dataset codes must equal the ISO list');
assert.deepEqual(duplicateJsonKeys(raw), [], 'duplicate JSON keys (duplicate country records or fields)');
const problems = validateDataset(data, raw);
assert.deepEqual(problems, [], `dataset validation problems:\n${problems.join('\n')}`);
assert.deepEqual(validateOverrides(overrides.overrides, new Set(iso.codes)), [], 'override validation problems');

// ---- canonical ownership: each field lives in exactly one group, nothing derived is stored
const owners = new Map();
for (const group of GROUPS) for (const field of FIELD_OWNERSHIP[group]) {
  assert.ok(!owners.has(field), `field ${field} owned by ${owners.get(field)} and ${group}`);
  owners.set(field, group);
}
for (const [cc, record] of Object.entries(data.countries)) {
  for (const key of Object.keys(record)) assert.ok(GROUPS.includes(key) || key === '_meta', `${cc}: unknown group ${key}`);
  for (const derived of DERIVED_FIELDS) assert.ok(!JSON.stringify(record).includes(`"${derived}":`), `${cc}: derived field ${derived} stored`);
}

// ---- provenance: every group has a status, every source has a licence; nothing high-risk is marked verified without a source
for (const group of GROUPS) assert.ok(data.groups[group]?.status, `group ${group} has no status`);
for (const source of data.sources) assert.ok(source.license && source.url, `source ${source.id} lacks licence/url`);
assert.notEqual(data.groups.emergency.status, 'verified', 'emergency numbers are untyped and must not claim verified');
if (!codes.some((cc) => data.countries[cc].electricity)) assert.equal(data.groups.electricity.status, 'unavailable', 'no electricity data must be marked unavailable');

// ---- edge-case matrix
const C = (cc) => guide.getCountry(cc);
assert.equal(C('GB').driving.drivingSide, 'left');
assert.equal(C('GB').measurements.roadSpeedUnit, 'mph');
assert.equal(C('GB').measurements.distanceUnit, 'mile');
assert.equal(C('GB').measurements.temperatureUnit, 'celsius');
assert.equal(guide.clockPreference('US'), '12h');
assert.equal(C('US').measurements.temperatureUnit, 'fahrenheit');
assert.ok(guide.sharedCallingCodeCountries('US').includes('CA'), 'NANP +1 shared with Canada');
assert.ok(guide.sharedCallingCodeCountries('PR').includes('US'), 'Puerto Rico in NANP');
assert.equal(C('PR').measurements.roadSpeedUnit, 'mph');
assert.equal(C('PR').measurements.temperatureUnit, 'fahrenheit');
assert.equal(guide.primaryCurrency('PR'), 'USD');
assert.deepEqual(C('IN').time.timeZones, ['Asia/Kolkata']);
assert.equal(guide.primaryCurrency('IL'), 'ILS');
assert.equal(guide.primaryCurrency('IT'), 'EUR');
assert.equal(guide.primaryCurrency('CH'), 'CHF');
assert.equal(guide.primaryCurrency('HK'), 'HKD');
assert.equal(guide.primaryCurrency('FO'), 'DKK');
assert.equal(guide.primaryCurrency('GL'), 'DKK');
assert.equal(guide.primaryCurrency('PF'), 'XPF');
assert.equal(guide.primaryCurrency('GU'), 'USD');
assert.equal(C('JP').driving.drivingSide, 'left');
assert.equal(C('ZA').driving.drivingSide, 'left');
assert.equal(C('TH').driving.drivingSide, 'left');
assert.equal(C('AU').driving.drivingSide, 'left');
assert.equal(C('NZ').driving.drivingSide, 'left');
assert.equal(C('ID').driving.drivingSide, 'left');
assert.equal(C('SG').driving.drivingSide, 'left');
assert.equal(C('FR').driving.drivingSide, 'right');
assert.equal(C('DE').formats.decimalSeparator, ',');
assert.equal(C('CN').telecom.callingCodes[0], '86');
assert.equal(C('RU').telecom.callingCodes[0], '7');
assert.equal(C('AE').telecom.callingCodes[0], '971');
assert.ok(C('AU').emergency.numbers.includes('000'), 'Australia emergency 000');
assert.ok(C('US').emergency.numbers.includes('911'), 'US emergency 911');
assert.ok(C('IT').emergency.numbers.includes('112'), 'Italy emergency 112');
for (const cc of ['US', 'RU', 'AU', 'BR', 'MX', 'ID', 'CA', 'PF', 'GL']) assert.ok(guide.isMultiZone(cc), `${cc} must be multi-zone`);
for (const cc of ['IT', 'IL', 'JP', 'IN', 'SG', 'TH', 'AE', 'HK', 'CH', 'GB']) assert.ok(!guide.isMultiZone(cc), `${cc} must be single-zone`);
assert.equal(guide.singleTimeZone('US'), null, 'multi-zone countries never get a guessed zone');
assert.equal(guide.flagEmoji('IT'), '\u{1F1EE}\u{1F1F9}');

// ---- comparison module
assert.equal(guide.comparePowerCompatibility('US', 'IT').result, 'unknown', 'no plug data must compare as unknown');
const usIt = guide.compareCountries('US', 'IT').map((d) => d.id);
for (const id of ['currency', 'speed', 'temperature', 'date', 'clock']) assert.ok(usIt.includes(id), `US→IT must report ${id}`);
assert.ok(!usIt.includes('driving'), 'US and IT both drive on the right');
assert.ok(!usIt.includes('power'), 'unknown power is never reported as a difference');
assert.ok(guide.compareCountries('IT', 'GB').some((d) => d.id === 'driving'), 'IT→GB driving side differs');
assert.deepEqual(guide.compareCountries('IT', 'IT'), [], 'same country has no differences');
assert.deepEqual(guide.compareCountries('', 'IT'), [], 'no home country, no comparison');
const time = guide.compareCountries('IT', 'JP', { at: new Date('2026-01-15T12:00:00Z') }).find((d) => d.id === 'time');
assert.equal(time?.minutes, 480, 'Rome → Tokyo is +8 h in January');
assert.deepEqual(guide.preparationNotes('IT', ['GB', 'FR']).find((n) => n.id === 'driving-side')?.countries, ['GB']);
assert.deepEqual(guide.preparationNotes('', ['GB']), [], 'no preparation notes without a home country');

// ---- multi-country trips: dedupe, first appearance, merged ranges, transit
const trip = guide.resolveTripCountries([
  { iso2: 'it', start: '2026-11-01', end: '2026-11-03' },
  { iso2: 'FR', start: '2026-11-04', end: '2026-11-06' },
  { iso2: 'IT', start: '2026-11-07', end: '2026-11-09' },
  { iso2: 'DE', start: '2026-11-04', transit: true },
  { iso2: 'ZZ', start: '2026-11-02' },
]);
assert.deepEqual(trip.map((c) => c.iso2), ['IT', 'FR'], 'trip countries deduped, ordered, transit and invalid dropped');
assert.equal(new Set(trip.map((c) => c.iso2)).size, trip.length, 'duplicate countries in trip UI');
assert.equal(trip[0].start, '2026-11-01');
assert.equal(trip[0].end, '2026-11-09');
assert.deepEqual(guide.resolveTripCountries([{ iso2: 'DE', transit: true }]).map((c) => c.iso2), ['DE'], 'transit-only trip keeps its country');

// ---- browser bundle
const bundle = readFileSync('public/country-guide.js', 'utf8');
const context = { globalThis: {}, Intl, Date };
vm.createContext(context);
vm.runInContext(bundle, context);
const browser = context.globalThis.TriptoCountryGuide;
assert.ok(browser, 'TriptoCountryGuide global missing');
assert.equal(browser.size, 249);
assert.equal(browser.datasetVersion, data.datasetVersion, 'public/country-guide.js is stale: run npm run build:country-guide');
assert.equal(browser.primaryCurrency('JP'), 'JPY');

// ---- app wiring
const app = readFileSync('public/mobile-app.js', 'utf8');
const index = readFileSync('public/index.html', 'utf8');
const sw = readFileSync('public/sw.js', 'utf8');
const routes = readFileSync('public/mobile-routes.js', 'utf8');
const site = JSON.parse(readFileSync('seo/site.json', 'utf8'));
assert.ok(index.indexOf('/country-guide.js') > 0 && index.indexOf('/country-guide.js') < index.indexOf('/mobile-app.min.js'), 'country-guide.js must load before the app');
assert.ok(/SHELL_PATHS=new Set\(\[[^\]]*'\/country-guide\.js'/.test(sw) && /const CORE=\[[^\]]*'\/country-guide\.js'/.test(sw), 'country-guide.js must be an offline core asset');
assert.ok(routes.includes('"country-guide": "/country-guide"'), 'country-guide route missing');
assert.ok(site.appRoutes.includes('country-guide'), 'country-guide must be a private app route');
assert.ok(app.includes('data-action="open-country-guide"'), 'Trip options must link the Country Guide');
assert.ok(app.includes('case "country-guide": html = countryGuideScreen(); break;'), 'render switch missing');
assert.ok(app.includes('"country-guide": "trip-options"'), 'Back fallback missing');
assert.ok(/"country-guide": \{ title: "About Country Guide"/.test(app), 'page help missing');
assert.ok(!app.includes('COUNTRY_CURRENCY'), 'per-country currency map duplicated in the app');
for (const action of ['open-currency', 'open-tax-free', 'open-trip-map']) assert.ok(app.slice(app.indexOf('function countryGuideScreen'), app.indexOf('// ===== Free trip collaboration')).includes(`data-action="${action}"`), `guide must link ${action}`);
const homeFn = app.slice(app.indexOf('function homeCountry()'), app.indexOf('function setHomeCountry('));
assert.ok(!/navigator\.(language|geolocation)|timeZone/.test(homeFn), 'home country must never be inferred');

console.log(`Country guide contract passed: ${codes.length} countries, 0 duplicate records, 0 duplicate fields, ${problems.length} validation problems.`);
