import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('public/airport-timezones.js', 'utf8');
const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(source, context);
const resolver = context.globalThis.TriptoAirportTimezones;

assert.ok(resolver, 'airport timezone browser resolver was not exported');
assert.ok(resolver.size >= 3_000, 'airport timezone catalog is unexpectedly small');
assert.equal(resolver.timezoneForAirport('TLV'), 'Asia/Jerusalem');
assert.equal(resolver.timezoneForAirport(' tlv — Ben Gurion Airport '), 'Asia/Jerusalem');
assert.equal(resolver.timezoneForAirport('FCO — Rome Fiumicino'), 'Europe/Rome');
assert.equal(resolver.timezoneForAirport('LAX'), 'America/Los_Angeles');
assert.equal(resolver.timezoneForAirport('HND'), 'Asia/Tokyo');
assert.equal(resolver.timezoneForAirport('ZZZ'), null);
assert.equal(resolver.timezoneForAirport('Rome'), null);

console.log('Airport timezone contract passed.');
