import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = readFileSync('public/mobile-app.js', 'utf8');
const calls = [];
let reloads = 0;
const state = { trip: { id: 'trip' }, contacts: [] };
const ctx = vm.createContext({ state, MANUAL_DETAIL_LABELS: { Driver: 'driver', Vehicle: 'vehicle', Platform: 'platform', Coach: 'coach', Date: 'date' }, bookingBaseKind: k => ({ bus: 'transport', taxi: 'transport', 'car-rental': 'transport' }[k] || k), statusText: x => x, api: async (url, options) => { calls.push({ url, ...options, body: JSON.parse(options.body) }); }, loadTripDetails: async () => { reloads++; } });
for (const name of ['val','itemId','noteStorage','bookingNoteText','saveBookingNote','parseManualDetailNotes','buildManualDetailNotes','directItemContactById','directItemContact','saveManualContact']) {
  const start = source.search(new RegExp(`  (?:async )?function ${name}\\(`));
  const rest = source.slice(start + 1);
  const end = rest.search(/\n  (?:async )?function /);
  vm.runInContext(source.slice(start, start + 1 + end), ctx);
}
const bus = { id: 'bus-1', transport_type: 'bus', title: 'Hop-on Bus' };
state.contacts = [{ id: 'operator', trip_item_id: bus.id, contact_type: 'other', display_name: 'Bus operator', phone: '+123', email: 'bus@example.test', notes: 'Old note', version: 4 }];
assert.equal(ctx.bookingNoteText(bus, 'bus'), 'Old note');
await ctx.saveBookingNote(bus, 'bus', ' Hhh ');
assert.equal(calls.at(-1).url, '/api/v1/trips/trip/contacts/operator');
assert.equal(calls.at(-1).body.notes, 'Hhh');
assert.equal(calls.at(-1).body.phone, '+123');
assert.equal(calls.at(-1).body.email, 'bus@example.test');
assert.equal(calls.at(-1).body.version, 4);
state.contacts[0].notes = calls.at(-1).body.notes;
assert.equal(ctx.bookingNoteText(bus, 'bus'), 'Hhh');
await ctx.saveBookingNote(bus, 'bus', '');
assert.equal(calls.at(-1).body.notes, null);
state.contacts = [];
await ctx.saveBookingNote(bus, 'transport', 'New note');
assert.equal(calls.at(-1).method, 'POST');
assert.equal(calls.at(-1).body.tripItemId, bus.id);
assert.equal(calls.at(-1).body.contactType, 'other');
const taxi = { id: 'taxi-1', transport_type: 'taxi' };
state.contacts = [{ id: 'driver', trip_item_id: taxi.id, contact_type: 'driver', notes: 'Driver: Anna · Vehicle: Sedan · Notes: Old', phone: '+456' }];
await ctx.saveBookingNote(taxi, 'taxi', 'Meet outside');
assert.equal(calls.at(-1).url, '/api/v1/trips/trip/contacts/driver');
assert.equal(calls.at(-1).body.notes, 'Driver: Anna · Vehicle: Sedan · Notes: Meet outside');
assert.equal(calls.at(-1).body.phone, '+456');
for (const [kind, type] of [['flight','airline'],['hotel','hotel'],['train','other'],['ferry','other'],['car','rental_car'],['transfer','driver']]) {
  await ctx.saveBookingNote({ id: kind }, kind, 'Note');
  assert.equal(calls.at(-1).body.contactType, type);
}
for (const kind of ['activity','reservation']) {
  await ctx.saveBookingNote({ id: kind, kind, title: 'Class', activity_type: kind === 'activity' ? 'class' : null, notes: 'Date: 2026-10-05 · Notes: Old', version: 3 }, 'class', 'New');
  assert.equal(calls.at(-1).url, `/api/v1/trips/trip/activities/${kind}`);
  assert.equal(calls.at(-1).body.kind, kind);
  assert.equal(calls.at(-1).body.notes, 'Date: 2026-10-05 · Notes: New');
}
assert.equal(reloads, calls.length);
console.log('Booking notes: bus create/update/clear/readback, taxi structured detail preservation, and existing booking routes passed.');
