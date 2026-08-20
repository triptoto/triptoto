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
const { sharingStatus, previewInvite, createInvite, acceptInvite, listMembers, updateMemberRole, removeMember, revokeInvite }=await load('apps/worker/src/routes/sharing.js');
const { completeVerifiedIdentityLogin }=await load('apps/worker/src/verified-auth.js');
const { recalculateImpacts }=await load('apps/worker/src/routes/impacts.js');
const { refreshSession }=await load('apps/worker/src/routes/session.js');
const { previewForwardedEmail, listImports, resolveImportCandidate }=await load('apps/worker/src/routes/imports.js');

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
function addDevice(db,id,userId=null){const now=Date.now();db.prepare(`INSERT INTO devices(id,user_id,platform,app_version,api_version,created_at,last_seen_at) VALUES (?,?,'web','integration','v1',?,?)`).run(id,userId,now,now);}

const db=new DatabaseSync(':memory:');
for(const name of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync(join('migrations',name),'utf8'));
const env={DB:new LocalD1(db),SESSION_SECRET:'x'.repeat(64),ACCOUNT_AUTH_ENABLED:'false',SHARING_ENABLED:'false',DEMO_TOOLS_ENABLED:'true',DEMO_TOOLS_SECRET:'demo-secret-value-12345',LIVE_FLIGHTS_ENABLED:'false',AI_ENABLED:'false',GMAIL_SYNC_ENABLED:'false',R2_DOCUMENTS_ENABLED:'false',APP_BASE_URL:'https://app.tripto.test'};
addDevice(db,'guest-device');
const guest={deviceId:'guest-device'};

const accountGuest=await body(await accountStatus(req('https://test/api/v1/account'),env,guest));
assert(accountGuest.account.mode==='guest','account status guest');

const demo=await body(await createDemoTrip(req('https://test/api/v1/internal/demo-trips','POST',{scenario:'self_transfer'},{'x-tripto-demo-secret':'demo-secret-value-12345'}),env,guest));
assert(demo.demo.tripId,'demo trip created');
const tripId=demo.demo.tripId;
assert(Number(db.prepare(`SELECT COUNT(*) c FROM connections WHERE trip_id=?`).get(tripId).c)===1,'self-transfer connection seeded');

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

console.log('Local D1 integration suite passed: auth bridge, migration, session refresh, export, support, sharing, invites, deterministic imports and all QA scenarios.');
