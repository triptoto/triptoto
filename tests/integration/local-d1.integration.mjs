import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const emitDir=process.env.TRIPTO_EMIT_DIR;
if(!emitDir)throw new Error('TRIPTO_EMIT_DIR is required. Run via npm run test:integration.');
const load=async path=>import(pathToFileURL(resolve(emitDir,path)).href);
const { accountStatus, accountMigrationPreview }=await load('apps/worker/src/routes/account.js');
const { createDemoTrip }=await load('apps/worker/src/routes/demo.js');
const { exportTripJson, exportTripCalendar }=await load('apps/worker/src/routes/export.js');
const { tripSupportBundle }=await load('apps/worker/src/routes/support.js');
const { sharingStatus, previewInvite, createInvite, acceptInvite, listMembers, updateMemberRole, removeMember, revokeInvite, leaveTrip, transferOwnership }=await load('apps/worker/src/routes/sharing.js');
const { completeVerifiedIdentityLogin }=await load('apps/worker/src/verified-auth.js');
const { recalculateImpacts }=await load('apps/worker/src/routes/impacts.js');
const { refreshSession }=await load('apps/worker/src/routes/session.js');
const { previewForwardedEmail, previewUploadedDocument, listImports, resolveImportCandidate, listInboundEmails }=await load('apps/worker/src/routes/imports.js');
const { receiveBookingEmail }=await load('apps/worker/src/inbound-email.js');
const { assignBookingEmail, listBookingEmails }=await load('apps/worker/src/routes/booking-emails.js');
const { acknowledgeGoogleHandoff, createGoogleChallenge, exchangeGoogleHandoff, googleSignInRedirect, signOut }=await load('apps/worker/src/routes/google-auth.js');
const { requireAuth }=await load('apps/worker/src/auth.js');
const { betaStatus, recordClientBetaEvent }=await load('apps/worker/src/routes/beta.js');
const { enforceActorRateLimit, enforcePublicRateLimit }=await load('apps/worker/src/rate-limit.js');
const { deletionPreview, deleteMyData }=await load('apps/worker/src/routes/privacy.js');
const { opsSummary }=await load('apps/worker/src/routes/ops.js');
const { createLocation }=await load('apps/worker/src/routes/locations.js');
const { createStay }=await load('apps/worker/src/routes/stays.js');
const { createTransport }=await load('apps/worker/src/routes/transport.js');
const { createActivity }=await load('apps/worker/src/routes/activities.js');
const { createContact }=await load('apps/worker/src/routes/contacts.js');
const { liveFlightUsageSummary, refreshLiveFlightById, runScheduledLiveFlightRefresh, scheduleLiveFlightMonitoring }=await load('apps/worker/src/live-flights.js');
const { createTrip, updateTrip, deleteTrip }=await load('apps/worker/src/routes/trips.js');

