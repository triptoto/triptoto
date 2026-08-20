import { assessConnection } from '../../packages/impact-engine/src/index.ts';
import { evaluateTrip } from '../../packages/trip-brain/src/index.ts';
import { resolveLocalDateTime } from '../../packages/time/src/index.ts';

function ok(condition:unknown,label:string):void{if(!condition)throw new Error(`Scenario failed: ${label}`);}
function eq<T>(actual:T,expected:T,label:string):void{if(actual!==expected)throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);}
const hour=3600000;const base=Date.UTC(2027,0,10,10,0,0);

// Timezone / DST contract tests.
eq(resolveLocalDateTime('2026-03-29T02:30','Europe/Rome').status,'invalid','Rome DST spring gap');
eq(resolveLocalDateTime('2026-10-25T02:30','Europe/Rome').status,'ambiguous','Rome DST autumn overlap');
eq(resolveLocalDateTime('2026-08-20T12:00','Asia/Tokyo').status,'exact','Tokyo exact local time');
eq(resolveLocalDateTime('2026-08-20T12:00','Pacific/Kiritimati').status,'exact','UTC+14 exact local time');
eq(resolveLocalDateTime('2026-08-20T12:00','Not/AZone').status,'invalid','invalid timezone rejected');

// Trip Brain should ignore cancelled/skipped items and choose the next confirmed event.
{
 const r=evaluateTrip({nowUtc:base,items:[
  {id:'a',tripId:'t',type:'activity',status:'cancelled',title:'Cancelled',startsAtUtc:base+hour,confidence:'confirmed'},
  {id:'b',tripId:'t',type:'activity',status:'confirmed',title:'Museum',startsAtUtc:base+2*hour,confidence:'confirmed'},
 ]});
 eq(r.nextItem?.id,'b','cancelled item excluded');
 eq(r.recommendationConfidence,'unavailable','no route means leave time unavailable');
}

// Leave-now warning only when cached/user travel duration exists.
{
 const r=evaluateTrip({nowUtc:base,leaveBufferMinutes:10,items:[{id:'x',tripId:'t',type:'activity',status:'confirmed',title:'Gate',startsAtUtc:base+20*60000,confidence:'confirmed'}],travelDurationsByItemId:{x:{minutes:15,source:'cached_route'}}});
 ok(r.issues.some(i=>i.code==='LEAVE_NOW'),'leave-now issue');
}

// Connection safety matrix.
const from={id:'f1',tripId:'t',type:'transport' as const,status:'confirmed' as const,title:'Flight 1',endsAtUtc:base,confidence:'confirmed' as const};
function toAfter(minutes:number){return {id:'f2',tripId:'t',type:'transport' as const,status:'confirmed' as const,title:'Flight 2',startsAtUtc:base+minutes*60000,confidence:'confirmed' as const};}
{
 const a=assessConnection(from,toAfter(180),{id:'c',fromItemId:'f1',toItemId:'f2',type:'protected',recommendedBufferMinutes:90});
 eq(a.outcome,'comfortable','protected comfortable');
}
{
 const a=assessConnection(from,toAfter(100),{id:'c',fromItemId:'f1',toItemId:'f2',type:'protected',recommendedBufferMinutes:90});
 eq(a.outcome,'tight','protected tight');
}
{
 const a=assessConnection(from,toAfter(70),{id:'c',fromItemId:'f1',toItemId:'f2',type:'self_transfer',recommendedBufferMinutes:120});
 eq(a.outcome,'unlikely','self transfer unlikely');
}
{
 const a=assessConnection(from,toAfter(200),{id:'c',fromItemId:'f1',toItemId:'f2',type:'self_transfer',recommendedBufferMinutes:120,requiresBaggageReclaim:true});
 eq(a.outcome,'comfortable','self transfer with baggage enough buffer');
}
{
 const a=assessConnection(from,toAfter(140),{id:'c',fromItemId:'f1',toItemId:'f2',type:'self_transfer',recommendedBufferMinutes:90,requiresAirportChange:true});
 eq(a.outcome,'unlikely','airport change penalty');
}
{
 const a=assessConnection(from,toAfter(60),{id:'c',fromItemId:'f1',toItemId:'f2',type:'unknown'});
 eq(a.outcome,'unknown','unknown buffer stays unknown');
}
{
 const missing={...from,endsAtUtc:undefined};
 const a=assessConnection(missing,toAfter(60),{id:'c',fromItemId:'f1',toItemId:'f2',type:'protected',recommendedBufferMinutes:45});
 eq(a.outcome,'unknown','missing time stays unknown');
}

// Overnight/date-line sanity: UTC order is authoritative, not local display date.
{
 const dep=Date.UTC(2026,7,20,20,0,0),arr=Date.UTC(2026,7,21,2,0,0);
 ok(arr>dep,'overnight UTC order');
 eq(resolveLocalDateTime('2026-08-21T16:00','Pacific/Kiritimati').status,'exact','date-line local event resolves');
}

// Long-duration and simultaneous trips remain valid inputs to deterministic brain evaluation.
{
 const r=evaluateTrip({nowUtc:base,items:[
  {id:'long',tripId:'t',type:'stay',status:'confirmed',title:'Month stay',startsAtUtc:base+10*hour,endsAtUtc:base+30*24*hour,confidence:'confirmed'},
  {id:'soon',tripId:'t',type:'activity',status:'confirmed',title:'Dinner',startsAtUtc:base+2*hour,confidence:'confirmed'},
 ]});
 eq(r.nextItem?.id,'soon','chronological next item');
}

console.log('Extended beta scenario suite passed.');
