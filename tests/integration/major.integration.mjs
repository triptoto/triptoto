import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const emitDir=process.env.TRIPTO_EMIT_DIR;if(!emitDir)throw new Error('TRIPTO_EMIT_DIR is required.');
const load=async p=>import(pathToFileURL(resolve(emitDir,p)).href);
const {createDemoTrip}=await load('apps/worker/src/routes/demo.js');
const {listJourneys,createJourney,replaceJourneyItems}=await load('apps/worker/src/routes/journeys.js');
const {createActivity,listActivities}=await load('apps/worker/src/routes/activities.js');
const {upsertBookingDetail,listBookingDetails}=await load('apps/worker/src/routes/booking-details.js');
const {createContact,listContacts}=await load('apps/worker/src/routes/contacts.js');
const {createTimeMarker,listTimeMarkers}=await load('apps/worker/src/routes/time-markers.js');
const {expandedTripHealth}=await load('apps/worker/src/routes/intelligence.js');
const {syncStatus,syncChanges,acknowledgeSync,queueSyncOperation}=await load('apps/worker/src/routes/sync-v2.js');
const {readiness}=await load('apps/worker/src/routes/readiness.js');
const {listTransport}=await load('apps/worker/src/routes/transport.js');

class Prepared{constructor(db,sql,values=[]){this.db=db;this.sql=sql;this.values=values;}bind(...values){return new Prepared(this.db,this.sql,values);}async first(column){const row=this.db.prepare(this.sql).get(...this.values);if(!row)return null;return column?row[column]:row;}async all(){return{success:true,results:this.db.prepare(this.sql).all(...this.values)}}async run(){const info=this.db.prepare(this.sql).run(...this.values);return{success:true,meta:{changes:info.changes}}}}
class LocalD1{constructor(db){this.db=db;}prepare(q){return new Prepared(this.db,q)}async batch(statements){this.db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());this.db.exec('COMMIT');return out;}catch(e){this.db.exec('ROLLBACK');throw e;}}}
function assert(v,label){if(!v)throw new Error(`Major integration failed: ${label}`)}
function req(url,method='GET',data,headers={}){return new Request(url,{method,headers:{...(data!==undefined?{'content-type':'application/json'}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)})}
async function body(r){const text=await r.text();return text?JSON.parse(text):null;}
function addDevice(db,id){const now=Date.now();db.prepare(`INSERT INTO devices(id,platform,app_version,api_version,created_at,last_seen_at) VALUES (?,'web','major-test','v1',?,?)`).run(id,now,now)}

const db=new DatabaseSync(':memory:');for(const name of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync(join('migrations',name),'utf8'));
const env={DB:new LocalD1(db),SESSION_SECRET:'x'.repeat(64),DEMO_TOOLS_ENABLED:'true',DEMO_TOOLS_SECRET:'demo-secret-value-12345',BETA_RELEASE:'major-beta-5-8',LIVE_FLIGHTS_ENABLED:'false',AI_ENABLED:'false',GMAIL_SYNC_ENABLED:'false',R2_DOCUMENTS_ENABLED:'false'};
addDevice(db,'major-device');const auth={deviceId:'major-device'};
const demo=await body(await createDemoTrip(req('https://test/api/v1/internal/demo-trips','POST',{scenario:'normal'},{'x-tripto-demo-secret':'demo-secret-value-12345'}),env,auth));const tripId=demo.demo.tripId;
const itemRows=db.prepare(`SELECT id,type,starts_at_utc,ends_at_utc FROM trip_items WHERE trip_id=? ORDER BY starts_at_utc,created_at`).all(tripId);const travelerId=db.prepare(`SELECT id FROM travelers WHERE trip_id=? LIMIT 1`).get(tripId).id;
assert(itemRows.length>=2,'demo has itinerary items');

const createdJourney=await body(await createJourney(req('https://test/api/v1/trips/x/journeys','POST',{title:'Rome round trip',journeyType:'round_trip',status:'confirmed',sequenceNo:0}),env,auth,tripId));
assert(createdJourney.journey.id,'journey created');
const journeyItems=itemRows.slice(0,2).map((x,i)=>({itemId:x.id,sequenceNo:i,semanticRole:i===0?'outbound':'return'}));
const replaced=await body(await replaceJourneyItems(req('https://test/api/v1/trips/x/journeys/y/items','PUT',{items:journeyItems}),env,auth,tripId,createdJourney.journey.id));
assert(Array.isArray(replaced.items)&&replaced.items.length===2,'journey items replaced');
const journeys=await body(await listJourneys(req('https://test/api/v1/trips/x/journeys'),env,auth,tripId));assert(journeys.journeys.length===1,'journey listed');

const activity=await body(await createActivity(req('https://test/api/v1/trips/x/activities','POST',{kind:'reservation',title:'Museum entry',status:'confirmed',startsAtUtc:Date.now()+86400000,endsAtUtc:Date.now()+90000000,timezone:'Europe/Rome',reservationType:'museum',reference:'TEST-REF',confidence:'confirmed'}),env,auth,tripId));assert(activity.item.id,'activity created');
const activities=await body(await listActivities(req('https://test/api/v1/trips/x/activities'),env,auth,tripId));assert(activities.activities.some(x=>x.id===activity.item.id),'activity listed');

const transportItem=itemRows.find(x=>x.type==='transport')??itemRows[0];
const listedTransport=await body(await listTransport(req('https://test/api/v1/trips/x/transport'),env,auth,tripId));assert(String(listedTransport.transport.find(x=>x.id===transportItem.id)?.traveler_ids??'').split(',').includes(travelerId),'transport exposes existing traveler assignments for offline document requirements');
const detail=await body(await upsertBookingDetail(req('https://test/api/v1/trips/x/booking-details','PUT',{tripItemId:transportItem.id,travelerId,seat:'12A',cabinClass:'economy',checkedBags:1,cabinBags:1}),env,auth,tripId));assert(detail.bookingDetail.seat==='12A','booking details stored');
const details=await body(await listBookingDetails(req('https://test/api/v1/trips/x/booking-details'),env,auth,tripId));assert(details.bookingDetails.some(x=>x.seat==='12A'),'booking details listed');

const contact=await body(await createContact(req('https://test/api/v1/trips/x/contacts','POST',{contactType:'hotel',displayName:'Demo Hotel Desk',phone:'+39 000 000',tripItemId:itemRows.find(x=>x.type==='stay')?.id}),env,auth,tripId));assert(contact.contact.id,'contact created');
const contacts=await body(await listContacts(req('https://test/api/v1/trips/x/contacts'),env,auth,tripId));assert(contacts.contacts.length===1,'contact listed');

const marker=await body(await createTimeMarker(req('https://test/api/v1/trips/x/time-markers','POST',{tripItemId:transportItem.id,markerType:'boarding',label:'Boarding',atUtc:Date.now()+3600000,timezone:'Asia/Jerusalem',confidence:'confirmed'}),env,auth,tripId));assert(marker.timeMarker.id,'time marker created');
const markers=await body(await listTimeMarkers(req('https://test/api/v1/trips/x/time-markers'),env,auth,tripId));assert(markers.timeMarkers.length===1,'time marker listed');

const health=await body(await expandedTripHealth(req('https://test/api/v1/trips/x/health/expanded'),env,auth,tripId,false));assert(Array.isArray(health.health.issues),'expanded health returned');
const persisted=await body(await expandedTripHealth(req('https://test/api/v1/trips/x/health/recalculate','POST',{}),env,auth,tripId,true));assert(persisted.health.persisted===true,'health run persisted');assert(Number(db.prepare(`SELECT COUNT(*) c FROM trip_health_runs WHERE trip_id=?`).get(tripId).c)===1,'health run in D1');

const statusBefore=await body(await syncStatus(req('https://test/api/v1/trips/x/sync/status'),env,auth,tripId));assert(statusBefore.sync.safeMode===true,'sync safe mode');
const changes=await body(await syncChanges(req('https://test/api/v1/trips/x/sync/changes?sinceCreatedAt=0'),env,auth,tripId));assert(changes.changes.length>0,'sync change feed');
const last=changes.changes.at(-1);await acknowledgeSync(req('https://test/api/v1/trips/x/sync/ack','POST',{lastChangeCreatedAt:last.created_at,lastChangeId:last.id,pendingLocalOperations:0}),env,auth,tripId);
const queued=await body(await queueSyncOperation(req('https://test/api/v1/trips/x/sync/operations','POST',{idempotencyKey:'major-op-1',entityType:'trip_item',entityId:transportItem.id,operationType:'update',baseVersion:1,payload:{title:'Offline edit'}}),env,auth,tripId));assert(queued.operation.status==='pending'&&queued.operation.safeMode===true,'sync operation queued safely');
const duplicate=await body(await queueSyncOperation(req('https://test/api/v1/trips/x/sync/operations','POST',{idempotencyKey:'major-op-1',entityType:'trip_item',entityId:transportItem.id,operationType:'update',baseVersion:1,payload:{title:'Offline edit'}}),env,auth,tripId));assert(duplicate.operation.id===queued.operation.id,'sync idempotency');

const ready=await body(await readiness(req('https://test/api/v1/readiness'),env));assert(ready.ready===true,'major readiness passes');
console.log('Major local D1 integration passed: journeys, activities, booking details, contacts, markers, intelligence, sync and readiness.');