class Prepared {
  constructor(db,sql,values=[]){this.db=db;this.sql=sql;this.values=values;}
  bind(...values){return new Prepared(this.db,this.sql,values);}
  async first(column){const row=this.db.prepare(this.sql).get(...this.values);if(!row)return null;return column?row[column]:row;}
  async all(){return {success:true,results:this.db.prepare(this.sql).all(...this.values)};}
  async run(){const info=this.db.prepare(this.sql).run(...this.values);return {success:true,meta:{changes:info.changes}};}
}
class LocalD1 {
  constructor(db){this.db=db;}
  prepare(query){return new Prepared(this.db,query);}
  async batch(statements){this.db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());this.db.exec('COMMIT');return out;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
function assert(condition,label){if(!condition)throw new Error(`Integration assertion failed: ${label}`);}
async function body(response){return JSON.parse(await response.text());}
function req(url,method='GET',data,headers={}){return new Request(url,{method,headers:{...(data!==undefined?{'content-type':'application/json'}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)});}
function formReq(url,data,cookie){return new Request(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8','cookie':cookie},body:new URLSearchParams(data).toString()});}
function addDevice(db,id,userId=null){const now=Date.now();db.prepare(`INSERT INTO devices(id,user_id,platform,app_version,api_version,created_at,last_seen_at) VALUES (?,?,'web','integration','v1',?,?)`).run(id,userId,now,now);}

const db=new DatabaseSync(':memory:');
for(const name of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync(join('migrations',name),'utf8'));
const env={DB:new LocalD1(db),SESSION_SECRET:'x'.repeat(64),ACCOUNT_AUTH_ENABLED:'false',SHARING_ENABLED:'false',DEMO_TOOLS_ENABLED:'true',DEMO_TOOLS_SECRET:'demo-secret-value-12345',LIVE_FLIGHTS_ENABLED:'false',AI_ENABLED:'false',GMAIL_SYNC_ENABLED:'false',R2_DOCUMENTS_ENABLED:'false',APP_BASE_URL:'https://app.tripto.test',BETA_RELEASE:'beta-milestone-4',BETA_METRICS_ENABLED:'true',OPS_ENABLED:'false'};
addDevice(db,'guest-device');
const guest={deviceId:'guest-device'};

const accountGuest=await body(await accountStatus(req('https://test/api/v1/account'),env,guest));
assert(accountGuest.account.mode==='guest','account status guest');

const demo=await body(await createDemoTrip(req('https://test/api/v1/internal/demo-trips','POST',{scenario:'self_transfer'},{'x-tripto-demo-secret':'demo-secret-value-12345'}),env,guest));
assert(demo.demo.tripId,'demo trip created');
const tripId=demo.demo.tripId;
assert(Number(db.prepare(`SELECT COUNT(*) c FROM connections WHERE trip_id=?`).get(tripId).c)===1,'self-transfer connection seeded');

const offlinePlace=await body(await createLocation(req('https://test/api/v1/trips/x/locations','POST',{placeId:'airport:iata:TLV',type:'airport',displayName:'Ben Gurion International Airport',city:'Tel Aviv',countryName:'Israel',countryCode:'IL',region:'Central District',latitude:32.0114,longitude:34.8867,timezone:'Asia/Jerusalem',iataCode:'tlv',icaoCode:'llbg'}),env,guest,tripId));
assert(offlinePlace.location.place_id==='airport:iata:TLV','stable offline place id stored');
assert(offlinePlace.location.country_name==='Israel'&&offlinePlace.location.region==='Central District','place snapshot context stored');
assert(offlinePlace.location.timezone==='Asia/Jerusalem'&&offlinePlace.location.iata_code==='TLV','place timezone and codes stored');
const previewBefore=await body(await accountMigrationPreview(req('https://test/api/v1/account/migration-preview'),env,guest));
assert(previewBefore.migration.trips===1,'migration preview sees guest trip');
assert(previewBefore.migration.timelineItems>=3,'migration preview sees timeline');

const sharingGuest=await body(await sharingStatus(req('https://test/api/v1/trips/x/sharing'),env,guest,tripId));
assert(sharingGuest.sharing.accountRequired===true,'sharing requires account for guest');

const exported=await body(await exportTripJson(req('https://test/api/v1/trips/x/export/json'),env,guest,tripId));
assert(exported.exportSchemaVersion===2,'export schema v2');
assert(exported.flights.length===2,'export contains demo flights');
assert(exported.travelers.length===1,'export contains traveler');
const calendar=await exportTripCalendar(req('https://test/api/v1/trips/x/export/calendar.ics'),env,guest,tripId);
const calendarText=await calendar.text();
assert(calendar.headers.get('content-type').includes('text/calendar'),'calendar content type');
assert(calendarText.includes('BEGIN:VCALENDAR')&&calendarText.includes('BEGIN:VEVENT'),'calendar contains events');
const support=await body(await tripSupportBundle(req('https://test/api/v1/trips/x/support'),env,guest,tripId));
assert(support.privacyNote.includes('No confirmation numbers'),'support bundle privacy note');
assert(support.counts.timeline_items>=3,'support bundle counts');

// Professional manual-entry semantics: arrival may remain unavailable, gate
// data persists, and activity traveler assignments are not silently ignored.
const fcoPlace=await body(await createLocation(req('https://test/api/v1/trips/x/locations','POST',{placeId:'airport:iata:FCO',type:'airport',displayName:'Rome Fiumicino Airport',city:'Rome',countryName:'Italy',countryCode:'IT',latitude:41.8003,longitude:12.2389,timezone:'Europe/Rome',iataCode:'FCO',icaoCode:'LIRF'}),env,guest,tripId));
const departureOnlyFlight=await body(await createTransport(req('https://test/api/v1/trips/x/transport','POST',{transportType:'flight',title:'LY383',marketingAirlineCode:'LY',marketingFlightNumber:'383',departureLocationId:offlinePlace.location.id,arrivalLocationId:fcoPlace.location.id,scheduledDepartureUtc:Date.UTC(2026,7,28,3,10),scheduledArrivalUtc:null,departureTimezone:'Asia/Jerusalem',arrivalTimezone:'Europe/Rome',departureTerminal:'3',departureGate:'D7'}),env,guest,tripId));
assert(departureOnlyFlight.item.scheduled_arrival_utc==null,'manual flight permits unavailable arrival');
assert(departureOnlyFlight.item.departure_gate==='D7'&&departureOnlyFlight.item.departure_terminal==='3','manual flight terminal and gate persist');
const travelerId=String(db.prepare(`SELECT id FROM travelers WHERE trip_id=? LIMIT 1`).get(tripId).id);
const manualActivity=await body(await createActivity(req('https://test/api/v1/trips/x/activities','POST',{kind:'activity',title:'Vatican Museums',startsAtUtc:Date.UTC(2026,7,29,8),timezone:'Europe/Rome',activityType:'museum',travelerIds:[travelerId]}),env,guest,tripId));
assert(db.prepare(`SELECT traveler_id FROM trip_item_travelers WHERE trip_item_id=?`).get(manualActivity.item.id).traveler_id===travelerId,'manual activity traveler assignment persists');

// Direct create retries are scoped to trip + authenticated device + opaque
// request ID. Replays return the original canonical booking, while a reused ID
// with different normalized details is rejected and overlapping requests never
// create a second booking.
const stayKey='manual-stay-request-0001',stayInput={propertyName:'Idempotent Hotel',checkInDate:'2026-08-28',checkOutDate:'2026-08-30',confirmationNumber:'PRIVATE-STAY-123',travelerIds:[travelerId]};
const createIdempotentStay=()=>createStay(req('https://test/api/v1/trips/x/stays','POST',stayInput,{'idempotency-key':stayKey}),env,guest,tripId);
const firstStay=await body(await createIdempotentStay()),replayedStay=await body(await createIdempotentStay());
assert(firstStay.stay.id===replayedStay.stay.id,'manual stay replay returns original booking');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM trip_items WHERE trip_id=? AND title='Idempotent Hotel'`).get(tripId).c)===1,'manual stay replay does not duplicate booking');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM change_events WHERE trip_id=? AND entity_id=? AND event_type='stay_added'`).get(tripId,firstStay.stay.id).c)===1,'manual stay create/replay emits one sync event');
db.prepare(`DELETE FROM change_events WHERE trip_id=? AND entity_id=? AND event_type='stay_added'`).run(tripId,firstStay.stay.id);
const repairedStay=await body(await createIdempotentStay());
assert(repairedStay.stay.id===firstStay.stay.id,'manual stay repair replay returns original booking');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM change_events WHERE trip_id=? AND entity_id=? AND event_type='stay_added'`).get(tripId,firstStay.stay.id).c)===1,'manual stay replay repairs a missing sync event exactly once');
let stayMismatch=false;
try{await createStay(req('https://test/api/v1/trips/x/stays','POST',{...stayInput,roomName:'Different request body'},{'idempotency-key':stayKey}),env,guest,tripId);}catch(error){stayMismatch=error.code==='IDEMPOTENCY_BODY_MISMATCH'&&error.status===409;}
assert(stayMismatch,'manual stay rejects reused request ID with different body');

// Secondary contact persistence uses its own stable key derived from the
// booking draft. A lost response can therefore be replayed without creating a
// second contact row or sync event.
const contactKey='manual-contact-request-0001',contactInput={contactType:'hotel',displayName:'Idempotent Hotel',phone:'+39 06 1234',tripItemId:firstStay.stay.id};
const createIdempotentContact=()=>createContact(req('https://test/api/v1/trips/x/contacts','POST',contactInput,{'idempotency-key':contactKey}),env,guest,tripId);
const firstContact=await body(await createIdempotentContact()),replayedContact=await body(await createIdempotentContact());
assert(firstContact.contact.id===replayedContact.contact.id,'secondary contact replay returns original contact');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM trip_contacts WHERE trip_id=? AND trip_item_id=? AND contact_type='hotel' AND deleted_at IS NULL`).get(tripId,firstStay.stay.id).c)===1,'secondary contact replay does not duplicate the item/type contact');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM change_events WHERE trip_id=? AND entity_type='trip_contact' AND entity_id=? AND event_type='contact_created'`).get(tripId,firstContact.contact.id).c)===1,'secondary contact replay emits one sync event');
db.prepare(`DELETE FROM change_events WHERE trip_id=? AND entity_type='trip_contact' AND entity_id=? AND event_type='contact_created'`).run(tripId,firstContact.contact.id);
await createIdempotentContact();
assert(Number(db.prepare(`SELECT COUNT(*) c FROM change_events WHERE trip_id=? AND entity_type='trip_contact' AND entity_id=? AND event_type='contact_created'`).get(tripId,firstContact.contact.id).c)===1,'secondary contact replay repairs a missing sync event exactly once');
let contactMismatch=false;
try{await createContact(req('https://test/api/v1/trips/x/contacts','POST',{...contactInput,phone:'+39 06 9999'},{'idempotency-key':contactKey}),env,guest,tripId);}catch(error){contactMismatch=error.code==='IDEMPOTENCY_BODY_MISMATCH'&&error.status===409;}
assert(contactMismatch,'secondary contact rejects a reused request ID with different details');

const activityKey='manual-activity-request-0001',activityInput={kind:'activity',title:'Idempotent Museum',startsAtUtc:Date.UTC(2026,7,30,8),timezone:'Europe/Rome',activityType:'museum',travelerIds:[travelerId]};
const firstActivity=await body(await createActivity(req('https://test/api/v1/trips/x/activities','POST',activityInput,{'x-tripto-client-request-id':activityKey}),env,guest,tripId));
const replayedActivity=await body(await createActivity(req('https://test/api/v1/trips/x/activities','POST',activityInput,{'x-tripto-client-request-id':activityKey}),env,guest,tripId));
assert(firstActivity.item.id===replayedActivity.item.id,'manual activity replay returns original booking');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM trip_items WHERE trip_id=? AND title='Idempotent Museum'`).get(tripId).c)===1,'manual activity replay does not duplicate booking');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM change_events WHERE trip_id=? AND entity_id=? AND event_type='activity_added'`).get(tripId,firstActivity.item.id).c)===1,'manual activity create/replay emits one sync event');

const transportKey='manual-flight-request-0001',transportInput={transportType:'flight',title:'LY 991',marketingAirlineCode:'LY',marketingFlightNumber:'991',departureLocationId:offlinePlace.location.id,arrivalLocationId:fcoPlace.location.id,scheduledDepartureUtc:Date.UTC(2026,7,31,3,10),scheduledArrivalUtc:null,departureTimezone:'Asia/Jerusalem',arrivalTimezone:'Europe/Rome',travelerIds:[travelerId]};
const concurrentTransport=()=>createTransport(req('https://test/api/v1/trips/x/transport','POST',transportInput,{'idempotency-key':transportKey}),env,guest,tripId).then(body);
const concurrentResults=await Promise.allSettled([concurrentTransport(),concurrentTransport()]);
assert(concurrentResults.some(result=>result.status==='fulfilled'),'one overlapping manual transport request succeeds');
assert(concurrentResults.filter(result=>result.status==='rejected').every(result=>result.reason?.code==='IDEMPOTENCY_IN_PROGRESS'),'overlapping loser is safely retryable');
const replayedTransport=await concurrentTransport();
const successfulTransport=concurrentResults.find(result=>result.status==='fulfilled').value;
assert(replayedTransport.item.id===successfulTransport.item.id,'manual transport overlap replay returns original booking');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM trip_items WHERE trip_id=? AND title='LY 991'`).get(tripId).c)===1,'overlapping manual transport requests create one booking');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM change_events WHERE trip_id=? AND entity_id=? AND event_type='transport_added'`).get(tripId,successfulTransport.item.id).c)===1,'manual transport overlap/replay emits one sync event');
const duplicateFcoPlace=await body(await createLocation(req('https://test/api/v1/trips/x/locations','POST',{placeId:'airport:iata:FCO',type:'airport',displayName:'Rome Fiumicino Airport',city:'Rome',countryName:'Italy',countryCode:'IT',latitude:41.8003,longitude:12.2389,timezone:'Europe/Rome',iataCode:'FCO',icaoCode:'LIRF'}),env,guest,tripId));
const replayedWithEquivalentLocation=await body(await createTransport(req('https://test/api/v1/trips/x/transport','POST',{...transportInput,arrivalLocationId:duplicateFcoPlace.location.id},{'idempotency-key':transportKey}),env,guest,tripId));
assert(replayedWithEquivalentLocation.item.id===successfulTransport.item.id,'generated duplicate place ID normalizes to the original booking request');
const idempotencyColumns=db.prepare(`PRAGMA table_info(manual_booking_idempotency)`).all().map(row=>row.name);
assert(!idempotencyColumns.some(name=>/body|payload|response|confirmation/i.test(name)),'manual idempotency table stores no request or booking payload');
assert(!db.prepare(`SELECT request_fingerprint FROM manual_booking_idempotency WHERE client_request_id=?`).get(stayKey).request_fingerprint.includes('PRIVATE-STAY-123'),'manual idempotency fingerprint does not expose confirmation data');

// Live flights are zero-call while disabled. When explicitly enabled for a
// beta environment, cache reuse does not consume quota or count as a second
// cancellation observation; only a later provider response can confirm it.
let providerCalls=0;
const disabledSchedule=await runScheduledLiveFlightRefresh(env,{provider:{name:'test',health:async()=>'healthy',getStatus:async()=>{providerCalls+=1;throw new Error('disabled provider called');}}});
assert(disabledSchedule.enabled===false&&providerCalls===0,'disabled live-flight cron makes zero provider calls');
Object.assign(env,{LIVE_FLIGHTS_ENABLED:'true',LIVE_FLIGHT_PROVIDER:'aerodatabox',LIVE_FLIGHT_BETA_ONLY:'false',LIVE_FLIGHT_DAILY_REQUEST_BUDGET:'2',LIVE_FLIGHT_MONTHLY_REQUEST_BUDGET:'2',LIVE_FLIGHT_MIN_REFRESH_MINUTES:'60',AERODATABOX_RAPIDAPI_KEY:'integration-server-only-key'});
const monitoredFlightId=successfulTransport.item.id,scheduledDeparture=Number(successfulTransport.item.scheduled_departure_utc),firstLiveNow=scheduledDeparture-4*60*60*1000;
await scheduleLiveFlightMonitoring(env,guest,tripId,monitoredFlightId,true,firstLiveNow);
let providerNow=firstLiveNow;
const cancellationProvider={name:'aerodatabox',health:async()=>'healthy',getStatus:async()=>{providerCalls+=1;return{available:true,provider:'aerodatabox',providerFlightId:'aerodatabox:LY991',matchStatus:'matched',confidence:100,operationalPhase:'scheduled',disruptionState:'cancelled',scheduledDepartureUtc:scheduledDeparture,departureTerminal:'3',departureGate:'D7',providerStatus:'Canceled',fetchedAt:providerNow};}};
let liveResult=await refreshLiveFlightById(env,guest,tripId,monitoredFlightId,{provider:cancellationProvider,now:providerNow});
assert(liveResult.outcome==='updated'&&providerCalls===1,'first provider observation stored');
let liveRow=db.prepare(`SELECT cancellation_signals,cancellation_confirmed_at FROM flight_live_status WHERE trip_item_id=?`).get(monitoredFlightId);
assert(liveRow.cancellation_signals===1&&liveRow.cancellation_confirmed_at==null,'first cancellation remains provisional');
providerNow=firstLiveNow+61*60*1000;
liveResult=await refreshLiveFlightById(env,guest,tripId,monitoredFlightId,{provider:cancellationProvider,now:providerNow});
liveRow=db.prepare(`SELECT cancellation_signals,cancellation_confirmed_at FROM flight_live_status WHERE trip_item_id=?`).get(monitoredFlightId);
assert(liveResult.outcome==='cached'&&providerCalls===1,'shared cache avoids a provider request');
assert(liveRow.cancellation_signals===1&&liveRow.cancellation_confirmed_at==null,'cached observation cannot confirm cancellation');
providerNow=firstLiveNow+121*60*1000;
liveResult=await refreshLiveFlightById(env,guest,tripId,monitoredFlightId,{provider:cancellationProvider,now:providerNow});
liveRow=db.prepare(`SELECT cancellation_signals,cancellation_confirmed_at FROM flight_live_status WHERE trip_item_id=?`).get(monitoredFlightId);
assert(liveResult.providerCalled===true&&providerCalls===2,'expired cache calls provider once');
assert(liveRow.cancellation_signals===2&&liveRow.cancellation_confirmed_at!=null,'independent provider observation confirms cancellation');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM change_events WHERE trip_id=? AND entity_id=? AND event_type='flight_cancelled_reported'`).get(tripId,monitoredFlightId).c)===1,'first cancellation creates one provisional event');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM change_events WHERE trip_id=? AND entity_id=? AND event_type='flight_cancelled_confirmed'`).get(tripId,monitoredFlightId).c)===1,'second independent signal creates one confirmation event');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM impact_assessments WHERE trip_id=? AND item_id=? AND status='active' AND explanation_code='FLIGHT_CANCELLATION_CONFIRMED'`).get(tripId,monitoredFlightId).c)===1,'confirmed cancellation creates one high-priority deterministic impact');
providerNow=firstLiveNow+182*60*1000;
liveResult=await refreshLiveFlightById(env,guest,tripId,monitoredFlightId,{provider:cancellationProvider,now:providerNow});
assert(liveResult.outcome==='quota_exhausted'&&providerCalls===2,'local quota blocks provider before network');
const liveUsage=await liveFlightUsageSummary(env,providerNow);
assert(liveUsage.usedMonth===2&&liveUsage.remainingMonth===0,'monthly usage ledger and guard are accurate');

