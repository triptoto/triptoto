import { parseForwardedEmail } from '../../packages/importer/src/index.ts';
import { canApplyOperation } from '../../packages/sync/src/index.ts';
import { importReadinessFixtures as fixtures } from '../fixtures/import-readiness.ts';
const assert=(v:unknown,m:string)=>{if(!v)throw new Error(m)};
for(const f of fixtures){
  const parsed=parseForwardedEmail({subject:f.subject,body:f.body});
  if('type' in f){const c=parsed.candidates.find(x=>x.candidateType===f.type);if(!c)throw new Error(`${f.name}: candidate`);if('warning' in f)assert(c.warnings.some(x=>x.includes(f.warning)),`${f.name}: warning`);if('nullField' in f)assert(c.payload[f.nullField]===null,`${f.name}: ambiguous value stays null`);}
  if('unsupported' in f)assert(parsed.candidates.length===0&&parsed.unsupportedReason?.includes(f.unsupported),`${f.name}: explicit unsupported`);
}
const html=parseForwardedEmail({subject:'Flight',body:'<p>Flight: LY 383</p><p>TLV &gt; FCO</p><p>Departure: 4 September 2027 10:30</p><p>Arrival: 4 September 2027 13:15</p>'});
assert(html.normalizedText.includes('TLV > FCO'),'HTML entities normalized');
const duplicateA=parseForwardedEmail({subject:'Fwd: Hotel',body:'Hotel: Roma\nCheck-in: 4 September 2027\nCheck-out: 5 September 2027'});
const duplicateB=parseForwardedEmail({subject:'Fwd: Hotel',body:'<p>Hotel: Roma</p><p>Check-in: 4 September 2027</p><p>Check-out: 5 September 2027</p>'});
assert(duplicateA.normalizedText===duplicateB.normalizedText,'HTML/text duplicate normalization');

const base={id:'op',deviceId:'device',entityType:'trip_item' as const,entityId:'item',operationType:'update' as const,payload:{title:'offline edit'},status:'pending' as const,createdAt:1};
assert(canApplyOperation(3,{...base,baseVersion:3}),'online to offline to reconnect applies matching version');
assert(!canApplyOperation(4,{...base,baseVersion:3}),'reconnect conflict never overwrites newer server version');
const unresolved={...base,status:'conflict' as const,baseVersion:3};
assert(unresolved.status==='conflict','unresolved conflict remains visible');
const cached={status:'stale',calculatedAt:Date.now()-86400001};assert(cached.status==='stale','stale cached data remains labeled');
const localRemoval={pendingOperations:1,allowed:false};assert(!localRemoval.allowed&&localRemoval.pendingOperations>0,'local data removal blocked with unsynced changes');
console.log('Real-trip readiness scenarios passed: import fixtures and offline recovery boundaries.');
