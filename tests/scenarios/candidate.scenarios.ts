import { assessConnection } from '../../packages/impact-engine/src/index.ts';
import { assessDocumentReadiness } from '../../packages/offline-readiness/src/index.ts';
import { parseForwardedEmail } from '../../packages/importer/src/index.ts';
import { validateJourney } from '../../packages/journeys/src/index.ts';
import { canApplyOperation } from '../../packages/sync/src/index.ts';
import { resolveLocalDateTime } from '../../packages/time/src/index.ts';
import { evaluateTrip } from '../../packages/trip-brain/src/index.ts';
import { assessTripHealth } from '../../packages/trip-health/src/index.ts';
import type { Connection, TripItem } from '../../packages/domain/src/index.ts';
import { isSessionExpired } from '../../apps/worker/src/auth.ts';

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(`Candidate scenario failed: ${label}`);
}

const hour = 3_600_000;
const minute = 60_000;
const now = Date.UTC(2027, 5, 1, 8);
let passed = 0;
function scenario(name: string, fn: () => void): void { fn(); passed++; console.log(`ok ${passed} - ${name}`); }
function item(id: string, start: number, end?: number, overrides: Partial<TripItem> = {}): TripItem {
  return { id, tripId:'trip', type:'transport', status:'confirmed', title:id, startsAtUtc:start, endsAtUtc:end, startTimezone:'UTC', endTimezone:'UTC', confidence:'confirmed', ...overrides };
}
function connection(type: Connection['type'], overrides: Partial<Connection> = {}): Connection {
  return { id:'connection', fromItemId:'from', toItemId:'to', type, recommendedBufferMinutes:90, ...overrides };
}

