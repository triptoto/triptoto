import { parseForwardedEmail } from '../../packages/importer/src/index.ts';

function assert(condition:unknown,label:string):asserts condition{if(!condition)throw new Error(`Import scenario failed: ${label}`);}

const flight=parseForwardedEmail({subject:'Fwd: Flight confirmation',sender:'airline@example.test',body:`Booking reference: ABC123\nFlight: LY 383\nTLV -> FCO\nDeparture: 2026-09-01 10:30\nArrival: 2026-09-01 13:15`});
assert(flight.candidates.length===1,'flight candidate detected');
assert(flight.candidates[0].candidateType==='flight','flight type');
assert(flight.candidates[0].payload.departureIata==='TLV','departure IATA');
assert(flight.candidates[0].payload.arrivalIata==='FCO','arrival IATA');
assert(flight.candidates[0].payload.departureLocal==='2026-09-01T10:30','departure local');
assert(Array.isArray(flight.candidates[0].warnings)&&flight.candidates[0].warnings.length>0,'timezone confirmation warning');

const hotel=parseForwardedEmail({subject:'Booking confirmation at Hotel Artemide',body:`Hotel: Hotel Artemide\nAddress: Via Nazionale 22, Roma\nConfirmation number: HTL9988\nCheck-in: 1 September 2026\nCheck-out: 5 September 2026`});
assert(hotel.candidates.length===1,'hotel candidate detected');
assert(hotel.candidates[0].candidateType==='stay','stay type');
assert(hotel.candidates[0].payload.propertyName==='Hotel Artemide','property name');
assert(hotel.candidates[0].payload.checkInDate==='2026-09-01','check in');
assert(hotel.candidates[0].payload.checkOutDate==='2026-09-05','check out');

const mixed=parseForwardedEmail({subject:'Trip confirmation',body:`Flight: AZ 202\nFCO-MXP\nDeparture: 2026-09-02 09:00\nArrival: 2026-09-02 10:15\nHotel: Milano Hotel\nCheck-in: 02/09/2026\nCheck-out: 04/09/2026`});
assert(mixed.candidates.some(x=>x.candidateType==='flight'),'mixed flight');
assert(mixed.candidates.some(x=>x.candidateType==='stay'),'mixed stay');

const unsupported=parseForwardedEmail({subject:'Newsletter',body:'Thanks for subscribing to our weekly travel inspiration.'});
assert(unsupported.candidates.length===0,'unsupported stays empty');
assert(!!unsupported.unsupportedReason,'unsupported has reason');

const ambiguous=parseForwardedEmail({subject:'Hotel confirmation',body:`Hotel: Example Hotel\nCheck-in: 09/10/2026\nCheck-out: 10/10/2026`});
assert(ambiguous.candidates.length===1,'ambiguous hotel candidate still surfaced');
assert(ambiguous.candidates[0].payload.checkInDate==null,'ambiguous numeric locale date is not guessed');
assert(ambiguous.candidates[0].warnings.some(x=>String(x).includes('Check-in')),'ambiguous date requires confirmation');

console.log('Import parser scenarios passed: flight, stay, mixed booking, ambiguous locale safety and unsupported handling.');
