// @ts-nocheck -- executed by tsx; this repository intentionally has no Node type package.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OfflinePlacesProvider } from '../packages/places/src/providers.ts';
import type { NormalizedPlace } from '../packages/places/src/model.ts';
import type { CompactPlacesData } from '../packages/places/src/search.ts';

const data = JSON.parse(readFileSync(new URL('../public/data/places-2026-08-26.json', import.meta.url), 'utf8')) as CompactPlacesData;
const provider = new OfflinePlacesProvider(data);

async function results(query: string, types?: Array<'city' | 'airport'>): Promise<NormalizedPlace[]> {
  return provider.searchPlaces(query, { types, limit: 10 });
}

async function includes(query: string, predicate: (place: NormalizedPlace) => boolean, types?: Array<'city' | 'airport'>) {
  assert.ok((await results(query, types)).some(predicate), `${query} should return the expected place`);
}

assert.equal(data.version, '2026-08-26');
assert.ok(data.cities >= 30_000, 'significant worldwide cities are present');
assert.ok(data.airports >= 3_500, 'useful scheduled passenger airports are present');

assert.equal((await results('Paris'))[0]?.displayName, 'Paris, France');
await includes('Paris', (place) => place.iata === 'CDG');
await includes('Paris', (place) => place.iata === 'ORY');
assert.equal((await results('cdg', ['airport']))[0]?.iata, 'CDG');
assert.equal((await results('ORY', ['airport']))[0]?.iata, 'ORY');
assert.equal((await results('tlv'))[0]?.iata, 'TLV');
await includes('Ben Gurion', (place) => place.iata === 'TLV');
assert.equal((await results('Tel Aviv'))[0]?.type, 'city');
assert.equal((await results('Rome'))[0]?.timezone, 'Europe/Rome');
assert.equal((await results('fco', ['airport']))[0]?.iata, 'FCO');
await includes('New York', (place) => place.type === 'city' && place.countryCode === 'US');
await includes('New York', (place) => place.iata === 'JFK');
await includes('New York', (place) => place.iata === 'LGA');
await includes('New York', (place) => place.iata === 'EWR');
assert.equal((await results('JFK', ['airport']))[0]?.iata, 'JFK');
assert.equal((await results('LHR', ['airport']))[0]?.iata, 'LHR');
assert.equal((await results('London'))[0]?.displayName, 'London, United Kingdom');
assert.equal((await results('Tokyo'))[0]?.displayName, 'Tokyo, Japan');
assert.equal((await results('HND', ['airport']))[0]?.iata, 'HND');
assert.equal((await results('Sydney'))[0]?.countryCode, 'AU');
assert.equal((await results('SIN'))[0]?.iata, 'SIN');
assert.equal((await results('Dubai'))[0]?.type, 'city');
assert.equal((await results('DXB', ['airport']))[0]?.iata, 'DXB');

assert.equal((await results('são paulo'))[0]?.name, 'São Paulo', 'accented names normalize safely');
assert.equal((await results('TEL AVIV'))[0]?.name, 'Tel Aviv', 'search is case-insensitive');
await includes('Barselona', (place) => place.name === 'Barcelona' && place.countryCode === 'ES');
await includes('Franfurt', (place) => place.name === 'Frankfurt am Main');
assert.deepEqual(await results(''), []);
assert.deepEqual(await results('x'), []);
assert.deepEqual(await results('notarealcityzzzz'), []);

const springfields = (await results('Springfield')).filter((place) => place.name === 'Springfield');
assert.ok(springfields.length >= 2);
assert.ok(springfields.every((place) => place.region && place.countryName));
assert.equal(new Set(springfields.map((place) => place.displayName)).size, springfields.length);

const tlv = await provider.resolveAirport('tlv');
assert.equal(tlv?.id, 'airport:iata:TLV');
assert.equal(await provider.resolveTimezone(tlv!), 'Asia/Jerusalem');
assert.equal((await provider.getPlaceById('airport:iata:JFK'))?.timezone, 'America/New_York');
assert.equal(await provider.resolveAirport('ZZZ'), null);

const performanceQueries = ['par', 'london', 'new york', 'ben gurion', 'tokyo', 'franfurt'];
const timings: number[] = [];
for (const query of performanceQueries) {
  const started = performance.now();
  await provider.searchPlaces(query, { limit: 8 });
  timings.push(performance.now() - started);
}
const maxLatency = Math.max(...timings);
assert.ok(maxLatency < 100, `warm search latency ${maxLatency.toFixed(1)}ms exceeds the 100ms target`);
console.log(`Offline places scenarios passed (${data.cities} cities, ${data.airports} airports; max warm search ${maxLatency.toFixed(1)}ms).`);
