import {
  airlineDirectoryCount,
  allAirlines,
  byIata,
  byIcao,
  findAirline,
  isSafeStatusUrl,
  normalizeCarrierCode,
  parseFlightDesignator,
  resolveFlightStatus,
} from '../../packages/airline-directory/src/index.ts';

const assert = {
  equal(actual: unknown, expected: unknown, label: string) {
    if (actual !== expected) throw new Error(`${label}: ${String(actual)} !== ${String(expected)}`);
  },
  ok(value: unknown, label: string) { if (!value) throw new Error(label); },
  null(value: unknown, label: string) { if (value !== null) throw new Error(`${label}: expected null, got ${String(value)}`); },
};

// --- Deterministic normalization: the four spellings must be identical. ---
for (const spelling of ['BA286', 'BA 286', 'ba286', 'BA-286', ' ba 286 ']) {
  const parsed = parseFlightDesignator(spelling);
  assert.ok(parsed, `parse ${spelling}`);
  assert.equal(parsed!.carrier, 'BA', `carrier ${spelling}`);
  assert.equal(parsed!.number, '286', `number ${spelling}`);
}
assert.equal(normalizeCarrierCode('ba-6e'), 'BA6E', 'normalize strips punctuation');

// Alphanumeric carrier codes (W6, 5J, 6E) parse correctly.
assert.equal(parseFlightDesignator('W6 2202')!.carrier, 'W6', 'alnum carrier W6');
assert.equal(parseFlightDesignator('6E533')!.carrier, '6E', 'alnum carrier 6E');
assert.equal(parseFlightDesignator('BA286A')!.suffix, 'A', 'operational suffix preserved');

// No fuzzy matching / no guessing on garbage input.
assert.null(parseFlightDesignator('hello'), 'garbage does not parse');
assert.null(parseFlightDesignator(''), 'empty does not parse');
assert.null(findAirline('ZZ'), 'unknown IATA returns null');
assert.null(findAirline('ZZZZ'), 'over-long code returns null');

// --- Indexes ---
assert.ok(byIata.get('BA'), 'byIata index populated');
assert.ok(byIcao.get('BAW'), 'byIcao index populated');
assert.equal(byIata.get('BA')!.name, 'British Airways', 'IATA lookup name');
assert.equal(findAirline('BAW')!.name, 'British Airways', 'ICAO lookup name');

// --- Resolution level 1: deep-link (only when a template exists). ---
// No airline currently ships a template, so this proves we never fabricate one.
for (const airline of allAirlines()) {
  assert.ok(!airline.statusUrlTemplate || airline.statusUrlTemplate.startsWith('https://'), `template safe: ${airline.name}`);
}

// --- Resolution level 2: dedicated status page + copy designator. ---
const united = resolveFlightStatus({ marketingCarrier: 'UA', flightNumber: 'UA 100' });
assert.ok(united, 'UA resolves');
assert.equal(united!.level, 'status-page', 'UA has a dedicated status page');
assert.equal(united!.prefilled, false, 'status page is not prefilled');
assert.equal(united!.copyDesignator, 'UA100', 'copy designator provided for status page');
assert.ok(isSafeStatusUrl(united!.url), 'UA status url is https');

// --- Resolution level 3: homepage fallback (airline known, no status page). ---
const spirit = resolveFlightStatus({ marketingCarrier: 'NK', flightNumber: '123' });
assert.ok(spirit, 'NK resolves');
assert.equal(spirit!.level, 'homepage', 'NK falls back to homepage');
assert.equal(spirit!.url, 'https://www.spirit.com/', 'NK homepage url');

// --- No random fallback: an unknown carrier returns null, never a tracker. ---
assert.null(resolveFlightStatus({ marketingCarrier: 'ZZ', flightNumber: '999' }), 'unknown carrier -> null');
assert.null(resolveFlightStatus({ flightNumber: 'ZZ999' }), 'unknown carrier in number -> null');

