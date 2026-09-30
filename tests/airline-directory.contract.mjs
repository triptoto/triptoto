import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Guardrail on the shipped offline bundle: the client global must exist, resolve
// deterministically, only ever emit airline-owned https URLs, and never fabricate
// a tracker fallback.
const source = readFileSync('public/airline-directory.js', 'utf8');
const context = { globalThis: {}, URL };
vm.createContext(context);
vm.runInContext(source, context);
const dir = context.globalThis.TriptoAirlineDirectory;

assert.ok(dir, 'airline directory browser global was not exported');
assert.ok(dir.size >= 80, `airline directory is unexpectedly small (${dir.size})`);

// Deterministic normalization across spellings.
const spellings = ['BA286', 'BA 286', 'ba286', 'BA-286'].map((s) => dir.parseFlightDesignator(s));
for (const parsed of spellings) {
  assert.equal(parsed.carrier, 'BA', 'carrier normalized');
  assert.equal(parsed.number, '286', 'number normalized');
}

// Known carrier resolves; unknown carrier returns null (no random fallback).
const ua = dir.resolveFlightStatus({ marketingCarrier: 'UA', flightNumber: 'UA100' });
assert.ok(ua && ua.url.startsWith('https://'), 'UA resolves to https url');
assert.equal(dir.resolveFlightStatus({ marketingCarrier: 'ZZ', flightNumber: '1' }), null, 'unknown carrier returns null');

// Codeshare: operating carrier wins.
const cs = dir.resolveFlightStatus({ marketingCarrier: 'AA', operatingCarrier: 'BA', flightNumber: 'AA6789' });
assert.equal(cs.airline.iata, 'BA', 'operating carrier wins on codeshare');

// URL safety gate.
assert.equal(dir.isSafeStatusUrl('javascript:alert(1)'), false, 'javascript scheme rejected');
assert.equal(dir.isSafeStatusUrl('http://x/'), false, 'http rejected (https only)');
assert.equal(dir.isSafeStatusUrl('https://www.aa.com/'), true, 'https accepted');

// Every active airline exposes an airline-owned https destination; no aggregators.
const BANNED = ['google.', 'flightaware', 'flightradar24', 'flightstats', 'kayak', 'expedia', 'wikipedia'];
for (const airline of dir.activeAirlines()) {
  assert.ok(dir.isSafeStatusUrl(airline.officialWebsiteUrl), `homepage safe: ${airline.name}`);
  const urls = [airline.officialWebsiteUrl, airline.flightStatusUrl].filter(Boolean);
  for (const url of urls) {
    const host = new context.URL(url).hostname.toLowerCase();
    assert.ok(host.endsWith(airline.officialDomain), `own-domain: ${airline.name}`);
    for (const banned of BANNED) assert.ok(!host.includes(banned), `no aggregator ${banned}: ${airline.name}`);
  }
}

console.log(`Airline directory contract passed: ${dir.size} airlines, airline-owned https only, deterministic + codeshare resolution, no aggregators.`);
