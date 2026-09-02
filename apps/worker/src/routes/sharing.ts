import type { AuthContext, Env } from '../types.ts';
import { HttpError, enumValue, json, nowMs, optionalString, readJson, requireString, uuid } from '../http.ts';
import { requireTripAccess } from '../access.ts';
import { recordChangeEvent } from '../change-events.ts';
import { enforceActorRateLimit } from '../rate-limit.ts';
import { PRODUCT_LIMITS } from '../config.ts';

const roles = ['editor','viewer'] as const;
const encoder = new TextEncoder();
const HOUR = 60 * 60 * 1000;

export async function sharingStatus(request:Request, env:Env, auth:AuthContext, tripId:string):Promise<Response>{
  const access=await requireTripAccess(env,auth,tripId);
  const count=auth.userId ? await env.DB.prepare(`SELECT COUNT(*) AS count FROM trip_members WHERE trip_id=? AND status='active'`).bind(tripId).first<{count:number}>() : null;
  return json({sharing:{
    enabled:env.SHARING_ENABLED==='true',
    accountRequired:!auth.userId,
    role:access.role,
    canManage:access.role==='owner' && !!auth.userId,
    activeMembers:Number(count?.count??0),
    maxMembers:PRODUCT_LIMITS.tripMembers,
  }},{},request,env);
}

export async function previewInvite(request:Request,env:Env,auth:AuthContext):Promise<Response>{
  await enforceActorRateLimit(env,auth,{action:'invite_preview',limit:60,windowMs:HOUR});
  const body=await readJson<{token?:unknown}>(request);
  const token=requireString(body.token,'token',300);
  const hash=await sha256Hex(token); const now=nowMs();
  const row=await env.DB.prepare(`SELECT i.role,i.status,i.expires_at,i.invited_email,t.id trip_id,t.title,t.lifecycle_state,t.deleted_at trip_deleted_at
    FROM trip_invites i JOIN trips t ON t.id=i.trip_id WHERE i.token_hash=? LIMIT 1`).bind(hash).first<Record<string,unknown>>();
  if(!row||row.trip_deleted_at!=null)throw new HttpError(404,'INVITE_NOT_FOUND','Invite was not found.');
  let status=String(row.status);
  if(status==='invited'&&Number(row.expires_at)<=now){
    await env.DB.prepare(`UPDATE trip_invites SET status='expired' WHERE token_hash=? AND status='invited'`).bind(hash).run();
    status='expired';
  }
  return json({invite:{
    tripId:row.trip_id,
    tripTitle:row.title,
    tripLifecycleState:row.lifecycle_state,
    role:row.role,
    status,
    expiresAt:row.expires_at,
    emailRestricted:!!row.invited_email,
    accountRequired:!auth.userId,
    sharingEnabled:env.SHARING_ENABLED==='true',
  }},{},request,env);
}

export async function listMembers(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireAccount(auth); await requireTripAccess(env,auth,tripId);
  const rows=(await env.DB.prepare(`SELECT tm.user_id,tm.role,tm.status,tm.joined_at,u.display_name
    FROM trip_members tm JOIN users u ON u.id=tm.user_id
    WHERE tm.trip_id=? AND tm.status='active' AND u.deleted_at IS NULL
    ORDER BY CASE tm.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,tm.joined_at`).bind(tripId).all()).results??[];
  return json({members:rows},{},request,env);
}

export async function listInvites(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireOwner(env,auth,tripId);
  const now=nowMs();
  await env.DB.prepare(`UPDATE trip_invites SET status='expired' WHERE trip_id=? AND status='invited' AND expires_at<=?`).bind(tripId,now).run();
  const rows=(await env.DB.prepare(`SELECT id,invited_email,role,status,expires_at,created_at,accepted_at,revoked_at FROM trip_invites WHERE trip_id=? ORDER BY created_at DESC LIMIT 50`).bind(tripId).all()).results??[];
  return json({invites:rows},{},request,env);
}

