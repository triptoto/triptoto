import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8'),assert=(v,m)=>{if(!v)throw new Error(`Product V2 contract failed: ${m}`)};
const worker=read('apps/worker/src/index.ts'),auth=read('apps/worker/src/verified-auth.ts'),google=read('apps/worker/src/google-auth.ts'),email=read('apps/worker/src/inbound-email.ts'),migration=read('migrations/0017_product_v2_booking_email.sql'),wrangler=read('wrangler.jsonc'),app=read('public/mobile-app.js');
assert(worker.includes('async email(')&&worker.includes('receiveBookingEmail'),'Email Worker handler missing');
assert(email.includes("'go@tripto.to'")&&email.includes('verified_sender_emails'),'public booking address or verified sender mapping missing');
assert(email.includes('ranked[0].score >= 0.6')&&email.includes('ranked[0].score - ranked[1].score >= 0.3')&&email.includes("'needs_trip'")&&email.includes("'AMBIGUOUS_TRIP'"),'ambiguous trip association can be guessed');
// A homeless booking stays in the inbox for explicit trip selection. The email
// worker must never create an implicit draft trip, and the review package is
// persisted in one batch so a partial import cannot be exposed.
assert(!email.includes('draftStatements')&&email.includes("const inboundStatus = parsed.candidates.length ? (tripId ? 'needs_confirmation' : 'needs_trip')")&&(email.match(/env\.DB\.batch\(/g)||[]).length===1,'unassigned email must remain review-only and atomic');
assert(email.includes('message_fingerprint')&&email.includes('SELECT id FROM inbound_booking_emails'),'email replay/deduplication missing');
assert(email.includes('MAX_BYTES')&&email.includes('readBounded'),'inbound size limit missing');
assert(!email.includes('console.log')&&!email.includes('rawBody'),'sensitive inbound body can enter logs/storage');
assert(migration.includes('CREATE TABLE verified_sender_emails')&&migration.includes('CREATE TABLE inbound_booking_emails'),'V2 email migration incomplete');
assert(auth.includes('providerSubject')&&auth.includes("provider,provider_subject"),'stable provider subject identity missing');
assert(auth.includes('UPDATE trips SET owner_user_id=')&&auth.includes('UPDATE imports SET user_id='),'guest migration does not preserve/attach existing records');
assert(google.includes("header.alg!=='RS256'")&&google.includes('GOOGLE_JWKS')&&google.includes('crypto.subtle.verify'),'Google credential verification is incomplete');
for(const flag of ['LIVE_FLIGHTS_ENABLED','AI_ENABLED','GMAIL_SYNC_ENABLED','R2_DOCUMENTS_ENABLED','DEMO_TOOLS_ENABLED','OPS_ENABLED'])assert(wrangler.includes(`"${flag}": "false"`),`disabled flag changed: ${flag}`);
assert(app.includes('go@tripto.to')&&app.includes('need attention')&&app.includes('Tickets and documents'),'V2 traveler concepts missing');
console.log('Product V2 backend/auth/email contract passed.');
