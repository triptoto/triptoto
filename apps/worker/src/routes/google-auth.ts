import type { AuthContext, Env } from '../types.ts';
import { HttpError, json, nowMs, readJson, requireString, uuid } from '../http.ts';
import { verifyGoogleCredential } from '../google-auth.ts';
import { completeVerifiedIdentityLogin } from '../verified-auth.ts';
import { issueSession } from '../auth.ts';

const CHALLENGE_TTL=10*60*1000,SESSION_DAYS=90;

export async function createGoogleChallenge(request:Request,env:Env,auth:AuthContext):Promise<Response>{
  requireEnabled(env);
  const nonce=randomToken(32),id=uuid(),now=nowMs(),hash=await digest(nonce);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM auth_challenges WHERE device_id=? AND provider='google' AND (used_at IS NOT NULL OR expires_at<?)`).bind(auth.deviceId,now),
    env.DB.prepare(`INSERT INTO auth_challenges(id,device_id,provider,nonce_hash,expires_at,created_at) VALUES (?,?,'google',?,?,?)`).bind(id,auth.deviceId,hash,now+CHALLENGE_TTL,now),
  ]);
  return json({challengeId:id,nonce,expiresAt:now+CHALLENGE_TTL,clientId:env.GOOGLE_CLIENT_ID},{status:201},request,env);
}

export async function googleSignIn(request:Request,env:Env,auth:AuthContext):Promise<Response>{
  requireEnabled(env);
  const body=await readJson<{credential?:unknown;challengeId?:unknown;nonce?:unknown;timezone?:unknown}>(request,24*1024);
  const credential=requireString(body.credential,'credential',16000),challengeId=requireString(body.challengeId,'challengeId',80),nonce=requireString(body.nonce,'nonce',200);
  const now=nowMs(),challenge=await env.DB.prepare(`SELECT id,nonce_hash,expires_at,used_at FROM auth_challenges WHERE id=? AND device_id=? AND provider='google'`).bind(challengeId,auth.deviceId).first<{id:string;nonce_hash:string;expires_at:number;used_at:number|null}>();
  if(!challenge||challenge.used_at!=null||challenge.expires_at<=now||challenge.nonce_hash!==await digest(nonce))throw generic();
  const identity=await verifyGoogleCredential(env,credential,nonce);
  const consumed=await env.DB.prepare(`UPDATE auth_challenges SET used_at=? WHERE id=? AND device_id=? AND used_at IS NULL AND expires_at>?`).bind(now,challengeId,auth.deviceId,now).run();
  if(Number(consumed.meta?.changes??0)!==1)throw generic();
  const result=await completeVerifiedIdentityLogin(env,auth.deviceId,{...identity,timezone:typeof body.timezone==='string'?body.timezone:null});
  return json({session:{token:result.token,expiresAt:result.expiresAt},account:{userId:result.userId,created:result.createdAccount,migratedTrips:result.migratedTrips}},{},request,env);
}

export async function signOut(request:Request,env:Env,auth:AuthContext):Promise<Response>{
  if(!auth.userId)throw new HttpError(409,'NOT_SIGNED_IN','This device is already using guest mode.');
  const now=nowMs(),deviceId=uuid(),expiresAt=now+SESSION_DAYS*24*60*60*1000;
  await env.DB.batch([
    env.DB.prepare(`UPDATE devices SET revoked_at=?,last_seen_at=? WHERE id=? AND revoked_at IS NULL`).bind(now,now,auth.deviceId),
    env.DB.prepare(`INSERT INTO devices(id,user_id,platform,app_version,api_version,created_at,last_seen_at) VALUES (?,NULL,'web','mobile-ui-v1','v1',?,?)`).bind(deviceId,now,now),
    env.DB.prepare(`INSERT INTO identity_events(id,user_id,device_id,event_type,metadata_json,created_at) VALUES (?,?,?,'device_revoked',?,?)`).bind(uuid(),auth.userId,auth.deviceId,JSON.stringify({reason:'sign_out'}),now),
  ]);
  return json({session:{token:await issueSession(env,{deviceId,exp:expiresAt}),expiresAt},accountMode:'guest',localDataPreserved:true},{},request,env);
}

function requireEnabled(env:Env){if(env.ACCOUNT_AUTH_ENABLED!=='true'||!env.GOOGLE_CLIENT_ID)throw new HttpError(503,'GOOGLE_AUTH_DISABLED','Google sign-in is unavailable.');}
function generic(){return new HttpError(401,'GOOGLE_SIGN_IN_FAILED','Google sign-in could not be completed.');}
function randomToken(bytes:number):string{const b=new Uint8Array(bytes);crypto.getRandomValues(b);return [...b].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function digest(value:string):Promise<string>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');}