// Cron selection remains bounded and prioritizes the flight departing soonest.
Object.assign(env,{LIVE_FLIGHT_DAILY_REQUEST_BUDGET:'20',LIVE_FLIGHT_MONTHLY_REQUEST_BUDGET:'20',LIVE_FLIGHT_MAX_BATCH_SIZE:'2'});
const cronFlights=[];
for(const [suffix,offsetHours] of [['A',2/3],['B',24],['C',120]]){
  const input={...transportInput,title:`Cron priority ${suffix}`,serviceNumber:`LY 99${suffix}`,marketingFlightNumber:`99${suffix}`,scheduledDepartureUtc:firstLiveNow+offsetHours*60*60*1000};
  const created=await body(await createTransport(req('https://test/api/v1/trips/x/transport','POST',input,{'idempotency-key':`cron-priority-flight-${suffix}`}),env,guest,tripId));
  cronFlights.push(created.item.id);
  await scheduleLiveFlightMonitoring(env,guest,tripId,created.item.id,true,firstLiveNow);
}
let cronProviderCalls=0;
const cronProvider={name:'aerodatabox',health:async()=>'healthy',getStatus:async lookup=>{cronProviderCalls+=1;return{available:true,provider:'aerodatabox',providerFlightId:`aerodatabox:${lookup.flightNumber}`,matchStatus:'matched',confidence:100,operationalPhase:'scheduled',disruptionState:'none',scheduledDepartureUtc:firstLiveNow+40*60*1000,providerStatus:'Expected',fetchedAt:firstLiveNow};}};
const cronRun=await runScheduledLiveFlightRefresh(env,{provider:cronProvider,now:firstLiveNow});
assert(cronRun.results.length===2&&cronProviderCalls<=2,'cron honors maximum batch size');
assert(cronRun.results.some(result=>result.itemId===cronFlights[0]),'cron prioritizes the flight departing in 40 minutes');
env.LIVE_FLIGHTS_ENABLED='false';

// Verified auth bridge: disabled by default, then enabled for an internally verified identity.
let disabled=false;
try{await completeVerifiedIdentityLogin(env,'guest-device',{provider:'email',providerSubject:'owner@example.test',email:'owner@example.test',emailVerified:true,displayName:'Owner'});}catch(e){disabled=e.code==='ACCOUNT_AUTH_DISABLED';}
assert(disabled,'auth bridge respects feature flag');
env.ACCOUNT_AUTH_ENABLED='true';
const login=await completeVerifiedIdentityLogin(env,'guest-device',{provider:'email',providerSubject:'owner@example.test',email:'owner@example.test',emailVerified:true,displayName:'Owner',locale:'en',timezone:'Asia/Jerusalem'});
assert(login.createdAccount===true,'verified auth creates account');
assert(login.migratedTrips===1,'verified auth migrates guest trip');
const owner={deviceId:'guest-device',userId:login.userId};
assert(db.prepare(`SELECT owner_user_id FROM trips WHERE id=?`).get(tripId).owner_user_id===login.userId,'trip owner migrated');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM identity_events WHERE user_id=? AND event_type='guest_migrated'`).get(login.userId).c)===1,'guest migration audit event');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM identity_events WHERE user_id=? AND event_type='identity_linked'`).get(login.userId).c)===1,'identity link audit event');

const accountOwner=await body(await accountStatus(req('https://test/api/v1/account'),env,owner));
assert(accountOwner.account.mode==='account','account status after verified login');
const refreshed=await body(await refreshSession(req('https://test/api/v1/session/refresh','POST',{}),env,owner));
assert(refreshed.token&&refreshed.accountMode===true,'account session refresh works');

// Returning verified identity on a new device maps to the same stable user.
addDevice(db,'returning-device');
const returning=await completeVerifiedIdentityLogin(env,'returning-device',{provider:'email',providerSubject:'owner@example.test',email:'owner@example.test',emailVerified:true,displayName:'Owner'});
assert(returning.createdAccount===false&&returning.userId===login.userId,'returning identity resolves stable user');
assert(db.prepare(`SELECT user_id FROM devices WHERE id='returning-device'`).get().user_id===login.userId,'returning device linked');

