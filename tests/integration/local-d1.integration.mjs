import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const emitDir=process.env.TRIPTO_EMIT_DIR;
if(!emitDir)throw new Error('TRIPTO_EMIT_DIR is required. Run via npm run test:integration.');
const load=async path=>import(pathToFileURL(resolve(emitDir,path)).href);
const { accountStatus }=await load('apps/worker/src/routes/account.js');
const { createDemoTrip }=await load('apps/worker/src/routes/demo.js');
const { exportTripJson }=await load('apps/worker/src/routes/export.js');
const { sharingStatus, createInvite, acceptInvite, listMembers }=await load('apps/worker/src/routes/sharing.js');
const { migrateGuestDeviceToUser }=await load('apps/worker/src/account-migration.js');

class Prepared {
  constructor(db,sql,values=[]){this.db=db;this.sql=sql;this.values=values;}
  bind(...values){return new Prepared(this.db,this.sql,values);}
  async first(column){const row=this.db.prepare(this.sql).get(...this.values);if(!row)return null;return column?row[column]:row;}
  async all(){return {success:true,results:this.db.prepare(this.sql).all(...this.values)};}
  async run(){this.db.prepare(this.sql).run(...this.values);return {success:true};}
}
class LocalD1 {
  constructor(db){this.db=db;}
  prepare(query){return new Prepared(this.db,query);}
  async batch(statements){this.db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());this.db.exec('COMMIT');return out;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
function assert(condition,label){if(!condition)throw new Error(`Integration assertion failed: ${label}`);}
async function body(response){return JSON.parse(await response.text());}
function req(url,method='GET',data,headers={}){return new Request(url,{method,headers:{...(data!==undefined?{'content-type':'application/json'}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)});}

const db=new DatabaseSync(':memory:');
for(const name of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync(join('migrations',name),'utf8'));
const env={DB:new LocalD1(db),SESSION_SECRET:'x'.repeat(64),ACCOUNT_AUTH_ENABLED:'false',SHARING_ENABLED:'false',DEMO_TOOLS_ENABLED:'true',DEMO_TOOLS_SECRET:'demo-secret-value-12345',LIVE_FLIGHTS_ENABLED:'false',AI_ENABLED:'false',GMAIL_SYNC_ENABLED:'false',R2_DOCUMENTS_ENABLED:'false'};
const now=Date.now();
db.prepare(`INSERT INTO devices(id,user_id,platform,app_version,api_version,created_at,last_seen_at) VALUES (?,NULL,'web','integration','v1',?,?)`).run('guest-device',now,now);
const guest={deviceId:'guest-device'};

const account=await body(await accountStatus(req('https://test/api/v1/account'),env,guest));
assert(account.account.mode==='guest','account status guest');

const demo=await body(await createDemoTrip(req('https://test/api/v1/internal/demo-trips','POST',{scenario:'self_transfer'},{'x-tripto-demo-secret':'demo-secret-value-12345'}),env,guest));
assert(demo.demo.tripId,'demo trip created');
const tripId=demo.demo.tripId;
assert(Number(db.prepare(`SELECT COUNT(*) c FROM connections WHERE trip_id=?`).get(tripId).c)===1,'self-transfer connection seeded');

const sharing=await body(await sharingStatus(req('https://test/api/v1/trips/x/sharing'),env,guest,tripId));
assert(sharing.sharing.accountRequired===true,'sharing requires account for guest');

const exported=await body(await exportTripJson(req('https://test/api/v1/trips/x/export/json'),env,guest,tripId));
assert(exported.exportSchemaVersion===1,'export schema');
assert(exported.flights.length===2,'export contains demo flights');
assert(exported.travelers.length===1,'export contains traveler');

db.prepare(`INSERT INTO users(id,display_name,primary_email,created_at,updated_at,version) VALUES (?,?,?,?,?,1)`).run('user-1','Owner','owner@example.test',now,now);
const migrated=await migrateGuestDeviceToUser(env,'guest-device','user-1');
assert(migrated.migratedTrips===1,'one guest trip migrated');
assert(db.prepare(`SELECT owner_user_id FROM trips WHERE id=?`).get(tripId).owner_user_id==='user-1','trip owner migrated');
assert(db.prepare(`SELECT user_id FROM devices WHERE id='guest-device'`).get().user_id==='user-1','device linked');
assert(Number(db.prepare(`SELECT COUNT(*) c FROM identity_events WHERE user_id='user-1' AND event_type='guest_migrated'`).get().c)===1,'identity audit event');

env.SHARING_ENABLED='true';
const owner={deviceId:'guest-device',userId:'user-1'};
const inviteResponse=await body(await createInvite(req('https://test/api/v1/trips/x/invites','POST',{role:'editor',email:'friend@example.test',expiresInDays:3}),env,owner,tripId));
assert(inviteResponse.invite.token,'raw invite returned once');
assert(db.prepare(`SELECT token_hash FROM trip_invites WHERE id=?`).get(inviteResponse.invite.id).token_hash!==inviteResponse.invite.token,'raw invite not stored');

db.prepare(`INSERT INTO users(id,display_name,primary_email,created_at,updated_at,version) VALUES (?,?,?,?,?,1)`).run('user-2','Editor','friend@example.test',now,now);
db.prepare(`INSERT INTO devices(id,user_id,platform,app_version,api_version,created_at,last_seen_at) VALUES (?,?,'web','integration','v1',?,?)`).run('device-2','user-2',now,now);
db.prepare(`INSERT INTO auth_identities(id,user_id,provider,provider_subject,email,email_verified,created_at,last_used_at) VALUES (?,?,?,?,?,1,?,?)`).run('identity-2','user-2','email','friend@example.test','friend@example.test',now,now);
const editor={deviceId:'device-2',userId:'user-2'};
const accepted=await body(await acceptInvite(req('https://test/api/v1/invites/accept','POST',{token:inviteResponse.invite.token}),env,editor));
assert(accepted.role==='editor','invite accepted as editor');
const members=await body(await listMembers(req('https://test/api/v1/trips/x/members'),env,owner,tripId));
assert(members.members.length===2,'owner and editor listed');

console.log('Local D1 integration suite passed.');