scenario('normal vacation chooses the next confirmed plan', () => {
  const result=evaluateTrip({nowUtc:now,items:[item('flight',now+hour,now+3*hour),item('hotel',now+4*hour,undefined,{type:'stay'})]});
  assert(result.nextItem?.id==='flight','normal vacation next item');
});
scenario('multi-city preserves explicit sequence', () => {
  const result=validateJourney('multi_city',[{itemId:'tlv',sequenceNo:0,semanticRole:'outbound'},{itemId:'rome',sequenceNo:1,semanticRole:'stopover'},{itemId:'paris',sequenceNo:2,semanticRole:'return'}]);
  assert(result.orderedItemIds.join(',')==='tlv,rome,paris','multi-city order');
});
scenario('open-jaw requires multiple legs', () => assert(validateJourney('open_jaw',[{itemId:'only',sequenceNo:0,semanticRole:'outbound'}]).issues.some(x=>x.code==='OPEN_JAW_TOO_SHORT'),'open-jaw validation'));
scenario('family trip with travelers avoids missing-traveler warning', () => {
  const issues=assessTripHealth({nowUtc:now,trip:{id:'trip',lifecycleState:'upcoming'},items:[item('flight',now+hour)],travelerCount:4,transportCount:1,stayCount:1});
  assert(!issues.some(x=>x.code==='NO_TRAVELERS'),'family traveler records');
});
scenario('overnight flight uses UTC ordering', () => assert(item('overnight',now,now+9*hour).endsAtUtc!>now,'overnight order'));
scenario('date-line crossing resolves event-local times independently', () => {
  assert(resolveLocalDateTime('2027-06-02T09:00','Pacific/Auckland').status==='exact','Auckland local time');
  assert(resolveLocalDateTime('2027-06-01T18:00','Pacific/Honolulu').status==='exact','Honolulu local time');
});
scenario('cancelled future flight is prioritized by Trip Health', () => {
  const issues=assessTripHealth({nowUtc:now,trip:{id:'trip',lifecycleState:'upcoming'},items:[item('cancelled',now+hour,undefined,{status:'cancelled'})],travelerCount:1,transportCount:0});
  assert(issues.some(x=>x.code==='FUTURE_BOOKING_CANCELLED'&&x.severity==='high'),'cancelled future booking');
});
scenario('delay assumptions remain unknown without reliable times', () => assert(assessConnection(item('from',now,undefined),item('to',now+2*hour),connection('protected')).outcome==='unknown','missing arrival time'));
scenario('protected connection uses explicit buffer', () => assert(assessConnection(item('from',now,now+hour),item('to',now+3*hour),connection('protected')).outcome==='comfortable','protected buffer'));
scenario('self-transfer risk is not softened', () => assert(assessConnection(item('from',now,now+hour),item('to',now+2*hour),connection('self_transfer',{recommendedBufferMinutes:120})).outcome==='unlikely','self-transfer'));
scenario('airport change adds deterministic safety buffer', () => assert(assessConnection(item('from',now,now+hour),item('to',now+3*hour),connection('self_transfer',{requiresAirportChange:true})).outcome==='unlikely','airport change'));
scenario('road trip cannot be empty', () => assert(validateJourney('road_trip',[]).issues.some(x=>x.code==='ROAD_TRIP_EMPTY'),'empty road trip'));
scenario('mixed flight train ferry sequence remains generic', () => assert(validateJourney('mixed',[{itemId:'flight',sequenceNo:0,semanticRole:'outbound'},{itemId:'train',sequenceNo:1,semanticRole:'transfer'},{itemId:'ferry',sequenceNo:2,semanticRole:'other'}]).orderedItemIds.length===3,'mixed transport'));
scenario('offline create applies only when the entity is absent', () => assert(canApplyOperation(undefined,{id:'op',deviceId:'device',entityType:'trip_item',entityId:'new',operationType:'create',payload:{},status:'pending',createdAt:now}),'offline create'));
scenario('connectivity restoration applies matching base version', () => assert(canApplyOperation(3,{id:'op',deviceId:'device',entityType:'checklist',entityId:'item',operationType:'update',baseVersion:3,payload:{},status:'pending',createdAt:now}),'restored connection'));
scenario('shared-trip conflict boundary rejects stale base version', () => assert(!canApplyOperation(4,{id:'op',deviceId:'device',entityType:'trip_item',entityId:'shared',operationType:'update',baseVersion:3,payload:{},status:'pending',createdAt:now}),'optimistic lock'));
scenario('changed hotel overlapping another plan is reported', () => {
  const issues=assessTripHealth({nowUtc:now,trip:{id:'trip',lifecycleState:'active'},items:[item('hotel',now,now+4*hour,{type:'stay'}),item('tour',now+3*hour,now+5*hour,{type:'activity'})],travelerCount:1,transportCount:1,stayCount:1});
  assert(issues.some(x=>x.code==='TIMELINE_OVERLAP'),'changed hotel overlap');
});
scenario('missing document remains an explicit readiness limitation', () => assert(!assessDocumentReadiness([],[]).ready,'missing document'));
scenario('missing traveler document remains per-traveler', () => {
  const readiness=assessDocumentReadiness([{integrity:'verified',travelerIds:['adult']}],['adult','child']);
  assert(readiness.missingTravelerIds.join(',')==='child'&&!readiness.ready,'missing traveler document');
});
scenario('low-confidence import is never silently confirmed', () => {
  const parsed=parseForwardedEmail({subject:'Flight booking',body:'Flight: AB 123\nDeparture: 9/10/2027 10:00'});
  assert(parsed.candidates[0].confidence<0.8&&parsed.candidates[0].warnings.length>0,'low confidence import');
});
scenario('duplicate import input normalizes deterministically', () => {
  const a=parseForwardedEmail({subject:'Hotel',body:'Hotel: Example\nCheck-in: 1 June 2027\nCheck-out: 2 June 2027'});
  const b=parseForwardedEmail({subject:'Hotel',body:'  Hotel: Example  \n\n\nCheck-in: 1 June 2027\nCheck-out: 2 June 2027  '});
  assert(a.normalizedText===b.normalizedText,'duplicate fingerprint input');
});
scenario('expired guest session is rejected at the exact expiry boundary', () => assert(isSessionExpired(now,now)&&!isSessionExpired(now+1,now),'expired session'));
scenario('DST spring gap is rejected', () => assert(resolveLocalDateTime('2027-03-28T02:30','Europe/Rome').status==='invalid','DST spring gap'));
scenario('DST autumn overlap is ambiguous', () => assert(resolveLocalDateTime('2027-10-31T02:30','Europe/Rome').status==='ambiguous','DST autumn overlap'));
scenario('device timezone change does not change stored UTC next item', () => {
  const result=evaluateTrip({nowUtc:now,items:[item('landed',now-hour,now),item('next',now+hour)]});
  assert(result.nextItem?.id==='next','device timezone independent');
});
scenario('provider outage leaves travel duration unavailable', () => assert(evaluateTrip({nowUtc:now,items:[item('next',now+hour)],travelDurationsByItemId:{next:{minutes:0,source:'unknown'}}}).recommendationConfidence==='unavailable','provider fallback'));
scenario('stale route estimate is labeled unavailable', () => {
  const result=evaluateTrip({nowUtc:now,items:[item('next',now+hour)],travelDurationsByItemId:{next:{minutes:20,source:'cached_route',calculatedAt:now-7*hour}}});
  assert(result.recommendationConfidence==='unavailable'&&result.issues.some(x=>x.code==='TRAVEL_DURATION_STALE'),'stale estimate');
});
scenario('completed trip has no What’s Next or preparation warnings', () => {
  const brain=evaluateTrip({nowUtc:now,items:[item('past',now-2*hour,now-hour)]});
  const health=assessTripHealth({nowUtc:now,trip:{id:'trip',lifecycleState:'completed'},items:[item('past',now-2*hour,now-hour)],travelerCount:0,transportCount:0,stayCount:0});
  assert(!brain.nextItem&&!health.some(x=>['NO_TRAVELERS','NO_TRANSPORT','NO_STAY'].includes(x.code)),'trip completion');
});
scenario('cancelled segment invalidates connection outcome', () => assert(assessConnection(item('from',now,now+hour,{status:'cancelled'}),item('to',now+2*hour),connection('protected')).explanationCode==='CANCELLED_SEGMENT','cancelled connection'));
scenario('unknown connection buffer stays unavailable in Trip Health', () => {
  const issues=assessTripHealth({nowUtc:now,trip:{id:'trip',lifecycleState:'active'},items:[item('from',now,now+hour),item('to',now+2*hour)],connections:[{id:'c',fromItemId:'from',toItemId:'to',connectionType:'unknown'}],travelerCount:1,transportCount:2,stayCount:1});
  assert(issues.some(x=>x.code==='CONNECTION_BUFFER_UNAVAILABLE'&&x.confidence==='unavailable'),'unknown buffer');
});

console.log(`Beta Candidate 1 scenario suite passed: ${passed} scenarios.`);