let rejectedUnverified=false;
addDevice(db,'bad-email-device');
try{await completeVerifiedIdentityLogin(env,'bad-email-device',{provider:'email',providerSubject:'bad@example.test',email:'bad@example.test',emailVerified:false});}catch(e){rejectedUnverified=e.code==='VERIFIED_EMAIL_REQUIRED';}
assert(rejectedUnverified,'unverified email cannot create account');

// Sharing lifecycle.
env.SHARING_ENABLED='true';
const inviteResponse=await body(await createInvite(req('https://test/api/v1/trips/x/invites','POST',{role:'editor',email:'friend@example.test',expiresInDays:3}),env,owner,tripId));
assert(inviteResponse.invite.token,'raw invite returned once');
assert(inviteResponse.invite.inviteUrl.includes('/join/'),'invite URL created');
assert(db.prepare(`SELECT token_hash FROM trip_invites WHERE id=?`).get(inviteResponse.invite.id).token_hash!==inviteResponse.invite.token,'raw invite not stored');

addDevice(db,'preview-device');
const previewGuest={deviceId:'preview-device'};
const invitePreview=await body(await previewInvite(req('https://test/api/v1/invites/preview','POST',{token:inviteResponse.invite.token}),env,previewGuest));
assert(invitePreview.invite.tripTitle,'invite preview includes trip title');
assert(invitePreview.invite.accountRequired===true,'invite preview tells guest account required');
assert(invitePreview.invite.emailRestricted===true,'invite preview hides email but signals restriction');

addDevice(db,'friend-device');
const friendLogin=await completeVerifiedIdentityLogin(env,'friend-device',{provider:'email',providerSubject:'friend@example.test',email:'friend@example.test',emailVerified:true,displayName:'Editor'});
const editor={deviceId:'friend-device',userId:friendLogin.userId};
const accepted=await body(await acceptInvite(req('https://test/api/v1/invites/accept','POST',{token:inviteResponse.invite.token}),env,editor));
assert(accepted.role==='editor','invite accepted as editor');
let members=await body(await listMembers(req('https://test/api/v1/trips/x/members'),env,owner,tripId));
assert(members.members.length===2,'owner and editor listed');
await updateMemberRole(req('https://test/api/v1/trips/x/members/y','PATCH',{role:'viewer'}),env,owner,tripId,friendLogin.userId);
members=await body(await listMembers(req('https://test/api/v1/trips/x/members'),env,owner,tripId));
assert(members.members.find(x=>x.user_id===friendLogin.userId).role==='viewer','member role updates');
await removeMember(req('https://test/api/v1/trips/x/members/y','DELETE',{}),env,owner,tripId,friendLogin.userId);
members=await body(await listMembers(req('https://test/api/v1/trips/x/members'),env,owner,tripId));
assert(members.members.length===1,'member removal works');

const revokeCandidate=await body(await createInvite(req('https://test/api/v1/trips/x/invites','POST',{role:'viewer',email:'another@example.test',expiresInDays:7}),env,owner,tripId));
await revokeInvite(req('https://test/api/v1/trips/x/invites/z','DELETE',{}),env,owner,tripId,revokeCandidate.invite.id);
assert(db.prepare(`SELECT status FROM trip_invites WHERE id=?`).get(revokeCandidate.invite.id).status==='revoked','invite revoke works');

// Collaboration authorization matrix (free for all signed-in users; roles enforced
// at the single access gate). Covers Section 20 release-blocker (editors cannot
// delete/cancel a trip), viewer read-only, leave-trip, and ownership transfer.
const collab=await body(await createTrip(req('https://test/api/v1/trips','POST',{title:'Shared Kyoto',lifecycleState:'upcoming',startsOn:'2026-11-01',endsOn:'2026-11-07'}),env,owner));
const collabTripId=collab.trip.id;
const collabInvite=await body(await createInvite(req('https://test/api/v1/trips/x/invites','POST',{role:'editor'}),env,owner,collabTripId));
addDevice(db,'collab-editor-device');
const collabEditorLogin=await completeVerifiedIdentityLogin(env,'collab-editor-device',{provider:'email',providerSubject:'collab-editor@example.test',email:'collab-editor@example.test',emailVerified:true,displayName:'Collab Editor'});
const collabEditor={deviceId:'collab-editor-device',userId:collabEditorLogin.userId};
await acceptInvite(req('https://test/api/v1/invites/accept','POST',{token:collabInvite.invite.token}),env,collabEditor);
assert(Number(db.prepare(`SELECT COUNT(*) c FROM change_events WHERE trip_id=? AND event_type='member_joined' AND actor_user_id=?`).get(collabTripId,collabEditorLogin.userId).c)===1,'member_joined recorded with actor attribution');

// Editor may add bookings but not delete or cancel/edit the trip shell.
const editorStay=await body(await createStay(req('https://test/api/v1/trips/x/stays','POST',{propertyName:'Editor Ryokan',checkInDate:'2026-11-02',checkOutDate:'2026-11-04'}),env,collabEditor,collabTripId));
assert(editorStay.stay.id,'editor can add a booking to a shared trip');
let collabVersion=Number(db.prepare(`SELECT version FROM trips WHERE id=?`).get(collabTripId).version);
let editorDeleteBlocked=false;
try{await deleteTrip(req('https://test/api/v1/trips/x','DELETE',{version:collabVersion}),env,collabEditor,collabTripId);}catch(e){editorDeleteBlocked=e.code==='OWNER_REQUIRED'&&e.status===403;}
assert(editorDeleteBlocked,'editor cannot delete a shared trip (Section 20 release-blocker)');
let editorCancelBlocked=false;
try{await updateTrip(req('https://test/api/v1/trips/x','PATCH',{lifecycleState:'cancelled',version:collabVersion}),env,collabEditor,collabTripId);}catch(e){editorCancelBlocked=e.code==='OWNER_REQUIRED'&&e.status===403;}
assert(editorCancelBlocked,'editor cannot cancel or edit trip metadata');
assert(db.prepare(`SELECT deleted_at,lifecycle_state FROM trips WHERE id=?`).get(collabTripId).deleted_at==null,'shared trip survives editor delete/cancel attempts');

// Viewer is strictly read-only for trip content.
await updateMemberRole(req('https://test/api/v1/trips/x/members/y','PATCH',{role:'viewer'}),env,owner,collabTripId,collabEditorLogin.userId);
let viewerWriteBlocked=false;
try{await createStay(req('https://test/api/v1/trips/x/stays','POST',{propertyName:'Viewer Cannot',checkInDate:'2026-11-03',checkOutDate:'2026-11-05'}),env,collabEditor,collabTripId);}catch(e){viewerWriteBlocked=e.code==='FORBIDDEN'&&e.status===403;}
assert(viewerWriteBlocked,'viewer cannot write trip content');

// Leaving a trip: owner cannot leave; a member can, idempotently.
let ownerLeaveBlocked=false;
try{await leaveTrip(req('https://test/api/v1/trips/x/leave','POST',{}),env,owner,collabTripId);}catch(e){ownerLeaveBlocked=e.code==='OWNER_CANNOT_LEAVE'&&e.status===409;}
assert(ownerLeaveBlocked,'owner cannot leave the trip');
const leaveResp=await leaveTrip(req('https://test/api/v1/trips/x/leave','POST',{}),env,collabEditor,collabTripId);
assert(leaveResp.status===204,'member can leave the trip');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM trip_members WHERE trip_id=? AND user_id=? AND status='active'`).get(collabTripId,collabEditorLogin.userId).c)===0,'left member is no longer active');
const leaveAgain=await leaveTrip(req('https://test/api/v1/trips/x/leave','POST',{}),env,collabEditor,collabTripId);
assert(leaveAgain.status===204,'leaving twice is idempotent');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM change_events WHERE trip_id=? AND event_type='member_left' AND actor_user_id=?`).get(collabTripId,collabEditorLogin.userId).c)===1,'member_left recorded once with actor attribution');