export async function createInvite(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  requireSharingEnabled(env); await requireOwner(env,auth,tripId);
  await enforceActorRateLimit(env,auth,{action:'invite_create',limit:40,windowMs:HOUR});
  const body=await readJson<{role?:unknown;email?:unknown;expiresInDays?:unknown}>(request);
  const role=enumValue(body.role,'role',roles,'viewer');
  const email=optionalEmail(body.email);
  const days=body.expiresInDays==null?7:Number(body.expiresInDays);
  if(!Number.isInteger(days)||days<1||days>30)throw new HttpError(400,'VALIDATION_ERROR','expiresInDays must be an integer from 1 to 30.');
  const now=nowMs();
  if(email){
    const duplicate=await env.DB.prepare(`SELECT id FROM trip_invites WHERE trip_id=? AND lower(invited_email)=lower(?) AND status='invited' AND expires_at>? LIMIT 1`).bind(tripId,email,now).first();
    if(duplicate)throw new HttpError(409,'INVITE_ALREADY_PENDING','An active invite already exists for this email address.');
  }
  const pending=await env.DB.prepare(`SELECT COUNT(*) AS count FROM trip_invites WHERE trip_id=? AND status='invited' AND expires_at>?`).bind(tripId,now).first<{count:number}>();
  if(Number(pending?.count??0)>=PRODUCT_LIMITS.pendingInvitesPerTrip)throw new HttpError(409,'INVITE_LIMIT_REACHED','Too many pending invites for this trip.');
  const memberCount=await env.DB.prepare(`SELECT COUNT(*) AS count FROM trip_members WHERE trip_id=? AND status='active'`).bind(tripId).first<{count:number}>();
  if(Number(memberCount?.count??0)>=PRODUCT_LIMITS.tripMembers)throw new HttpError(409,'MEMBER_LIMIT_REACHED','Trip member limit reached.');

  const token=randomToken(); const tokenHash=await sha256Hex(token); const id=uuid(); const expiresAt=now+days*86400000;
  await env.DB.prepare(`INSERT INTO trip_invites(id,trip_id,invited_email,role,token_hash,status,created_by_user_id,expires_at,created_at) VALUES (?,?,?,?,?,'invited',?,?,?)`)
    .bind(id,tripId,email,role,tokenHash,auth.userId!,expiresAt,now).run();
  const base=(env.APP_BASE_URL??'').replace(/\/$/,'');
  return json({invite:{id,role,email,status:'invited',expiresAt,token,inviteUrl:base?`${base}/join/${encodeURIComponent(token)}`:null}},{status:201},request,env);
}

export async function revokeInvite(request:Request,env:Env,auth:AuthContext,tripId:string,inviteId:string):Promise<Response>{
  await requireOwner(env,auth,tripId);
  const existing=await env.DB.prepare(`SELECT id,status FROM trip_invites WHERE id=? AND trip_id=?`).bind(inviteId,tripId).first<{id:string;status:string}>();
  if(!existing)throw new HttpError(404,'INVITE_NOT_FOUND','Invite was not found.');
  if(existing.status!=='invited')throw new HttpError(409,'INVITE_UNAVAILABLE','Only a pending invite can be revoked.');
  const now=nowMs();
  await env.DB.prepare(`UPDATE trip_invites SET status='revoked',revoked_at=? WHERE id=? AND trip_id=? AND status='invited'`).bind(now,inviteId,tripId).run();
  return new Response(null,{status:204});
}

