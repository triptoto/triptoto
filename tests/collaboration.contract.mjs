import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8'),assert=(v,m)=>{if(!v)throw new Error(`Collaboration contract failed: ${m}`)};
const sharing=read('apps/worker/src/routes/sharing.ts'),access=read('apps/worker/src/access.ts'),trips=read('apps/worker/src/routes/trips.ts'),worker=read('apps/worker/src/index.ts'),members=read('migrations/0002_trips.sql'),invites=read('migrations/0012_accounts_sharing.sql'),wrangler=read('wrangler.jsonc'),app=read('public/mobile-app.js');

// --- Endpoints wired ---
assert(worker.includes("from './routes/sharing.ts'")&&['sharingStatus','previewInvite','listMembers','listInvites','createInvite','revokeInvite','acceptInvite','updateMemberRole','removeMember','leaveTrip','transferOwnership'].every(fn=>worker.includes(fn)),'sharing routes not imported/wired');
assert(worker.includes("path === '/api/v1/invites/preview'")&&worker.includes("path === '/api/v1/invites/accept'"),'invite preview/accept endpoints missing');

// --- Invite tokens: crypto-random, stored HASHED, never plaintext ---
assert(sharing.includes('crypto.getRandomValues(bytes)')&&sharing.includes("new Uint8Array(32)"),'invite token is not crypto-random 32 bytes');
assert(sharing.includes("crypto.subtle.digest('SHA-256'")&&sharing.includes('const tokenHash=await sha256Hex(token)'),'invite token is not SHA-256 hashed before storage');
assert(sharing.includes('INSERT INTO trip_invites')&&sharing.includes('token_hash')&&!/INSERT INTO trip_invites[^)]*\btoken\b(?!_hash)/.test(sharing),'raw invite token must never be inserted; only token_hash');
assert(invites.includes('token_hash TEXT NOT NULL UNIQUE'),'trip_invites.token_hash column must be NOT NULL UNIQUE');
// Accept/preview look up by hash, never by the raw token.
assert(sharing.includes('const hash=await sha256Hex(token)')&&sharing.includes('WHERE i.token_hash=?'),'invite lookup must hash the incoming token');

// --- Time-limited, revocable, one-time acceptance ---
assert(sharing.includes('now+days*86400000')&&sharing.includes("'INVITE_EXPIRED','Invite has expired.'"),'invites are not time-limited/expiry-enforced');
assert(sharing.includes("SET status='revoked'")&&sharing.includes("status='invited'"),'invite revocation missing/ungated');
assert(sharing.includes("WHERE id=? AND status='invited' AND expires_at>?")&&sharing.includes("accepted.accepted_by_user_id!==auth.userId")&&sharing.includes("'INVITE_UNAVAILABLE','Invite was accepted by another account.'"),'one-time atomic acceptance guard missing');

// --- Role validation NEVER accepts 'owner' from invite/role-change; never trust frontend ---
assert(sharing.includes("const roles = ['editor','viewer'] as const;"),'assignable role enum must exclude owner');
assert(invites.includes("CHECK(role IN ('editor','viewer'))"),'trip_invites CHECK must exclude owner');
assert(members.includes("CHECK(role IN ('owner','editor','viewer'))"),'trip_members role CHECK missing');
assert(sharing.includes("'OWNER_ROLE_FIXED','Trip owner role cannot be changed.'"),'owner role must be immutable via role-change');
// Accepted member role is copied from the stored invite row, never the request body.
assert(sharing.includes('INSERT INTO trip_members(trip_id,user_id,role,status,joined_at)')&&sharing.includes("SELECT trip_id,?,role,'active',? FROM trip_invites"),'accepted member role must be copied server-side from the stored invite, not the client');

// --- Do not reveal whether an unrelated email has an account ---
assert(sharing.includes('email_verified=1')&&sharing.includes("'INVITE_EMAIL_MISMATCH'")&&sharing.includes('bind(auth.userId,invite.invited_email)'),'invite email restriction must check the current user, not disclose account existence');
assert(sharing.includes('WHERE user_id=? AND email_verified=1 AND lower(email)=lower(?)'),'invite email match must be scoped to the current authenticated user, never a global account probe');

// --- Owner-only trip deletion (editors get 403); viewers read-only ---
assert(trips.includes('await requireTripOwner(env, auth, tripId);')&&trips.includes('only the owner may delete a trip. Editors get 403.'),'trip deletion is not owner-gated');
assert(access.includes("if (access.role !== 'owner') throw new HttpError(403, 'OWNER_REQUIRED'"),'requireTripOwner must 403 non-owners');
assert(access.includes("read-only for the current member.")&&access.includes("!['owner', 'editor'].includes(trip.role)"),'viewer write-block missing');
assert(sharing.includes("'OWNER_REQUIRED','Only the trip owner can manage sharing.'"),'sharing management must be owner-gated');
assert(sharing.includes("'OWNER_CANNOT_LEAVE'")&&sharing.includes("'OWNER_CANNOT_BE_REMOVED'"),'owner-cannot-leave / cannot-be-removed guards missing');

// --- SHARING_ENABLED is an operational kill-switch, still OFF, never a paid gate ---
assert(sharing.includes("if(env.SHARING_ENABLED!=='true')throw new HttpError(503,'SHARING_DISABLED'"),'sharing kill-switch gate missing');
assert(wrangler.includes('"SHARING_ENABLED": "false"'),'SHARING_ENABLED must remain false until acceptance QA');
for(const flag of ['LIVE_FLIGHTS_ENABLED','AI_ENABLED','GMAIL_SYNC_ENABLED','R2_DOCUMENTS_ENABLED','SHARING_ENABLED','DEMO_TOOLS_ENABLED','OPS_ENABLED'])assert(wrangler.includes(`"${flag}": "false"`),`disabled flag changed: ${flag}`);

// --- Frontend: free for all, roles, viewer read-only, token never logged ---
assert(app.includes('Collaboration is free for every signed-in account — there is no paid gate.'),'collaboration must be free for all signed-in users');
assert(app.includes('owner: { label: "Owner", icon: "owner" }')&&app.includes('editor: { label: "Can edit", icon: "editor" }')&&app.includes('viewer: { label: "View only", icon: "viewer" }'),'COLLAB_ROLES labels changed');
assert(app.includes('function canEditCurrentTrip()')&&app.includes('You have view-only access to this trip.'),'viewer read-only UI guard missing');
assert(app.includes("never trusts or sends 'owner' as an assignable role"),'frontend owner-escalation guard comment missing');

console.log('Free trip collaboration contract passed.');