// Ownership transfer: atomic promotion, previous owner demoted to editor, never ownerless.
const transferInvite=await body(await createInvite(req('https://test/api/v1/trips/x/invites','POST',{role:'editor'}),env,owner,collabTripId));
await acceptInvite(req('https://test/api/v1/invites/accept','POST',{token:transferInvite.invite.token}),env,collabEditor);
let nonOwnerTransferBlocked=false;
try{await transferOwnership(req('https://test/api/v1/trips/x/transfer-ownership','POST',{userId:login.userId}),env,collabEditor,collabTripId);}catch(e){nonOwnerTransferBlocked=(e.code==='OWNER_REQUIRED'||e.code==='FORBIDDEN')&&e.status===403;}
assert(nonOwnerTransferBlocked,'non-owner cannot transfer ownership');
const transfer=await body(await transferOwnership(req('https://test/api/v1/trips/x/transfer-ownership','POST',{userId:collabEditorLogin.userId}),env,owner,collabTripId));
assert(transfer.ownerUserId===collabEditorLogin.userId,'ownership transfer returns new owner');
assert(db.prepare(`SELECT owner_user_id FROM trips WHERE id=?`).get(collabTripId).owner_user_id===collabEditorLogin.userId,'trips.owner_user_id updated on transfer');
assert(db.prepare(`SELECT role FROM trip_members WHERE trip_id=? AND user_id=?`).get(collabTripId,collabEditorLogin.userId).role==='owner','new owner has owner role');
assert(db.prepare(`SELECT role FROM trip_members WHERE trip_id=? AND user_id=?`).get(collabTripId,login.userId).role==='editor','previous owner demoted to editor');
// The previous owner (now editor, same creator device) can no longer delete the shared trip.
collabVersion=Number(db.prepare(`SELECT version FROM trips WHERE id=?`).get(collabTripId).version);
let demotedOwnerDeleteBlocked=false;
try{await deleteTrip(req('https://test/api/v1/trips/x','DELETE',{version:collabVersion}),env,owner,collabTripId);}catch(e){demotedOwnerDeleteBlocked=e.code==='OWNER_REQUIRED'&&e.status===403;}
assert(demotedOwnerDeleteBlocked,'previous owner (now editor) cannot delete after transfer');
// The new owner deletes successfully.
const newOwnerDelete=await deleteTrip(req('https://test/api/v1/trips/x','DELETE',{version:collabVersion}),env,collabEditor,collabTripId);
assert(newOwnerDelete.status===204,'new owner can delete the trip');
assert(db.prepare(`SELECT deleted_at FROM trips WHERE id=?`).get(collabTripId).deleted_at!=null,'owner delete soft-deletes the trip');

// A guest owner of an unshared trip can still delete their own trip (no account required).
addDevice(db,'solo-guest-device');
const soloGuest={deviceId:'solo-guest-device'};
const soloTrip=await body(await createDemoTrip(req('https://test/api/v1/internal/demo-trips','POST',{scenario:'normal'},{'x-tripto-demo-secret':'demo-secret-value-12345'}),env,soloGuest));
const soloVersion=Number(db.prepare(`SELECT version FROM trips WHERE id=?`).get(soloTrip.demo.tripId).version);
const soloDelete=await deleteTrip(req('https://test/api/v1/trips/x','DELETE',{version:soloVersion}),env,soloGuest,soloTrip.demo.tripId);
assert(soloDelete.status===204,'guest owner can delete their own unshared trip');

// QA scenario: airport change should calculate a high-consequence connection problem.
addDevice(db,'qa-device');
const qa={deviceId:'qa-device'};
const airportDemo=await body(await createDemoTrip(req('https://test/api/v1/internal/demo-trips','POST',{scenario:'airport_change'},{'x-tripto-demo-secret':'demo-secret-value-12345'}),env,qa));
const impacts=await body(await recalculateImpacts(req('https://test/api/v1/trips/x/impacts/recalculate','POST',{}),env,qa,airportDemo.demo.tripId));
assert(impacts.impacts.some(x=>x.explanationCode==='AIRPORT_CHANGE_TOO_TIGHT'&&x.severity==='critical'),'airport-change scenario triggers critical impact');

// Every internal QA scenario must remain schema-valid.
for(const scenario of ['normal','overnight','family','missing_essentials','date_line','cancelled_flight','road_trip','provider_outage']){
  const deviceId='qa-'+scenario;addDevice(db,deviceId);const auth={deviceId};
  const made=await body(await createDemoTrip(req('https://test/api/v1/internal/demo-trips','POST',{scenario},{'x-tripto-demo-secret':'demo-secret-value-12345'}),env,auth));
  assert(!!made.demo.tripId,`demo scenario ${scenario} created`);
  if(scenario==='cancelled_flight')assert(Number(db.prepare(`SELECT COUNT(*) c FROM flights f JOIN trip_items ti ON ti.id=f.trip_item_id WHERE ti.trip_id=? AND f.disruption_state='cancelled'`).get(made.demo.tripId).c)===1,'cancelled flight scenario state');
  if(scenario==='road_trip')assert(Number(db.prepare(`SELECT COUNT(*) c FROM transport_segments ts JOIN trip_items ti ON ti.id=ts.trip_item_id WHERE ti.trip_id=? AND ts.transport_type='car'`).get(made.demo.tripId).c)===2,'road trip has two drives');
  if(scenario==='provider_outage')assert(Number(db.prepare(`SELECT COUNT(*) c FROM alerts WHERE trip_id=? AND type='provider_outage'`).get(made.demo.tripId).c)===1,'provider outage alert seeded');
}


// Forwarded-email import: raw body is not stored, duplicates are idempotent, confirmation materializes only after user review.
const importBody={sender:'airline@example.test',subject:'Fwd: Flight confirmation',body:'Booking reference: ABC123\\nFlight: LY 383\\nTLV -> FCO\\nDeparture: 2026-09-01 10:30\\nArrival: 2026-09-01 13:15'};
const previewImport=await body(await previewForwardedEmail(req('https://test/api/v1/trips/x/imports/forwarded-email/preview','POST',importBody),env,owner,tripId));
assert(previewImport.import.status==='needs_confirmation','import needs confirmation');
assert(previewImport.privacy.rawBodyStored===false,'raw forwarded body not stored');
assert(previewImport.candidates.length===1&&previewImport.candidates[0].candidate_type==='flight','flight import candidate');
const duplicateImport=await body(await previewForwardedEmail(req('https://test/api/v1/trips/x/imports/forwarded-email/preview','POST',importBody),env,owner,tripId));
assert(duplicateImport.duplicate===true&&duplicateImport.import.id===previewImport.import.id,'duplicate import is idempotent');
const importCandidate=previewImport.candidates[0];
const resolvedImport=await body(await resolveImportCandidate(req('https://test/api/v1/trips/x/imports/y/resolve','POST',{candidateId:importCandidate.id,action:'confirm',payload:{airlineCode:'LY',flightNumber:'383',departureIata:'TLV',arrivalIata:'FCO',scheduledDepartureUtc:Date.UTC(2026,8,1,7,30),scheduledArrivalUtc:Date.UTC(2026,8,1,11,15),departureTimezone:'Asia/Jerusalem',arrivalTimezone:'Europe/Rome',confirmationNumber:'ABC123'}}),env,owner,tripId,previewImport.import.id));
assert(resolvedImport.resolved==='confirmed','import candidate confirmed');
assert(db.prepare(`SELECT source_type FROM trip_items WHERE id=?`).get(resolvedImport.entityId).source_type==='email','confirmed import materializes email-sourced item');
const importsAfter=await body(await listImports(req('https://test/api/v1/trips/x/imports'),env,owner,tripId));
assert(importsAfter.imports.some(x=>x.id===previewImport.import.id&&x.status==='completed'),'import completes after confirmation');
assert(!Object.keys(db.prepare(`SELECT * FROM import_messages WHERE import_id=?`).get(previewImport.import.id)).some(k=>/body|raw|content/i.test(k)),'import message schema stores no raw body');

// Inbound Email Routing pipeline (end-to-end through the actual email() handler):
// raw MIME in → safe parse → verified-sender gate → deterministic trip match →
// review package only (never auto-create) → idempotent dedup.
function inboundMessage(from,to,rawText){
  const bytes=new TextEncoder().encode(rawText);
  const raw=new ReadableStream({start(c){c.enqueue(bytes);c.close();}});
  const state={rejected:null};
  const message={from,to,raw,headers:new Headers(),setReject(reason){state.rejected=reason;}};
  return {message,state};
}
async function inboundCount(user){return Number(db.prepare(`SELECT COUNT(*) c FROM inbound_booking_emails WHERE user_id=?`).get(user).c);}

// Seed a verified sender for the owner account.
db.prepare(`INSERT INTO verified_sender_emails(id,user_id,email,email_normalized,source,verified_at,created_at) VALUES (?,?,?,?,'google_identity',?,?)`).run('vse-owner',login.userId,'traveler@example.test','traveler@example.test',Date.now(),Date.now());

// Unknown recipient is rejected before any processing.
const wrongRecipient=inboundMessage('traveler@example.test','someone-else@tripto.to','Subject: x\r\n\r\nhi');
await receiveBookingEmail(wrongRecipient.message,env);
assert(wrongRecipient.state.rejected==='Unknown recipient','inbound rejects unknown recipient');

// Unverified sender is bounced (recoverable), never silently dropped, and writes no row.
const beforeUnverified=await inboundCount(login.userId);
const stranger=inboundMessage('stranger@example.test','go@tripto.to','Subject: Hotel\r\nContent-Type: text/plain\r\n\r\nHotel: Somewhere\r\nConfirmation: ZZZ1');
await receiveBookingEmail(stranger.message,env);
assert(stranger.state.rejected==='Sender is not verified','inbound bounces unverified sender');
assert(await inboundCount(login.userId)===beforeUnverified,'unverified sender writes no inbound row');