export async function acceptInvite(request:Request,env:Env,auth:AuthContext):Promise<Response>{
  requireSharingEnabled(env); await requireAccount(auth);
  await enforceActorRateLimit(env,auth,{action:'invite_accept',limit:30,windowMs:HOUR});
  const body=await readJson<{token?:unknown}>(request); const token=requireString(body.token,'token',300); const hash=await sha256Hex(token); const now=nowMs();
  const invite=await env.DB.prepare(`SELECT i.*,t.owner_user_id,t.deleted_at trip_deleted_at FROM trip_invites i JOIN trips t ON t.id=i.trip_id WHERE i.token_hash=? LIMIT 1`).bind(hash).first<Record<string,unknown>>();
  if(!invite||invite.trip_deleted_at!=null)throw new HttpError(404,'INVITE_NOT_FOUND','Invite was not found.');
  if(invite.status!=='invited')throw new HttpError(409,'INVITE_UNAVAILABLE','Invite is no longer available.');
  if(Number(invite.expires_at)<=now){await env.DB.prepare(`UPDATE trip_invites SET status='expired' WHERE id=?`).bind(invite.id).run();throw new HttpError(410,'INVITE_EXPIRED','Invite has expired.');}
  if(invite.invited_email){
    const verified=await env.DB.prepare(`SELECT 1 AS ok FROM auth_identities WHERE user_id=? AND email_verified=1 AND lower(email)=lower(?) LIMIT 1`).bind(auth.userId,invite.invited_email).first();
    if(!verified)throw new HttpError(403,'INVITE_EMAIL_MISMATCH','This invite is restricted to a different verified email address.');
  }
  if(invite.owner_user_id===auth.userId){
    await env.DB.prepare(`UPDATE trip_invites SET status='accepted',accepted_by_user_id=?,accepted_at=? WHERE id=? AND status='invited'`).bind(auth.userId,now,invite.id).run();
    return json({tripId:invite.trip_id,role:'owner'},{},request,env);
  }
  const count=await env.DB.prepare(`SELECT COUNT(*) AS count FROM trip_members WHERE trip_id=? AND status='active'`).bind(invite.trip_id).first<{count:number}>();
  if(Number(count?.count??0)>=PRODUCT_LIMITS.tripMembers)throw new HttpError(409,'MEMBER_LIMIT_REACHED','Trip member limit reached.');
  await env.DB.batch([
    env.DB.prepare(`UPDATE trip_invites SET status='accepted',accepted_by_user_id=?,accepted_at=? WHERE id=? AND status='invited' AND expires_at>?`).bind(auth.userId,now,invite.id,now),
    env.DB.prepare(`INSERT INTO trip_members(trip_id,user_id,role,status,joined_at)
      SELECT trip_id,?,role,'active',? FROM trip_invites WHERE id=? AND status='accepted' AND accepted_by_user_id=?
      ON CONFLICT(trip_id,user_id) DO UPDATE SET role=excluded.role,status='active',joined_at=COALESCE(trip_members.joined_at,excluded.joined_at),removed_at=NULL`).bind(auth.userId,now,invite.id,auth.userId),
  ]);
  const accepted=await env.DB.prepare(`SELECT status,accepted_by_user_id,role,trip_id FROM trip_invites WHERE id=?`).bind(invite.id).first<Record<string,unknown>>();
  if(!accepted||accepted.status!=='accepted'||accepted.accepted_by_user_id!==auth.userId)throw new HttpError(409,'INVITE_UNAVAILABLE','Invite was accepted by another account.');
  await recordChangeEvent(env,String(accepted.trip_id),'member',auth.userId!,'member_joined',null,{role:accepted.role},'manual',null,auth);
  return json({tripId:accepted.trip_id,role:accepted.role},{},request,env);
}

export async function updateMemberRole(request:Request,env:Env,auth:AuthContext,tripId:string,userId:string):Promise<Response>{
  await requireOwner(env,auth,tripId); const body=await readJson<{role?:unknown}>(request); const role=enumValue(body.role,'role',roles);
  const trip=await env.DB.prepare(`SELECT owner_user_id FROM trips WHERE id=? AND deleted_at IS NULL`).bind(tripId).first<{owner_user_id:string|null}>();
  if(trip?.owner_user_id===userId)throw new HttpError(409,'OWNER_ROLE_FIXED','Trip owner role cannot be changed.');
  const existing=await env.DB.prepare(`SELECT user_id,role,status FROM trip_members WHERE trip_id=? AND user_id=? AND status='active'`).bind(tripId,userId).first();
  if(!existing)throw new HttpError(404,'MEMBER_NOT_FOUND','Trip member was not found.');
  await env.DB.prepare(`UPDATE trip_members SET role=? WHERE trip_id=? AND user_id=? AND status='active'`).bind(role,tripId,userId).run();
  await recordChangeEvent(env,tripId,'member',userId,'member_role_changed',{role:(existing as {role?:unknown}).role},{role},'manual',null,auth);
  const member=await env.DB.prepare(`SELECT user_id,role,status,joined_at FROM trip_members WHERE trip_id=? AND user_id=? AND status='active'`).bind(tripId,userId).first();
  return json({member},{},request,env);
}

export async function removeMember(request:Request,env:Env,auth:AuthContext,tripId:string,userId:string):Promise<Response>{
  await requireOwner(env,auth,tripId); const trip=await env.DB.prepare(`SELECT owner_user_id FROM trips WHERE id=? AND deleted_at IS NULL`).bind(tripId).first<{owner_user_id:string|null}>();
  if(trip?.owner_user_id===userId)throw new HttpError(409,'OWNER_CANNOT_BE_REMOVED','Trip owner cannot be removed.');
  const existing=await env.DB.prepare(`SELECT user_id FROM trip_members WHERE trip_id=? AND user_id=? AND status='active'`).bind(tripId,userId).first();
  if(!existing)throw new HttpError(404,'MEMBER_NOT_FOUND','Trip member was not found.');
  const now=nowMs(); await env.DB.prepare(`UPDATE trip_members SET status='removed',removed_at=? WHERE trip_id=? AND user_id=? AND status='active'`).bind(now,tripId,userId).run();
  await recordChangeEvent(env,tripId,'member',userId,'member_removed',null,null,'manual',null,auth);
  return new Response(null,{status:204});
}

