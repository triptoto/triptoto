import { parseForwardedEmail } from '../../packages/importer/src/index.ts';

function assert(condition:unknown,label:string):asserts condition{if(!condition)throw new Error(`Import scenario failed: ${label}`);}

const flight=parseForwardedEmail({subject:'Fwd: Flight confirmation',sender:'airline@example.test',body:`Booking reference: ABC123\nFlight: LY 383\nTLV -> FCO\nDeparture: 2026-09-01 10:30\nArrival: 2026-09-01 13:15`});
assert(flight.candidates.length===1,'flight candidate detected');
assert(flight.candidates[0].candidateType==='flight','flight type');
assert(flight.candidates[0].payload.departureIata==='TLV','departure IATA');
assert(flight.candidates[0].payload.arrivalIata==='FCO','arrival IATA');
assert(flight.candidates[0].payload.departureLocalDatetime==='2026-09-01T10:30','departure local');
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

// --- Expanded booking types (step 8): train, car, transfer, cruise, ferry, restaurant, activity, generic reservation.
const train=parseForwardedEmail({subject:'Eurostar booking confirmed',body:`Eurostar booking\nConfirmation: EUR12345\nParis -> London\nTravel date: 2026-09-10`});
assert(train.candidates.some(x=>x.candidateType==='train'),'train candidate');
const trainC=train.candidates.find(x=>x.candidateType==='train');
assert(trainC,'train candidate present');
assert(trainC.payload.departureName==='Paris'&&trainC.payload.arrivalName==='London','train route parsed, not guessed');

const car=parseForwardedEmail({subject:'Car rental confirmation',body:`Car rental confirmation\nRental company: Hertz\nConfirmation: CAR55\nPick-up: 2026-09-11`});
assert(car.candidates.some(x=>x.candidateType==='car'),'car rental candidate');

const transfer=parseForwardedEmail({subject:'Your transfer',body:`Airport transfer confirmation\nConfirmation: TRF88\nDate: 2026-09-12`});
assert(transfer.candidates.some(x=>x.candidateType==='transfer'),'transfer candidate');

const cruise=parseForwardedEmail({subject:'Cruise booking',body:`Cruise booking\nRoyal Caribbean\nConfirmation: CRU777\nEmbarkation: 2026-09-13`});
assert(cruise.candidates.some(x=>x.candidateType==='cruise'),'cruise candidate (materializes as ferry)');

const ferry=parseForwardedEmail({subject:'Ferry ticket',body:`Ferry booking\nConfirmation: FER22\nSailing from Dover\nTravel date: 2026-09-14`});
assert(ferry.candidates.some(x=>x.candidateType==='ferry'),'ferry candidate');

const restaurant=parseForwardedEmail({subject:'Dinner reservation',body:`Dinner reservation confirmed\nOpenTable confirmation: RES44\nRestaurant: Osteria Roma\nDate: 2026-09-15`});
assert(restaurant.candidates.some(x=>x.candidateType==='restaurant'),'restaurant candidate');

const activity=parseForwardedEmail({subject:'Museum tickets',body:`Museum admission ticket\nConfirmation: ACT11\nAttraction: Colosseum\nVisit date: 2026-09-16`});
assert(activity.candidates.some(x=>x.candidateType==='activity'),'activity candidate');

const generic=parseForwardedEmail({subject:'Your reservation is confirmed',body:`Your reservation is confirmed\nConfirmation number: GEN99\nProvider: Acme Experiences\nStart date: 2026-09-17`});
assert(generic.candidates.some(x=>x.candidateType==='reservation'),'generic reservation fallback');
assert(generic.candidates.every(x=>x.confidence<0.8),'generic reservation is review-only, never auto-created');

const strayKeyword=parseForwardedEmail({subject:'Travel inspiration',body:'Take a scenic train through the Alps this autumn. Shuttle buses run hourly.'});
assert(strayKeyword.candidates.length===0,'stray transport keyword without confirmation/date/route never fabricates a booking');


const ambiguous=parseForwardedEmail({subject:'Hotel confirmation',body:`Hotel: Example Hotel\nCheck-in: 09/10/2026\nCheck-out: 10/10/2026`});
assert(ambiguous.candidates.length===1,'ambiguous hotel candidate still surfaced');
assert(ambiguous.candidates[0].payload.checkInDate==null,'ambiguous numeric locale date is not guessed');
assert(ambiguous.candidates[0].warnings.some(x=>String(x).includes('Check-in')),'ambiguous date requires confirmation');

console.log('Import parser scenarios passed: flight, stay, mixed booking, expanded types (train/car/transfer/cruise/ferry/restaurant/activity/generic), stray-keyword safety, ambiguous locale safety and unsupported handling.');