// Verified sender, HIGH-confidence hotel via multipart/alternative → review only.
const hotelMime=[
  'Subject: Your hotel booking is confirmed',
  'From: Traveler <traveler@example.test>',
  'Message-ID: <hotel-1@example.test>',
  'Content-Type: multipart/alternative; boundary="HB"',
  '',
  '--HB',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Hotel: Grand Test Hotel',
  'Address: Via Nazionale 22, Roma',
  'Confirmation number: HB-778899',
  'Check-in: 1 September 2026',
  'Check-out: 5 September 2026',
  '--HB',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<html><body><script>fetch("https://evil.test")</script><p>Grand Test Hotel</p></body></html>',
  '--HB--',
].join('\r\n');
const hotel=inboundMessage('traveler@example.test','go@tripto.to',hotelMime);
await receiveBookingEmail(hotel.message,env);
assert(hotel.state.rejected===null,'verified hotel email accepted');
const hotelRow=db.prepare(`SELECT * FROM inbound_booking_emails WHERE message_fingerprint IS NOT NULL AND subject LIKE 'Your hotel booking%'`).get();
assert(hotelRow&&hotelRow.status==='needs_confirmation','HIGH-confidence hotel still needs traveler confirmation');
assert(hotelRow.user_id===login.userId&&hotelRow.trip_id===tripId,'inbound hotel attached to the owner trip');
const emailStay=db.prepare(`SELECT * FROM trip_items WHERE trip_id=? AND type='stay' AND title='Grand Test Hotel'`).get(tripId);
assert(!emailStay,'forwarded hotel does not materialize before traveler confirmation');
assert(db.prepare(`SELECT status FROM imports WHERE id=?`).get(hotelRow.import_id).status==='needs_confirmation','hotel import remains reviewable');

// Forwarding the SAME hotel email again is idempotent: no new inbound row, no duplicate booking.
const beforeDup=await inboundCount(login.userId);
const stayCountBefore=Number(db.prepare(`SELECT COUNT(*) c FROM trip_items WHERE trip_id=? AND type='stay'`).get(tripId).c);
const hotelDup=inboundMessage('traveler@example.test','go@tripto.to',hotelMime);
await receiveBookingEmail(hotelDup.message,env);
assert(await inboundCount(login.userId)===beforeDup,'duplicate forward creates no second inbound row');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM trip_items WHERE trip_id=? AND type='stay'`).get(tripId).c)===stayCountBefore,'duplicate forward creates no booking');

// Verified flight email is never auto-scheduled (timezone unknown) → surfaced for review.
const flightMime=[
  'Subject: Flight confirmation LY383',
  'From: traveler@example.test',
  'Message-ID: <flight-1@example.test>',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Booking reference: FL-123',
  'Flight: LY 383',
  'TLV -> FCO',
  'Departure: 2026-09-01 10:30',
  'Arrival: 2026-09-01 13:15',
].join('\r\n');
const flight=inboundMessage('traveler@example.test','go@tripto.to',flightMime);
await receiveBookingEmail(flight.message,env);
const flightRow=db.prepare(`SELECT * FROM inbound_booking_emails WHERE subject LIKE 'Flight confirmation%'`).get();
assert(flightRow&&flightRow.status==='needs_confirmation','flight is surfaced for review, never silently scheduled');
assert(db.prepare(`SELECT candidate_type FROM import_candidates WHERE import_id=?`).get(flightRow.import_id).candidate_type==='flight','flight candidate stored pending review');

// User-facing inbound feed exposes the six-state vocabulary via display_status.
const inboundFeed=await body(await listInboundEmails(req('https://test/api/v1/inbound-emails'),env,owner));
assert(inboundFeed.emails.filter(x=>x.display_status==='needs_review').length>=2,'inbound feed reports review states');

// With more than one eligible trip and no decisive booking signal, keep a fully
// parsed, unassigned import in Email Inbox. Choosing a trip updates only the
// review package; it still does not materialize a booking.
const secondTrip=await body(await createTrip(req('https://test/api/v1/trips','POST',{title:'Milan work trip',lifecycleState:'upcoming',startsOn:'2026-10-02',endsOn:'2026-10-05'}),env,owner));
const ambiguous=inboundMessage('traveler@example.test','go@tripto.to',[
  'Subject: Hotel confirmation',
  'Message-ID: <ambiguous-hotel@example.test>',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Hotel: City Center Hotel',
  'Confirmation number: CITY44',
].join('\r\n'));
await receiveBookingEmail(ambiguous.message,env);
assert(!ambiguous.state.rejected,'verified ambiguous email accepted');
const ambiguousRow=db.prepare(`SELECT * FROM inbound_booking_emails WHERE subject='Hotel confirmation' AND message_fingerprint IS NOT NULL ORDER BY received_at DESC LIMIT 1`).get();
assert(ambiguousRow.status==='needs_trip'&&ambiguousRow.trip_id==null&&ambiguousRow.import_id,'ambiguous email is retained as a reviewable needs-trip item');
assert(db.prepare(`SELECT trip_id FROM imports WHERE id=?`).get(ambiguousRow.import_id).trip_id==null,'unassigned import never guesses a trip');
const inbox=await body(await listBookingEmails(req('https://test/api/v1/booking-emails'),env,owner));
assert(inbox.bookingEmails.some(row=>row.id===ambiguousRow.id&&row.candidate_count===1),'Email Inbox exposes the pending candidate');
const beforeAssignCount=Number(db.prepare(`SELECT COUNT(*) c FROM trip_items`).get().c);
const assigned=await body(await assignBookingEmail(req('https://test/api/v1/booking-emails/x/assign','POST',{tripId:secondTrip.trip.id}),env,owner,ambiguousRow.id));
assert(assigned.tripId===secondTrip.trip.id&&assigned.importId===ambiguousRow.import_id,'traveler can assign email to the selected trip');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM trip_items`).get().c)===beforeAssignCount,'assigning a trip does not add a booking before confirmation');