// A member removes themselves from a shared trip. Owners cannot leave (they must
// transfer ownership or delete the trip). Idempotent: leaving twice returns 204.
export async function leaveTrip(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireAccount(auth);
  const trip=await env.DB.prepare(`SELECT owner_user_id,created_by_device_id FROM trips WHERE id=? AND deleted_at IS NULL`).bind(tripId).first<{owner_user_id:string|null;created_by_device_id:string|null}>();
  if(!trip)throw new HttpError(404,'TRIP_NOT_FOUND','Trip was not found.');
  if(trip.owner_user_id===auth.userId)throw new HttpError(409,'OWNER_CANNOT_LEAVE','Transfer ownership or delete the trip instead of leaving it.');
  const existing=await env.DB.prepare(`SELECT user_id FROM trip_members WHERE trip_id=? AND user_id=? AND status='active'`).bind(tripId,auth.userId).first();
  if(existing){
    const now=nowMs();
    await env.DB.prepare(`UPDATE trip_members SET status='removed',removed_at=? WHERE trip_id=? AND user_id=? AND status='active'`).bind(now,tripId,auth.userId).run();
    await recordChangeEvent(env,tripId,'member',auth.userId!,'member_left',null,null,'manual',null,auth);
  }
  return new Response(null,{status:204});
}

// Owner hands ownership to an existing active member. Atomic: the previous owner
// is demoted to editor and never left ownerless. The UPDATE trips guard rejects
// concurrent double-transfers.
export async function transferOwnership(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireOwner(env,auth,tripId);
  const body=await readJson<{userId?:unknown}>(request);
  const targetUserId=requireString(body.userId,'userId',100);
  if(targetUserId===auth.userId)throw new HttpError(409,'ALREADY_OWNER','You already own this trip.');
  const target=await env.DB.prepare(`SELECT user_id FROM trip_members WHERE trip_id=? AND user_id=? AND status='active'`).bind(tripId,targetUserId).first();
  if(!target)throw new HttpError(404,'MEMBER_NOT_FOUND','Choose an active member to transfer ownership to.');
  const now=nowMs();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO trip_members(trip_id,user_id,role,status,joined_at) VALUES (?,?,'editor','active',?) ON CONFLICT(trip_id,user_id) DO UPDATE SET role='editor',status='active',removed_at=NULL`).bind(tripId,auth.userId,now),
    env.DB.prepare(`UPDATE trip_members SET role='owner',status='active',removed_at=NULL WHERE trip_id=? AND user_id=?`).bind(tripId,targetUserId),
    env.DB.prepare(`UPDATE trips SET owner_user_id=?,updated_at=?,version=version+1 WHERE id=? AND deleted_at IS NULL AND (owner_user_id=? OR owner_user_id IS NULL)`).bind(targetUserId,now,tripId,auth.userId),
  ]);
  const check=await env.DB.prepare(`SELECT owner_user_id FROM trips WHERE id=?`).bind(tripId).first<{owner_user_id:string}>();
  if(check?.owner_user_id!==targetUserId)throw new HttpError(409,'TRANSFER_FAILED','Ownership transfer did not complete. Try again.');
  await recordChangeEvent(env,tripId,'trip',tripId,'ownership_transferred',{ownerUserId:auth.userId},{ownerUserId:targetUserId},'manual',null,auth);
  return json({tripId,ownerUserId:targetUserId,previousOwnerRole:'editor'},{},request,env);
}

async function requireOwner(env:Env,auth:AuthContext,tripId:string){await requireAccount(auth);const access=await requireTripAccess(env,auth,tripId,true);if(access.role!=='owner')throw new HttpError(403,'OWNER_REQUIRED','Only the trip owner can manage sharing.');return access;}
async function requireAccount(auth:AuthContext){if(!auth.userId)throw new HttpError(409,'ACCOUNT_REQUIRED','A verified account is required for this action.');}
function requireSharingEnabled(env:Env){if(env.SHARING_ENABLED!=='true')throw new HttpError(503,'SHARING_DISABLED','Trip sharing is not enabled in this beta environment.');}
function optionalEmail(v:unknown):string|null{const s=optionalString(v,'email',254);if(s==null)return null;if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw new HttpError(400,'VALIDATION_ERROR','email is invalid.');return s.toLowerCase();}
function randomToken():string{const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256Hex(value:string):Promise<string>{const digest=await crypto.subtle.digest('SHA-256',encoder.encode(value));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