// --- Codeshare: operating carrier wins over marketing carrier. ---
// Marketed as AA (American) but operated by BA (British Airways) -> resolve to BA.
const codeshare = resolveFlightStatus({ marketingCarrier: 'AA', operatingCarrier: 'BA', flightNumber: 'AA 6789' });
assert.ok(codeshare, 'codeshare resolves');
assert.equal(codeshare!.airline.iata, 'BA', 'operating carrier BA wins');
assert.equal(codeshare!.matchedBy, 'operating', 'matchedBy operating');
// If the operator is unknown, fall through to the marketing carrier.
const codeshareFallback = resolveFlightStatus({ marketingCarrier: 'AA', operatingCarrier: 'ZZ', flightNumber: 'AA 100' });
assert.ok(codeshareFallback, 'codeshare marketing fallback resolves');
assert.equal(codeshareFallback!.airline.iata, 'AA', 'marketing carrier AA used when operator unknown');
assert.equal(codeshareFallback!.matchedBy, 'marketing', 'matchedBy marketing');

// --- Flight number carries the code when no explicit carrier is given. ---
const fromNumber = resolveFlightStatus({ flightNumber: 'DL 202' });
assert.ok(fromNumber, 'DL from number resolves');
assert.equal(fromNumber!.airline.iata, 'DL', 'carrier parsed from flight number');

// --- URL safety gate rejects dangerous schemes. ---
assert.equal(isSafeStatusUrl('javascript:alert(1)'), false, 'javascript: rejected');
assert.equal(isSafeStatusUrl('data:text/html,x'), false, 'data: rejected');
assert.equal(isSafeStatusUrl('file:///etc/passwd'), false, 'file: rejected');
assert.equal(isSafeStatusUrl('intent://x'), false, 'intent: rejected');
assert.equal(isSafeStatusUrl('http://insecure.example/'), false, 'http: rejected (https only)');
assert.equal(isSafeStatusUrl('https://www.aa.com/'), true, 'https accepted');

// --- Every shipped URL is airline-owned and safe; no aggregators. ---
const BANNED = ['google.', 'flightaware', 'flightradar24', 'flightstats', 'kayak', 'expedia', 'wikipedia', 'facebook', 'bing.'];
for (const airline of allAirlines()) {
  const urls = [airline.officialWebsiteUrl, airline.flightStatusUrl, airline.statusUrlTemplate].filter(Boolean) as string[];
  for (const url of urls) {
    assert.ok(isSafeStatusUrl(url), `safe url: ${airline.name} ${url}`);
    const host = new URL(url).hostname.toLowerCase();
    for (const banned of BANNED) {
      assert.ok(!host.includes(banned), `no aggregator (${banned}) for ${airline.name}: ${url}`);
    }
    // Status URLs must live on the airline's own registrable domain.
    assert.ok(host.endsWith(airline.officialDomain), `own-domain url for ${airline.name}: ${host} vs ${airline.officialDomain}`);
  }
}

// --- Regional coverage sanity: majors from every region are present. ---
const regionCheck: Array<[string, string]> = [
  ['AA', 'North America'], ['AC', 'North America'],
  ['BA', 'Europe'], ['LH', 'Europe'], ['AF', 'Europe'],
  ['EK', 'Middle East'], ['QR', 'Middle East'],
  ['SQ', 'Asia'], ['NH', 'Asia'], ['AI', 'Asia'],
  ['QF', 'Oceania'], ['NZ', 'Oceania'],
  ['ET', 'Africa'], ['SA', 'Africa'],
  ['LA', 'South America'], ['AV', 'South America'],
];
for (const [code, region] of regionCheck) {
  assert.ok(findAirline(code), `regional coverage ${region}: ${code}`);
}

assert.ok(airlineDirectoryCount() >= 80, `directory has meaningful coverage (${airlineDirectoryCount()})`);

console.log(`Airline directory scenarios passed: ${airlineDirectoryCount()} airlines, deterministic normalization, codeshare + 3-level resolution, no aggregators, URL safety.`);