// Smart upload import receives structured fields and checksum only, detects duplicates, and materializes after review.
const checksum='a'.repeat(64),uploadBody={checksum,filename:'hotel-confirmation.pdf',documentKind:'pdf',candidate:{type:'hotel',confidence:.86,fields:{propertyName:{value:'Hotel Test',confidence:.9,source:'embedded_text'},checkInDate:{value:'2026-09-01',confidence:.8,source:'embedded_text'},checkOutDate:{value:'2026-09-03',confidence:.8,source:'embedded_text'},confirmationNumber:{value:'HOT123',confidence:.8,source:'barcode'}},warnings:[]}};
const upload=await body(await previewUploadedDocument(req('https://test/api/v1/trips/x/imports/upload/preview','POST',uploadBody),env,owner,tripId));
assert(upload.privacy.rawBytesReceived===false&&upload.privacy.extractedTextReceived===false,'upload endpoint receives no bytes or OCR text');
assert(upload.candidates[0].candidate_type==='hotel','hotel upload candidate created');
const uploadDuplicate=await body(await previewUploadedDocument(req('https://test/api/v1/trips/x/imports/upload/preview','POST',uploadBody),env,owner,tripId));
assert(uploadDuplicate.duplicate===true&&uploadDuplicate.actions.includes('add_anyway'),'upload duplicate offers explicit choices');
const uploadResolved=await body(await resolveImportCandidate(req('https://test/api/v1/trips/x/imports/y/resolve','POST',{candidateId:upload.candidates[0].id,action:'confirm',payload:{candidateType:'hotel'}}),env,owner,tripId,upload.import.id));
assert(uploadResolved.candidateType==='hotel','reviewed upload type preserved');
assert(db.prepare(`SELECT source_type FROM trip_items WHERE id=?`).get(uploadResolved.entityId).source_type==='upload','confirmed upload materializes upload-sourced item');
// Regression (resolve idempotency): a second confirm of an already-resolved
// candidate must not create a second booking. The status flip is the atomic
// claim gate, so the replay is rejected with 409 IMPORT_ALREADY_RESOLVED.
const tripItemsAfterResolve=Number(db.prepare(`SELECT COUNT(*) c FROM trip_items WHERE trip_id=?`).get(tripId).c);
let resolveReplayRejected=false;
try{await resolveImportCandidate(req('https://test/api/v1/trips/x/imports/y/resolve','POST',{candidateId:upload.candidates[0].id,action:'confirm',payload:{candidateType:'hotel'}}),env,owner,tripId,upload.import.id);}catch(error){resolveReplayRejected=error.code==='IMPORT_ALREADY_RESOLVED'&&error.status===409;}
assert(resolveReplayRejected,'re-confirming a resolved candidate is rejected with 409');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM trip_items WHERE trip_id=?`).get(tripId).c)===tripItemsAfterResolve,'resolve replay creates no duplicate booking');
assert(db.prepare(`SELECT COUNT(*) c FROM import_messages WHERE import_id=? AND normalized_hash=?`).get(upload.import.id,checksum).c===1,'only checksum metadata is stored');
// Regression (cross-tenant upload dedup): the dedup domain must be per-trip. The
// stored fingerprint is namespaced by trip, and the SAME file checksum uploaded
// to a DIFFERENT trip is NOT flagged as a duplicate of another trip's import
// (before the fix the global UNIQUE(source_type,source_fingerprint) + untrip-scoped
// SELECT leaked another owner's import and blocked the upload).
assert(String(db.prepare(`SELECT source_fingerprint f FROM imports WHERE id=?`).get(upload.import.id).f).startsWith(`${tripId}:`),'upload dedup fingerprint is namespaced by trip');
const crossTenantTripId='cross-tenant-trip';
const crossNow=Date.now();
db.prepare(`INSERT INTO trips(id,owner_user_id,created_by_device_id,title,lifecycle_state,starts_on,ends_on,created_at,updated_at,version) VALUES (?,?,NULL,'Other trip','upcoming','2026-09-01','2026-09-03',?,?,1)`).run(crossTenantTripId,login.userId,crossNow,crossNow);
const crossTenantUpload=await body(await previewUploadedDocument(req('https://test/api/v1/trips/x/imports/upload/preview','POST',uploadBody),env,owner,crossTenantTripId));
assert(crossTenantUpload.duplicate!==true&&crossTenantUpload.candidates?.[0]?.candidate_type==='hotel','identical checksum in another trip is not treated as a cross-trip duplicate');
assert(String(db.prepare(`SELECT source_fingerprint f FROM imports WHERE id=?`).get(crossTenantUpload.import.id).f).startsWith(`${crossTenantTripId}:`),'second trip gets its own trip-scoped fingerprint');

// Google account controls are gated and sign-out rotates to a new guest device without deleting account data.
env.GOOGLE_CLIENT_ID='test-client.apps.googleusercontent.com';
const challenge=await body(await createGoogleChallenge(req('https://test/api/v1/auth/google/challenge','POST',{}),env,owner));
assert(challenge.nonce&&challenge.clientId===env.GOOGLE_CLIENT_ID,'Google challenge created only when configured');
assert(challenge.redirect.loginUri==='https://app.tripto.test/api/v1/auth/google/callback'&&challenge.redirect.state===challenge.challengeId,'Google redirect challenge is same-origin and opaque');

// iOS redirect: signed Google credential + double-submit CSRF migrates the
// bound guest, then a short-lived HttpOnly cookie is exchanged and acknowledged.
addDevice(db,'google-redirect-device');
const redirectGuest={deviceId:'google-redirect-device'};
const redirectTrip=await body(await createDemoTrip(req('https://app.tripto.test/api/v1/internal/demo-trips','POST',{scenario:'normal'},{'x-tripto-demo-secret':'demo-secret-value-12345'}),env,redirectGuest));
const redirectChallenge=await body(await createGoogleChallenge(new Request('https://app.tripto.test/api/v1/auth/google/challenge',{method:'POST'}),env,redirectGuest));
const googlePair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const googleJwk=await crypto.subtle.exportKey('jwk',googlePair.publicKey);Object.assign(googleJwk,{kid:'redirect-test-key',alg:'RS256',use:'sig'});
const b64url=value=>{const bytes=typeof value==='string'?new TextEncoder().encode(value):value;let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
async function googleToken(nonce,subject='google-redirect-subject'){
  const now=Math.floor(Date.now()/1000),header=b64url(JSON.stringify({alg:'RS256',kid:'redirect-test-key',typ:'JWT'})),payload=b64url(JSON.stringify({iss:'https://accounts.google.com',aud:env.GOOGLE_CLIENT_ID,sub:subject,email:'redirect@example.test',email_verified:true,name:'Redirect Traveler',nonce,iat:now,exp:now+600})),data=`${header}.${payload}`,signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',googlePair.privateKey,new TextEncoder().encode(data));
  return `${data}.${b64url(new Uint8Array(signature))}`;
}
const originalGoogleFetch=globalThis.fetch;
globalThis.fetch=async()=>new Response(JSON.stringify({keys:[googleJwk]}),{status:200,headers:{'cache-control':'public,max-age=300'}});
const redirectCredential=await googleToken(redirectChallenge.nonce),csrfToken='csrf-redirect-123';
const callbackUrl='https://app.tripto.test/api/v1/auth/google/callback';
const callbackData={credential:redirectCredential,g_csrf_token:csrfToken,state:redirectChallenge.redirect.state};
const callback=await googleSignInRedirect(formReq(callbackUrl,callbackData,`g_csrf_token=${csrfToken}`),env);
globalThis.fetch=originalGoogleFetch;
assert(callback.status===303,'Google redirect callback returns see-other');
const callbackLocation=new URL(callback.headers.get('location'));
assert(callbackLocation.origin==='https://app.tripto.test'&&callbackLocation.pathname==='/account'&&callbackLocation.searchParams.get('google_auth')==='complete','Google callback uses fixed non-secret landing marker');
assert(!callbackLocation.hash&&!callback.headers.get('location').includes(redirectCredential),'Google callback URL contains no bearer or ID credential');
const handoffSetCookie=callback.headers.get('set-cookie')||'';
assert(handoffSetCookie.startsWith('__Secure-tripto_google_transfer=')&&handoffSetCookie.includes('Max-Age=120')&&handoffSetCookie.includes('HttpOnly')&&handoffSetCookie.includes('Secure')&&handoffSetCookie.includes('SameSite=Lax')&&handoffSetCookie.includes('Path=/api/v1/auth/google/exchange'),'Google transfer cookie is short-lived and tightly scoped');
const handoffCookie=handoffSetCookie.split(';')[0];
const exchangeRequest=new Request('https://app.tripto.test/api/v1/auth/google/exchange',{method:'POST',headers:{'content-type':'application/json','origin':'https://app.tripto.test','cookie':handoffCookie},body:'{}'});
const exchangedResponse=await exchangeGoogleHandoff(exchangeRequest,env),exchanged=await body(exchangedResponse);
assert(exchangedResponse.status===200&&exchanged.session.token&&exchanged.account.userId,'Google handoff returns the normal session');
assert(!exchangedResponse.headers.get('set-cookie'),'Google exchange remains retryable until client acknowledgment');
const redirectAuth=await requireAuth(new Request('https://app.tripto.test/api/v1/account',{headers:{authorization:`Bearer ${exchanged.session.token}`}}),env);
assert(redirectAuth.deviceId==='google-redirect-device'&&redirectAuth.userId===exchanged.account.userId,'exchanged session is bound to migrated device and account');
assert(db.prepare(`SELECT owner_user_id FROM trips WHERE id=?`).get(redirectTrip.demo.tripId).owner_user_id===exchanged.account.userId,'redirect login migrates the guest trip');
assert(db.prepare(`SELECT used_at FROM auth_challenges WHERE id=?`).get(redirectChallenge.challengeId).used_at==null,'redirect transfer remains available until acknowledgment');

const [transferName,transferValue]=handoffCookie.split('='),tamperedTransfer=`${transferValue.slice(0,-1)}${transferValue.endsWith('0')?'1':'0'}`;
const tamperedExchange=await exchangeGoogleHandoff(new Request('https://app.tripto.test/api/v1/auth/google/exchange',{method:'POST',headers:{'content-type':'application/json','origin':'https://app.tripto.test','cookie':`${transferName}=${tamperedTransfer}`},body:'{}'}),env);
assert(tamperedExchange.status===401&&db.prepare(`SELECT used_at FROM auth_challenges WHERE id=?`).get(redirectChallenge.challengeId).used_at==null,'wrong transfer secret is rejected without consuming valid transfer');
const retryExchange=await exchangeGoogleHandoff(new Request('https://app.tripto.test/api/v1/auth/google/exchange',{method:'POST',headers:{'content-type':'application/json','origin':'https://app.tripto.test','cookie':handoffCookie},body:'{}'}),env);
assert(retryExchange.status===200,'Google exchange is idempotently retryable before acknowledgment');
addDevice(db,'wrong-ack-device');
let wrongAckRejected=false;
try{await acknowledgeGoogleHandoff(new Request('https://app.tripto.test/api/v1/auth/google/exchange/ack',{method:'POST',headers:{'content-type':'application/json','origin':'https://app.tripto.test','cookie':handoffCookie},body:'{}'}),env,{deviceId:'wrong-ack-device'});}catch(error){wrongAckRejected=error.code==='GOOGLE_SIGN_IN_FAILED';}
assert(wrongAckRejected&&db.prepare(`SELECT used_at FROM auth_challenges WHERE id=?`).get(redirectChallenge.challengeId).used_at==null,'handoff acknowledgment is bound to authenticated device');
const acknowledged=await acknowledgeGoogleHandoff(new Request('https://app.tripto.test/api/v1/auth/google/exchange/ack',{method:'POST',headers:{'content-type':'application/json','origin':'https://app.tripto.test','cookie':handoffCookie},body:'{}'}),env,redirectAuth);
assert(acknowledged.status===200&&(await body(acknowledged)).acknowledged===true,'authenticated handoff acknowledgment succeeds');
assert((acknowledged.headers.get('set-cookie')||'').includes('Max-Age=0'),'handoff acknowledgment clears transfer cookie');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM auth_challenges WHERE id=?`).get(redirectChallenge.challengeId).c)===0,'handoff acknowledgment atomically removes transfer row');
const replayExchange=await exchangeGoogleHandoff(new Request('https://app.tripto.test/api/v1/auth/google/exchange',{method:'POST',headers:{'content-type':'application/json','origin':'https://app.tripto.test','cookie':handoffCookie},body:'{}'}),env);
assert(replayExchange.status===401,'transfer cannot be exchanged after acknowledgment');

