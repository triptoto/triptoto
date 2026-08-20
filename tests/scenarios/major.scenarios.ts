import { validateJourney } from '../../packages/journeys/src/index.ts';
import { assessTripHealth, highestSeverity } from '../../packages/trip-health/src/index.ts';
import { canApplyOperation } from '../../packages/sync/src/index.ts';

function assert(condition:unknown,label:string):asserts condition{if(!condition)throw new Error(`Major scenario failed: ${label}`);}
function eq<T>(actual:T,expected:T,label:string){if(actual!==expected)throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);}

const base=Date.UTC(2027,3,1,10,0,0);

const journeyIssues=validateJourney('round_trip',[
  {itemId:'out',sequenceNo:0,semanticRole:'outbound',startsAtUtc:base},
  {itemId:'stay',sequenceNo:1,semanticRole:'stay',startsAtUtc:base+86400000},
]);
assert(journeyIssues.issues.some(i=>i.code==='ROUND_TRIP_ROLES_MISSING'),'round trip requires return');

const duplicate=validateJourney('mixed',[
  {itemId:'a',sequenceNo:0,semanticRole:'other',startsAtUtc:base},
  {itemId:'b',sequenceNo:0,semanticRole:'other',startsAtUtc:base+1000},
]);
assert(duplicate.issues.some(i=>i.code==='DUPLICATE_SEQUENCE'),'duplicate journey sequence detected');
const nonChronological=validateJourney('mixed',[
  {itemId:'later',sequenceNo:0,semanticRole:'other',startsAtUtc:base+2000},
  {itemId:'earlier',sequenceNo:1,semanticRole:'other',startsAtUtc:base},
]);
assert(nonChronological.issues.some(i=>i.code==='NON_CHRONOLOGICAL_ORDER'),'journey chronology mismatch detected');

const issues=assessTripHealth({
  nowUtc:base,
  trip:{id:'t',lifecycleState:'active',startsOn:'2027-04-01',endsOn:'2027-04-05'},
  items:[
    {id:'f1',tripId:'t',type:'transport',status:'confirmed',title:'Flight one',startsAtUtc:base-2*3600000,endsAtUtc:base,startTimezone:'Asia/Jerusalem',endTimezone:'Europe/Rome',confidence:'confirmed'},
    {id:'f2',tripId:'t',type:'transport',status:'confirmed',title:'Flight two',startsAtUtc:base+45*60000,endsAtUtc:base+2*3600000,startTimezone:'Europe/Rome',endTimezone:'Europe/Paris',confidence:'confirmed'},
    {id:'museum',tripId:'t',type:'activity',status:'confirmed',title:'Museum',startsAtUtc:base+30*60000,endsAtUtc:base+90*60000,confidence:'low_confidence'},
  ],
  connections:[{id:'c',fromItemId:'f1',toItemId:'f2',connectionType:'self_transfer',recommendedBufferMinutes:120,requiresBaggageReclaim:true}],
  checklist:[{id:'passport',title:'Passport',priority:'critical'}],
  travelerCount:0,
  stayCount:0,
  transportCount:2,
});
assert(issues.some(i=>i.code==='TIMELINE_OVERLAP'),'timeline overlap detected');
assert(issues.some(i=>i.code==='START_TIMEZONE_MISSING'&&i.itemIds?.includes('museum')),'missing timezone detected');
assert(issues.some(i=>i.code==='LOW_CONFIDENCE_BOOKING'),'low confidence detected');
assert(issues.some(i=>i.code==='CONNECTION_UNLIKELY'),'connection risk detected');
assert(issues.some(i=>i.code==='CRITICAL_ESSENTIALS_OPEN'),'critical checklist detected');
assert(issues.some(i=>i.code==='NO_TRAVELERS'),'traveler preparation gap detected');
assert(issues.some(i=>i.code==='NO_STAY'),'stay preparation gap detected');
eq(highestSeverity(issues),'critical','highest severity');

assert(canApplyOperation(undefined,{id:'1',deviceId:'d',entityType:'trip',entityId:'t',operationType:'create',payload:{},status:'pending',createdAt:base}),'create applies to missing entity');
assert(canApplyOperation(2,{id:'2',deviceId:'d',entityType:'trip',entityId:'t',operationType:'update',baseVersion:2,payload:{},status:'pending',createdAt:base}),'matching base version applies');
assert(!canApplyOperation(3,{id:'3',deviceId:'d',entityType:'trip',entityId:'t',operationType:'update',baseVersion:2,payload:{},status:'pending',createdAt:base}),'version mismatch conflicts');

console.log('Major scenario suite passed: journeys, deterministic health and sync version safety.');
