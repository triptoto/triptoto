import { assessConnection } from '../../packages/impact-engine/src/index.ts';
import { evaluateTrip } from '../../packages/trip-brain/src/index.ts';
import { resolveLocalDateTime } from '../../packages/time/src/index.ts';

function assert(condition:unknown,label:string):void{if(!condition)throw new Error(`Milestone 2 scenario failed: ${label}`);}
function equal<T>(actual:T,expected:T,label:string):void{if(actual!==expected)throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);}
const base=Date.UTC(2026,7,20,12,0,0);

// A date-line itinerary can show arrival on a different local calendar day while UTC order stays authoritative.
{
  const lax=resolveLocalDateTime('2026-08-20T18:00','America/Los_Angeles');
  const hnd=resolveLocalDateTime('2026-08-22T21:00','Asia/Tokyo');
  equal(lax.status,'exact','LAX local time exact');
  equal(hnd.status,'exact','HND local time exact');
  assert(lax.candidatesUtc[0]!=null&&hnd.candidatesUtc[0]!=null&&hnd.candidatesUtc[0]>lax.candidatesUtc[0],'date-line flight keeps UTC ordering');
}

// DST ambiguity is never silently guessed.
equal(resolveLocalDateTime('2026-11-01T01:30','America/New_York').status,'ambiguous','New York autumn overlap');
equal(resolveLocalDateTime('2026-03-08T02:30','America/New_York').status,'invalid','New York spring gap');

// Airport changes are treated as consequential even when raw elapsed time looks generous.
{
  const from={id:'a',tripId:'t',type:'transport' as const,status:'confirmed' as const,title:'Arrival',endsAtUtc:base,confidence:'confirmed' as const};
  const to={id:'b',tripId:'t',type:'transport' as const,status:'confirmed' as const,title:'Departure',startsAtUtc:base+140*60000,confidence:'confirmed' as const};
  const r=assessConnection(from,to,{id:'c',fromItemId:'a',toItemId:'b',type:'self_transfer',recommendedBufferMinutes:90,requiresAirportChange:true,requiresSecurity:true});
  equal(r.outcome,'unlikely','airport-change self transfer remains unlikely');
}

// Trip Brain must not invent travel time or a leave-at recommendation.
{
  const r=evaluateTrip({nowUtc:base,items:[{id:'x',tripId:'t',type:'activity',status:'confirmed',title:'Museum',startsAtUtc:base+3600000,confidence:'confirmed'}]});
  equal(r.recommendationConfidence,'unavailable','leave recommendation unavailable without travel duration');
  assert(r.recommendedLeaveAtUtc==null,'no invented leave-at time');
}

// Cancelled/skipped-only trips have no actionable next item.
{
  const r=evaluateTrip({nowUtc:base,items:[
    {id:'c',tripId:'t',type:'transport',status:'cancelled',title:'Cancelled flight',startsAtUtc:base+3600000,confidence:'confirmed'},
    {id:'s',tripId:'t',type:'activity',status:'skipped',title:'Skipped plan',startsAtUtc:base+7200000,confidence:'confirmed'},
  ]});
  assert(!r.nextItem,'cancelled/skipped items excluded from next item');
  equal(r.recommendationConfidence,'unavailable','cancelled-only trip has unavailable recommendation');
}

console.log('Milestone 2 scenario suite passed.');