addDevice(db,'google-csrf-device');
const csrfChallenge=await body(await createGoogleChallenge(new Request('https://app.tripto.test/api/v1/auth/google/challenge',{method:'POST'}),env,{deviceId:'google-csrf-device'}));
let csrfRejected=false;
try{await googleSignInRedirect(formReq(callbackUrl,{credential:await googleToken(csrfChallenge.nonce,'csrf-subject'),g_csrf_token:'body-token',state:csrfChallenge.redirect.state},'g_csrf_token=cookie-token'),env);}catch(error){csrfRejected=error.code==='GOOGLE_REDIRECT_INVALID';}
assert(csrfRejected,'Google redirect rejects mismatched double-submit CSRF tokens');
assert(db.prepare(`SELECT used_at FROM auth_challenges WHERE id=?`).get(csrfChallenge.challengeId).used_at==null,'CSRF failure does not consume challenge');

let contentTypeRejected=false;
try{await googleSignInRedirect(req(callbackUrl,'POST',{credential:'x',g_csrf_token:'x',state:csrfChallenge.redirect.state}),env);}catch(error){contentTypeRejected=error.code==='FORM_REQUIRED';}
assert(contentTypeRejected,'Google redirect strictly requires form-urlencoded input');

let oversizedCallbackRejected=false;
try{await googleSignInRedirect(new Request(callbackUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','cookie':'g_csrf_token=x'},body:'x'.repeat(25*1024)}),env);}catch(error){oversizedCallbackRejected=error.code==='REQUEST_TOO_LARGE'&&error.status===413;}
assert(oversizedCallbackRejected,'Google redirect preserves a 413 response for oversized form bodies');

const signedOut=await body(await signOut(req('https://test/api/v1/auth/signout','POST',{}),env,owner));
assert(signedOut.localDataPreserved===true&&signedOut.accountMode==='guest','sign-out preserves local-data contract');
assert(db.prepare(`SELECT revoked_at FROM devices WHERE id='guest-device'`).get().revoked_at!=null,'signed-out account device revoked');
assert(db.prepare(`SELECT COUNT(*) c FROM users WHERE id=?`).get(login.userId).c===1,'sign-out does not delete account');


// Milestone 4: privacy-safe beta events and activation status.
await recordClientBetaEvent(req('https://test/api/v1/beta/events','POST',{eventName:'timeline_opened',tripId}),env,owner);
await recordClientBetaEvent(req('https://test/api/v1/beta/events','POST',{eventName:'whats_next_opened',tripId}),env,owner);
const beta=await body(await betaStatus(req('https://test/api/v1/beta/status?tripId='+tripId),env,owner));
assert(beta.beta.release==='beta-milestone-4','beta release surfaced');
assert(beta.beta.activation.usedTimeline===true,'timeline activation recorded');
assert(beta.beta.activation.usedWhatsNext===true,'whats next activation recorded');
assert(typeof beta.beta.trip.importPreviewsRemaining==='number','import quota remaining surfaced');
assert(!JSON.stringify(beta).includes('ABC123'),'beta status leaks no confirmation number');

// Fixed-window actor and public abuse guards.
await enforceActorRateLimit(env,owner,{action:'integration_actor',limit:2,windowMs:3600000});
await enforceActorRateLimit(env,owner,{action:'integration_actor',limit:2,windowMs:3600000});
let actorLimited=false;try{await enforceActorRateLimit(env,owner,{action:'integration_actor',limit:2,windowMs:3600000});}catch(e){actorLimited=e.code==='RATE_LIMITED';}
assert(actorLimited,'actor rate limit enforced');
const publicReq=new Request('https://test/api/v1/session/guest',{headers:{'cf-connecting-ip':'203.0.113.7','user-agent':'integration-test'}});
await enforcePublicRateLimit(publicReq,env,{action:'integration_public',limit:1,windowMs:3600000});
let publicLimited=false;try{await enforcePublicRateLimit(publicReq,env,{action:'integration_public',limit:1,windowMs:3600000});}catch(e){publicLimited=e.code==='RATE_LIMITED';}
assert(publicLimited,'public fingerprint rate limit enforced');

// Ops endpoint is hidden unless both flag and secret are present.
let ops=await opsSummary(req('https://test/api/v1/internal/ops/summary'),env,owner);assert(ops.status===404,'ops hidden while disabled');
env.OPS_ENABLED='true';env.OPS_SECRET='integration-ops-secret-123456789';
ops=await opsSummary(req('https://test/api/v1/internal/ops/summary','GET',undefined,{'x-tripto-ops-secret':'wrong'}),env,owner);assert(ops.status===404,'ops hides wrong secret');
ops=await opsSummary(req('https://test/api/v1/internal/ops/summary','GET',undefined,{'x-tripto-ops-secret':'integration-ops-secret-123456789'}),env,owner);assert(ops.status===200,'ops works with enabled secret');
const opsBody=await body(ops);assert(opsBody.ops.privacy.includes('Aggregate counts only'),'ops privacy boundary');
env.OPS_ENABLED='false';

// Guest deletion removes server-side device/trips and leaves only anonymous deletion counters.
addDevice(db,'privacy-guest');
const privacyGuest={deviceId:'privacy-guest'};
const pg=await body(await createDemoTrip(req('https://test/api/v1/internal/demo-trips','POST',{scenario:'normal'},{'x-tripto-demo-secret':'demo-secret-value-12345'}),env,privacyGuest));
const guestPreview=await body(await deletionPreview(req('https://test/api/v1/account/deletion-preview'),env,privacyGuest));
assert(guestPreview.deletion.ownedTrips===1,'guest deletion preview counts trip');
const guestDeleted=await body(await deleteMyData(req('https://test/api/v1/account','DELETE',{confirm:'DELETE'}),env,privacyGuest));
assert(guestDeleted.deleted===true&&guestDeleted.mode==='guest','guest deletion completed');
assert(db.prepare(`SELECT COUNT(*) c FROM devices WHERE id='privacy-guest'`).get().c===0,'guest device deleted');
assert(db.prepare(`SELECT COUNT(*) c FROM trips WHERE id=?`).get(pg.demo.tripId).c===0,'guest trip hard deleted');

// Account deletion removes owned trips, identities and devices, but records only anonymous deletion counts.
addDevice(db,'privacy-account-device');
const privacyLogin=await completeVerifiedIdentityLogin(env,'privacy-account-device',{provider:'email',providerSubject:'privacy@example.test',email:'privacy@example.test',emailVerified:true,displayName:'Privacy Test'});
const privacyAuth={deviceId:'privacy-account-device',userId:privacyLogin.userId};
db.prepare(`INSERT INTO usage_counters(scope_type,scope_id,period_key,metric,value,updated_at) VALUES ('user',?,'test','requests',1,?)`).run('user:'+privacyLogin.userId,Date.now());
db.prepare(`INSERT INTO usage_counters(scope_type,scope_id,period_key,metric,value,updated_at) VALUES ('user',?,'test','requests',1,?)`).run('device:privacy-account-device',Date.now());
const pa=await body(await createDemoTrip(req('https://test/api/v1/internal/demo-trips','POST',{scenario:'normal'},{'x-tripto-demo-secret':'demo-secret-value-12345'}),env,privacyAuth));
const accountPreview=await body(await deletionPreview(req('https://test/api/v1/account/deletion-preview'),env,privacyAuth));
assert(accountPreview.deletion.ownedTrips===1,'account deletion preview counts owned trip');
const accountDeleted=await body(await deleteMyData(req('https://test/api/v1/account','DELETE',{confirm:'DELETE'}),env,privacyAuth));
assert(accountDeleted.deleted===true&&accountDeleted.mode==='account','account deletion completed');
assert(db.prepare(`SELECT COUNT(*) c FROM users WHERE id=?`).get(privacyLogin.userId).c===0,'account user hard deleted');
assert(db.prepare(`SELECT COUNT(*) c FROM trips WHERE id=?`).get(pa.demo.tripId).c===0,'account owned trip hard deleted');
assert(db.prepare(`SELECT COUNT(*) c FROM usage_counters WHERE scope_id IN (?,?)`).get('user:'+privacyLogin.userId,'device:privacy-account-device').c===0,'account rate-limit identifiers deleted');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM privacy_deletions`).get().c)>=2,'anonymous privacy deletion counters recorded');

console.log('Local D1 integration suite passed: auth, migration, sharing, collaboration roles, imports, beta metrics, rate limits, ops privacy and data deletion.');
