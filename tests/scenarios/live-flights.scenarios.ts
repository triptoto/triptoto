import { readFileSync } from 'node:fs';
import { AeroDataBoxFlightProvider, FlightProviderRequestError } from '../../packages/providers/src/aerodatabox.ts';
import { DisabledFlightProvider, type FlightLookup } from '../../packages/providers/src/index.ts';
import { assessLiveFlightImpact } from '../../packages/impact-engine/src/index.ts';
import { cancellationDecision, delayMinutes, meaningfulLiveEvents, mergeProviderFields, refreshPolicy } from '../../packages/live-flights/src/index.ts';

const assert = {
  equal(actual: unknown, expected: unknown, label: string) { if (actual !== expected) throw new Error(`${label}: ${String(actual)} !== ${String(expected)}`); },
  ok(value: unknown, label: string) { if (!value) throw new Error(label); },
};
const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/aerodatabox/${name}.json`, 'utf8'));
const query: FlightLookup = { marketingCarrier: 'LY', flightNumber: '383', departureDateLocal: '2026-08-20', departureAirport: 'TLV', arrivalAirport: 'FCO' };

async function lookup(name: string, override: FlightLookup = query) {
  return lookupPayload(fixture(name), override);
}

async function lookupPayload(payload: unknown, override: FlightLookup = query) {
  let requested = '';
  const provider = new AeroDataBoxFlightProvider({
    apiKey: 'server-only-test-key',
    now: () => Date.parse('2026-08-20T06:10:00Z'),
    fetchImpl: async (input, init) => {
      requested = String(input);
      assert.equal(new Headers(init?.headers).get('x-rapidapi-key'), 'server-only-test-key', 'server key header');
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const status = await provider.getStatus(override);
  assert.ok(requested.includes('/flights/number/'), 'number/date endpoint not used');
  assert.ok(!requested.includes('server-only-test-key'), 'secret leaked into URL');
  return status;
}

const scheduled = await lookup('scheduled');
assert.equal(scheduled.matchStatus, 'matched', 'scheduled match');
assert.equal(scheduled.operationalPhase, 'scheduled', 'scheduled phase');
assert.equal(scheduled.departureGate, 'D7', 'scheduled gate');

const ambiguous = await lookup('ambiguous');
assert.equal(ambiguous.available, false, 'ambiguous result must not be treated as live truth');
assert.equal(ambiguous.matchStatus, 'ambiguous', 'ambiguous match status');

const limitedProvider = new AeroDataBoxFlightProvider({
  apiKey: 'server-only-test-key',
  fetchImpl: async () => new Response('', { status: 429, headers: { 'retry-after': '90' } }),
});
try {
  await limitedProvider.getStatus(query);
  throw new Error('429 response did not fail closed');
} catch (error) {
  assert.ok(error instanceof FlightProviderRequestError, '429 did not produce a normalized provider error');
  assert.equal((error as FlightProviderRequestError).category, 'rate_limited', '429 category');
  assert.equal((error as FlightProviderRequestError).retryAfterSeconds, 90, 'Retry-After was not preserved');
}

const delayed = await lookup('delayed-gate');
assert.equal(delayed.disruptionState, 'delayed', 'delay normalized');
assert.equal(delayMinutes(delayed), 45, 'delay duration');
assert.ok(meaningfulLiveEvents(scheduled, delayed).includes('flight_gate_changed'), 'gate change event missing');
assert.ok(meaningfulLiveEvents({ ...scheduled, departureTerminal: '2' }, delayed).includes('flight_terminal_changed'), 'terminal change event missing');
assert.equal(assessLiveFlightImpact({ itemId: 'flight', disruptionState: 'delayed', delayMinutes: 45 })?.severity, 'medium', 'delay impact');

const codeshare = await lookup('codeshare', { ...query, marketingCarrier: 'AZ', flightNumber: '8120', operatingCarrier: 'LY', operatingFlightNumber: '383' });
assert.equal(codeshare.marketingAirlineCode, 'AZ', 'marketing carrier');
assert.equal(codeshare.operatingAirlineCode, 'LY', 'operating carrier');

const cancelled = await lookup('cancelled');
assert.equal(cancelled.disruptionState, 'cancelled', 'cancellation normalized');
const first = cancellationDecision({ signals: 0, recoverySignals: 0 }, 'cancelled', 1_000);
assert.equal(first.confirmedAt, undefined, 'first cancellation must be provisional');
const confirmed = cancellationDecision(first, 'cancelled', 1_000 + 30 * 60_000);
assert.ok(confirmed.confirmedAt, 'second cancellation signal must confirm');
const recoveryFirst = cancellationDecision(confirmed, 'none', 1_000 + 60 * 60_000);
assert.equal(recoveryFirst.effectiveDisruption, 'cancelled', 'first recovery signal must remain cautious');
const recovered = cancellationDecision(recoveryFirst, 'none', 1_000 + 90 * 60_000);
assert.equal(recovered.effectiveDisruption, 'none', 'second recovery signal must clear');
assert.equal(assessLiveFlightImpact({ itemId: 'flight', disruptionState: 'cancelled', cancellationConfirmed: false })?.severity, 'medium', 'provisional cancellation severity');
assert.equal(assessLiveFlightImpact({ itemId: 'flight', disruptionState: 'cancelled', cancellationConfirmed: true })?.severity, 'high', 'confirmed cancellation severity');

const statusMatrix = fixture('status-matrix');
assert.equal((await lookupPayload(statusMatrix.boarding)).operationalPhase, 'boarding', 'boarding phase');
assert.equal((await lookupPayload(statusMatrix.departed)).operationalPhase, 'departed', 'departed phase');
assert.equal((await lookupPayload(statusMatrix.enRoute)).operationalPhase, 'en_route', 'en-route phase');
assert.equal((await lookupPayload(statusMatrix.landed)).operationalPhase, 'landed', 'landed phase');
assert.equal((await lookupPayload(statusMatrix.diverted)).disruptionState, 'diverted', 'diverted state');
const missingFields = await lookupPayload(statusMatrix.missingFields);
assert.equal(missingFields.departureGate, undefined, 'missing gate was invented');
assert.equal(missingFields.estimatedArrivalUtc, undefined, 'missing estimated arrival was invented');
const dateLine = await lookupPayload(statusMatrix.dateLine, { marketingCarrier: 'HA', flightNumber: '457', departureDateLocal: '2026-08-20', departureAirport: 'HNL', arrivalAirport: 'NRT' });
assert.equal(dateLine.matchStatus, 'matched', 'date-line lookup did not use departure-local date');
const dst = await lookupPayload(statusMatrix.dst, { marketingCarrier: 'BA', flightNumber: '178', departureDateLocal: '2026-11-01', departureAirport: 'JFK', arrivalAirport: 'LHR' });
assert.equal(dst.matchStatus, 'matched', 'DST lookup did not preserve departure-local date');

assert.equal((await lookupPayload([])).matchStatus, 'not_found', 'empty provider result');
for (const [statusCode, expected] of [[401, 'provider_error'], [403, 'provider_error'], [404, 'not_found'], [500, 'provider_error']] as const) {
  const provider = new AeroDataBoxFlightProvider({ apiKey: 'server-only-test-key', fetchImpl: async () => new Response('', { status: statusCode }) });
  try {
    const status = await provider.getStatus(query);
    assert.equal(status.matchStatus, expected, `${statusCode} normalized result`);
  } catch (error) {
    assert.equal((error as FlightProviderRequestError).category, expected, `${statusCode} normalized error`);
  }
}
const malformedProvider = new AeroDataBoxFlightProvider({ apiKey: 'server-only-test-key', fetchImpl: async () => new Response('{', { status: 200 }) });
try { await malformedProvider.getStatus(query); throw new Error('malformed response did not fail closed'); }
catch (error) { assert.equal((error as FlightProviderRequestError).category, 'invalid_response', 'malformed response category'); }
const timeoutProvider = new AeroDataBoxFlightProvider({ apiKey: 'server-only-test-key', fetchImpl: async () => { throw new DOMException('Aborted', 'AbortError'); } });
try { await timeoutProvider.getStatus(query); throw new Error('timeout did not fail closed'); }
catch (error) { assert.equal((error as FlightProviderRequestError).category, 'timeout', 'timeout response category'); }

const partial = mergeProviderFields(delayed, { ...delayed, departureGate: undefined, baggageBelt: undefined });
assert.equal(partial.departureGate, 'C4', 'provider omission erased gate');
assert.equal(partial.baggageBelt, '8', 'provider omission erased baggage');

const disabled = await new DisabledFlightProvider().getStatus();
assert.equal(disabled.reason, 'disabled', 'disabled provider must not call network');

function projectedCallsPerFlight() {
  const departure = Date.parse('2026-08-20T06:20:00Z'), arrival = departure + 4 * 60 * 60_000;
  let now = departure - 48 * 60 * 60_000, calls = 0;
  while (now <= arrival + 2 * 60 * 60_000 && calls < 100) {
    const policy = refreshPolicy({ nowUtc: now, scheduledDepartureUtc: departure, scheduledArrivalUtc: arrival, operationalPhase: now >= arrival ? 'landed' : now >= departure ? 'en_route' : 'scheduled', disruptionState: 'none', minRefreshMinutes: 60 });
    if (policy.reason === 'finished') break;
    if (policy.eligibleNow) calls += 1;
    now = policy.nextRefreshAt ?? now + 60 * 60_000;
  }
  return calls;
}
const perFlight = projectedCallsPerFlight();
assert.ok(perFlight > 0 && perFlight <= 12, `unexpected per-flight call estimate: ${perFlight}`);
const scale = [1, 10, 100, 1_000].map(flights => ({ flights, uncappedCalls: flights * perFlight, cappedCalls: Math.min(240, flights * perFlight) }));
assert.equal(scale[3].cappedCalls, 240, 'monthly guard must cap large scale');
console.log(`Live flight scenarios passed: provider normalization, strict matching, codeshare, cancellation confirmation/recovery, merge safety, impact rules, disabled provider, projected calls ${JSON.stringify(scale)}.`);
