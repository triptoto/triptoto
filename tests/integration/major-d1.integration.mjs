import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const emitDir=process.env.TRIPTO_EMIT_DIR;if(!emitDir)throw new Error('TRIPTO_EMIT_DIR is required.');
const load=async p=>import(pathToFileURL(resolve(emitDir,p)).href);
const journeys=await load('apps/worker/src/routes/journeys.js');
const activities=await load('apps/worker/src/routes/activities.js');
const booking=await load('apps/worker/src/routes/booking-details.js');
const contacts=await load('apps/worker/src/routes/contacts.js');
const markers=await load('apps/worker/src/routes/time-markers.js');
const intelligence=await load('apps/worker/src/routes/intelligence.js');
const sync=await load('apps/worker/src/routes/sync-v2.js');
const {readiness}=await load('apps/worker/src/routes/readiness.js');

class Prepared{constructor(db,sql,values=[]){this.db=db;this.sql=sql;this.values=values;}bind(...v){return new Prepared(this.db,this.sql,v);}async first(column){const row=this.db.prepare(this.sql).get(...this.values);if(!row)return null;return column?row[column]:row;}async all(){return{success:true,results:this.db.prepare(this.sql).all(...this.values)}}async run(){const info=this.db.prepare(this.sql).run(...this.values);return{success:true,meta:{changes:info.changes}}}}
class LocalD1{constructor(db){this.db=db;}prepare(q){return new Prepared(this.db,q);}async batch(statements){this.db.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());this.db.exec('COMMIT');return out;}catch(error){this.db.exec('ROLLBACK');throw error;}}}
function assert(value,label){if(!value)throw new Error(`Major integration assertion failed: ${label}`);}
async function body(response){const text=await response.text();return text?JSON.parse(text):null;}
function request(path,method='GET',data){return new Request(`https://test${path}`,{method,headers:data===undefined?{}:{'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});}

const db=new DatabaseSync(':memory:');for(const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(join('migrations',name),'utf8'));
const env={DB:new LocalD1(db),SESSION_SECRET:'x'.repeat(64),BETA_RELEASE:'major-beta-5-8',LIVE_FLIGHTS_ENABLED:'false',AI_ENABLED:'false',GMAIL_SYNC_ENABLED:'false',R2_DOCUMENTS_ENABLED:'false'};
const now=Date.now();
db.prepare(`INSERT INTO devices(id,platform,created_at,last_seen_at) VALUES ('device','web',?,?)`).run(now,now);
db.prepare(`INSERT INTO trips(id,created_by_device_id,title,lifecycle_state,starts_on,ends_on,created_at,updated_at,version) VALUES ('trip','device','Major integration','active','2027-04-01','2027-04-05',?,?,1)`).run(now,now);
db.prepare(`INSERT INTO travelers(id,trip_id,display_name,traveler_type,created_at,updated_at,version) VALUES ('traveler','trip','Alex','adult',?,?,1)`).run(now,now);
db.prepare(`INSERT INTO trip_items(id,trip_id,type,status,title,starts_at_utc,ends_at_utc,start_timezone,end_timezone,source_type,confidence,created_at,updated_at,version) VALUES ('flight1','trip','transport','confirmed','Flight 1',?,?,?,?, 'manual','confirmed',?,?,1)`).run(now+3600000,now+7200000,'Asia/Jerusalem','Europe/Rome',now,now);
db.prepare(`INSERT INTO trip_items(id,trip_id,type,status,title,starts_at_utc,ends_at_utc,start_timezone,end_timezone,source_type,confidence,created_at,updated_at,version) VALUES ('flight2','trip','transport','confirmed','Flight 2',?,?,?,?, 'manual','confirmed',?,?,1)`).run(now+7500000,now+10800000,'Europe/Rome','Europe/Paris',now,now);
db.prepare(`INSERT INTO connections(id,trip_id,from_item_id,to_item_id,connection_type,recommended_buffer_minutes,requires_baggage_reclaim,created_at,updated_at,version) VALUES ('connection','trip','flight1','flight2','self_transfer',120,1,?,?,1)`).run(now,now);
db.prepare(`INSERT INTO trip_checklist_items(id,trip_id,title,category,priority,completion_source,reminder_enabled,created_at,updated_at,version) VALUES ('passport','trip','Passport','documents','critical','none',0,?,?,1)`).run(now,now);
const auth={deviceId:'device'};

let response=await body(await journeys.createJourney(request('/api','POST',{title:'Outbound and return',journeyType:'round_trip',status:'planned'}),env,auth,'trip'));
assert(response.journey.id,'journey created');const journeyId=response.journey.id;
response=await body(await journeys.replaceJourneyItems(request('/api','PUT',{items:[{itemId:'flight1',sequenceNo:0,semanticRole:'outbound'},{itemId:'flight2',sequenceNo:1,semanticRole:'return'}]}),env,auth,'trip',journeyId));
assert(response.validation.issues.length===0,'journey validation clean');

response=await body(await activities.createActivity(request('/api','POST',{kind:'activity',title:'Museum',status:'confirmed',startsAtUtc:now+14400000,timezone:'Europe/Rome',confidence:'confirmed'}),env,auth,'trip'));
assert(response.item.id,'activity created');

response=await body(await booking.upsertBookingDetail(request('/api','PUT',{tripItemId:'flight1',travelerId:'traveler',seat:'12A',cabinClass:'economy',checkedBags:1}),env,auth,'trip'));
assert(response.bookingDetail.seat==='12A','booking detail created');

response=await body(await contacts.createContact(request('/api','POST',{contactType:'airline',displayName:'Airline desk',phone:'+100'}),env,auth,'trip'));
assert(response.contact.id,'contact created');
response=await body(await markers.createTimeMarker(request('/api','POST',{tripItemId:'flight1',markerType:'boarding',label:'Boarding',atUtc:now+3000000,confidence:'confirmed',sourceType:'manual'}),env,auth,'trip'));
assert(response.timeMarker.id,'time marker created');

response=await body(await intelligence.expandedTripHealth(request('/api'),env,auth,'trip',true));
assert(response.health.issueCount>=2,'expanded health detects issues');
assert(db.prepare(`SELECT COUNT(*) count FROM trip_health_runs WHERE trip_id='trip'`).get().count===1,'health run persisted');

response=await body(await sync.queueSyncOperation(request('/api','POST',{idempotencyKey:'key-1',entityType:'trip_checklist_item',entityId:'passport',operationType:'update',baseVersion:1,payload:{completed:true}}),env,auth,'trip'));
assert(response.operation.status==='pending','sync operation queued in safe mode');
const duplicate=await body(await sync.queueSyncOperation(request('/api','POST',{idempotencyKey:'key-1',entityType:'trip_checklist_item',entityId:'passport',operationType:'update',baseVersion:1,payload:{completed:true}}),env,auth,'trip'));
assert(duplicate.operation.id===response.operation.id,'sync idempotency returns same operation');
response=await body(await sync.acknowledgeSync(request('/api','POST',{lastChangeCreatedAt:now,lastChangeId:'cursor',pendingLocalOperations:1}),env,auth,'trip'));
assert(response.cursor.pending_local_operations===1,'sync cursor acknowledged');

const ready=await body(await readiness(request('/api/v1/readiness'),env));
assert(ready.ready===true,'major readiness confirms required schema');
assert(db.prepare(`SELECT COUNT(*) count FROM journey_groups`).get().count===1,'journey table populated');
assert(db.prepare(`SELECT COUNT(*) count FROM traveler_booking_details`).get().count===1,'booking details table populated');
assert(db.prepare(`SELECT COUNT(*) count FROM trip_contacts`).get().count===1,'contacts table populated');
assert(db.prepare(`SELECT COUNT(*) count FROM trip_time_markers`).get().count===1,'time markers table populated');

console.log('Major local D1 integration passed: travel management, health, sync and readiness.');
