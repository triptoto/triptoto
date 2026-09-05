import type { AuthContext, Env } from '../types.ts';
import { errorResponse, HttpError, json, nowMs, readJson, requireString, uuid } from '../http.ts';
import { googleCredentialNonce, verifyGoogleCredential } from '../google-auth.ts';
import { completeVerifiedIdentityLogin } from '../verified-auth.ts';
import { issueSession } from '../auth.ts';
import { enforcePublicRateLimit } from '../rate-limit.ts';
import { PRODUCT_LIMITS } from '../config.ts';

const CHALLENGE_TTL = 10 * 60 * 1000;
const HANDOFF_TTL = 2 * 60 * 1000;
const SESSION_DAYS = 90;
const REDIRECT_BODY_LIMIT = 24 * 1024;
const HANDOFF_COOKIE = '__Secure-tripto_google_transfer';
const encoder = new TextEncoder();

interface GoogleChallenge {
  id: string;
  device_id: string;
  nonce_hash: string;
  expires_at: number;
  used_at: number | null;
}

interface RedirectForm {
  credential: string;
  csrfToken: string;
  challengeId: string | null;
}

export async function createGoogleChallenge(request:Request,env:Env,auth:AuthContext):Promise<Response>{
  requireEnabled(env);
  const nonce=randomToken(32),id=uuid(),now=nowMs(),expiresAt=now+CHALLENGE_TTL,hash=await digest(nonce);
  const origin=redirectOrigin(request,env);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM auth_challenges WHERE device_id=? AND provider='google' AND (used_at IS NOT NULL OR expires_at<?)`).bind(auth.deviceId,now),
    env.DB.prepare(`INSERT INTO auth_challenges(id,device_id,provider,nonce_hash,expires_at,created_at) VALUES (?,?,'google',?,?,?)`).bind(id,auth.deviceId,hash,expiresAt,now),
  ]);
  return json({
    challengeId:id,
    nonce,
    expiresAt,
    clientId:env.GOOGLE_CLIENT_ID,
    redirect:{loginUri:`${origin}/api/v1/auth/google/callback`,state:id},
  },{status:201},request,env);
}

/** Existing popup/callback JSON flow retained for supported browsers. */
export async function googleSignIn(request:Request,env:Env,auth:AuthContext):Promise<Response>{
  requireEnabled(env);
  const body=await readJson<{credential?:unknown;challengeId?:unknown;nonce?:unknown;timezone?:unknown}>(request,24*1024);
  const credential=requireString(body.credential,'credential',16000),challengeId=requireString(body.challengeId,'challengeId',80),nonce=requireString(body.nonce,'nonce',200);
  const now=nowMs(),challenge=await findChallenge(env,challengeId,auth.deviceId);
  if(!validChallenge(challenge,now,await digest(nonce)))throw generic();
  const identity=await verifyGoogleCredential(env,credential,nonce);
  await consumeChallenge(env,challengeId,auth.deviceId,now);
  const result=await completeVerifiedIdentityLogin(env,auth.deviceId,{...identity,timezone:typeof body.timezone==='string'?body.timezone:null});
  return json({session:{token:result.token,expiresAt:result.expiresAt},account:{userId:result.userId,created:result.createdAccount,migratedTrips:result.migratedTrips}},{},request,env);
}

/**
 * iOS-compatible Google Identity Services redirect callback. Google posts here
 * without the app's Bearer header, so the opaque one-time challenge identifies
 * the initiating device. No bearer credential is ever placed in a URL.
 */
export async function googleSignInRedirect(request:Request,env:Env):Promise<Response>{
  const origin=redirectOrigin(request,env);
  try{
    requireEnabled(env);
    if(new URL(request.url).origin!==origin)throw redirectInvalid();
    // A refresh/back navigation must return to the app without replaying login.
    if(request.method!=='POST')throw redirectInvalid();
    await enforcePublicRateLimit(request,env,{action:'google_auth_callback',limit:PRODUCT_LIMITS.googleAuthAttemptsPerHour,windowMs:60*60*1000});
    const form=await readRedirectForm(request);
    validateGoogleCsrf(request,form.csrfToken);
    const nonce=googleCredentialNonce(form.credential),now=nowMs(),nonceHash=await digest(nonce);
    // GIS state identifies the clicked button and is optional. When omitted,
    // locate the initiating challenge by its random nonce. This is lookup only:
    // CSRF, expiry and Google's signed nonce are still verified before mutation.
    // Never fall back from a supplied but incorrect state.
    const challenge=form.challengeId
      ?await findChallengeById(env,form.challengeId)
      :await findChallengeByNonce(env,nonceHash,now);
    if(!validChallenge(challenge,now,nonceHash))throw generic();
    const identity=await verifyGoogleCredential(env,form.credential,nonce);
    const transferSecret=randomToken(32),transferHash=await digest(transferSecret);
    // Atomically replace the nonce challenge with the recoverable handoff
    // before account migration. A successful identity mutation therefore
    // always has a transfer row ready for the browser to exchange.
    await prepareTransfer(env,challenge,transferHash,now);
    await completeVerifiedIdentityLogin(env,challenge.device_id,identity);
    const handoff=`${challenge.id}.${transferSecret}`;
    return authRedirect(origin,'complete',undefined,handoffCookie(handoff,HANDOFF_TTL));
  }catch(error){
    return authRedirect(origin,'error',redirectErrorCode(error));
  }
}

/**
 * Exchanges the short-lived HttpOnly handoff cookie for the normal application
 * session. The exchange is idempotent during the 120-second handoff window so
 * a lost response does not strand the user; the authenticated acknowledgement
 * below performs the one-time consume after the client stores the session.
 */
export async function exchangeGoogleHandoff(request:Request,env:Env):Promise<Response>{
  try{
    requireEnabled(env);
    await enforcePublicRateLimit(request,env,{action:'google_auth_exchange',limit:PRODUCT_LIMITS.googleAuthAttemptsPerHour,windowMs:60*60*1000});
    const origin=redirectOrigin(request,env);
    if(new URL(request.url).origin!==origin||request.headers.get('origin')!==origin)throw redirectInvalid();
    const body=await readJson<Record<string,unknown>>(request,1024);
    if(!body||Array.isArray(body)||Object.keys(body).length!==0)throw redirectInvalid();
    const cookie=singleCookieValue(request,HANDOFF_COOKIE,4096);
    const transfer=parseTransferCookie(cookie),now=nowMs(),secretHash=await digest(transfer.secret);
    const challenge=await findChallengeById(env,transfer.challengeId);
    if(!validChallenge(challenge,now,secretHash))throw generic();
    const device=await env.DB.prepare(`SELECT id,user_id,revoked_at FROM devices WHERE id=?`).bind(challenge.device_id).first<{id:string;user_id:string|null;revoked_at:number|null}>();
    if(!device||device.revoked_at!=null||!device.user_id)throw generic();
    const expiresAt=now+SESSION_DAYS*24*60*60*1000;
    const token=await issueSession(env,{deviceId:device.id,userId:device.user_id,exp:expiresAt});
    return json({session:{token,expiresAt},account:{userId:device.user_id}},{},request,env);
  }catch(error){
    const response=errorResponse(error,request,env);
    if(error instanceof HttpError&&(error.status===400||error.status===401))response.headers.set('set-cookie',clearHandoffCookie());
    return response;
  }
}

/** Acknowledges durable client storage of the exchanged session. */
export async function acknowledgeGoogleHandoff(request:Request,env:Env,auth:AuthContext):Promise<Response>{
  requireEnabled(env);
  const origin=redirectOrigin(request,env);
  if(new URL(request.url).origin!==origin||request.headers.get('origin')!==origin)throw redirectInvalid();
  const body=await readJson<Record<string,unknown>>(request,1024);
  if(!body||Array.isArray(body)||Object.keys(body).length!==0)throw redirectInvalid();
  const transfer=parseTransferCookie(singleCookieValue(request,HANDOFF_COOKIE,4096)),now=nowMs(),secretHash=await digest(transfer.secret);
  const challenge=await findChallengeById(env,transfer.challengeId);
  if(!validChallenge(challenge,now,secretHash)||challenge.device_id!==auth.deviceId)throw generic();
  const removed=await env.DB.prepare(`DELETE FROM auth_challenges WHERE id=? AND device_id=? AND provider='google' AND used_at IS NULL AND expires_at>? AND nonce_hash=?`).bind(challenge.id,auth.deviceId,now,secretHash).run();
  if(Number(removed.meta?.changes??0)!==1)throw generic();
  return json({acknowledged:true},{headers:{'set-cookie':clearHandoffCookie()}},request,env);
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
function redirectInvalid(){return new HttpError(400,'GOOGLE_REDIRECT_INVALID','Google sign-in response is invalid.');}
function randomToken(bytes:number):string{const b=new Uint8Array(bytes);crypto.getRandomValues(b);return [...b].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function digest(value:string):Promise<string>{const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(value));return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');}

async function findChallenge(env:Env,id:string,deviceId:string):Promise<GoogleChallenge|null>{
  return env.DB.prepare(`SELECT id,device_id,nonce_hash,expires_at,used_at FROM auth_challenges WHERE id=? AND device_id=? AND provider='google'`).bind(id,deviceId).first<GoogleChallenge>();
}
async function findChallengeById(env:Env,id:string):Promise<GoogleChallenge|null>{
  return env.DB.prepare(`SELECT id,device_id,nonce_hash,expires_at,used_at FROM auth_challenges WHERE id=? AND provider='google'`).bind(id).first<GoogleChallenge>();
}
async function findChallengeByNonce(env:Env,hash:string,now:number):Promise<GoogleChallenge|null>{
  const matches=await env.DB.prepare(`SELECT id,device_id,nonce_hash,expires_at,used_at FROM auth_challenges WHERE provider='google' AND nonce_hash=? AND used_at IS NULL AND expires_at>? LIMIT 2`).bind(hash,now).all<GoogleChallenge>();
  return matches.results?.length===1?matches.results[0]:null;
}
function validChallenge(challenge:GoogleChallenge|null,now:number,nonceHash:string):challenge is GoogleChallenge{
  return !!challenge&&challenge.used_at==null&&challenge.expires_at>now&&constantTimeEqual(challenge.nonce_hash,nonceHash);
}
async function consumeChallenge(env:Env,id:string,deviceId:string,now:number):Promise<void>{
  const consumed=await env.DB.prepare(`UPDATE auth_challenges SET used_at=? WHERE id=? AND device_id=? AND used_at IS NULL AND expires_at>?`).bind(now,id,deviceId,now).run();
  if(Number(consumed.meta?.changes??0)!==1)throw generic();
}
async function prepareTransfer(env:Env,challenge:GoogleChallenge,secretHash:string,now:number):Promise<void>{
  const prepared=await env.DB.prepare(`UPDATE auth_challenges SET nonce_hash=?,expires_at=?,used_at=NULL WHERE id=? AND device_id=? AND provider='google' AND used_at IS NULL AND expires_at>? AND nonce_hash=?`).bind(secretHash,now+HANDOFF_TTL,challenge.id,challenge.device_id,now,challenge.nonce_hash).run();
  if(Number(prepared.meta?.changes??0)!==1)throw generic();
}

async function readRedirectForm(request:Request):Promise<RedirectForm>{
  const contentType=request.headers.get('content-type')?.split(';',1)[0]?.trim().toLowerCase();
  if(contentType!=='application/x-www-form-urlencoded')throw new HttpError(415,'FORM_REQUIRED','Expected an application/x-www-form-urlencoded Google response.');
  const declaredHeader=request.headers.get('content-length');
  if(declaredHeader!=null){
    const declared=Number(declaredHeader);
    if(!Number.isSafeInteger(declared)||declared<0)throw redirectInvalid();
    if(declared>REDIRECT_BODY_LIMIT)throw new HttpError(413,'REQUEST_TOO_LARGE','Google sign-in response is too large.');
  }
  const params=new URLSearchParams(await readBoundedText(request,REDIRECT_BODY_LIMIT));
  return {
    credential:singleFormValue(params,'credential',16000),
    csrfToken:singleFormValue(params,'g_csrf_token',512),
    challengeId:params.has('state')?singleFormValue(params,'state',80):null,
  };
}
async function readBoundedText(request:Request,maxBytes:number):Promise<string>{
  if(!request.body)return '';
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];
  let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>maxBytes){await reader.cancel();throw new HttpError(413,'REQUEST_TOO_LARGE','Google sign-in response is too large.');}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const merged=new Uint8Array(total);
  let offset=0;
  for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength;}
  try{return new TextDecoder('utf-8',{fatal:true}).decode(merged);}catch{throw redirectInvalid();}
}
function singleFormValue(params:URLSearchParams,name:string,max:number):string{
  const values=params.getAll(name);
  if(values.length!==1||!values[0])throw redirectInvalid();
  if(values[0].length>max)throw new HttpError(413,'REQUEST_TOO_LARGE','Google sign-in response is too large.');
  return values[0];
}
function validateGoogleCsrf(request:Request,formToken:string):void{
  if(!constantTimeEqual(singleCookieValue(request,'g_csrf_token',512),formToken))throw redirectInvalid();
}
function singleCookieValue(request:Request,name:string,max:number):string{
  const cookieHeader=request.headers.get('cookie')??'';
  if(cookieHeader.length>8192)throw redirectInvalid();
  const matches:string[]=[];
  for(const part of cookieHeader.split(';')){
    const index=part.indexOf('=');
    if(index<0||part.slice(0,index).trim()!==name)continue;
    try{matches.push(decodeURIComponent(part.slice(index+1).trim()));}catch{throw redirectInvalid();}
  }
  if(matches.length!==1||!matches[0]||matches[0].length>max)throw redirectInvalid();
  return matches[0];
}

function parseTransferCookie(value:string):{challengeId:string;secret:string}{
  const parts=value.split('.');
  if(parts.length!==2||!/^[0-9a-f-]{36}$/i.test(parts[0])||!/^[0-9a-f]{64}$/.test(parts[1]))throw redirectInvalid();
  return {challengeId:parts[0],secret:parts[1]};
}

function redirectOrigin(request:Request,env:Env):string{
  const requestUrl=new URL(request.url),requestOrigin=requestUrl.origin;
  const local=requestUrl.hostname==='localhost'||requestUrl.hostname==='127.0.0.1';
  const value=env.APP_BASE_URL?.trim()||(requestOrigin==='https://tripto.to'||local?requestOrigin:'');
  if(!value)throw new HttpError(503,'GOOGLE_REDIRECT_NOT_CONFIGURED','Google sign-in redirect is unavailable.');
  try{
    const url=new URL(value),configuredLocal=url.hostname==='localhost'||url.hostname==='127.0.0.1';
    if((url.protocol!=='https:'&&!configuredLocal)||url.username||url.password||url.origin==='null')throw new Error('invalid');
    return url.origin;
  }catch{throw new HttpError(503,'GOOGLE_REDIRECT_NOT_CONFIGURED','Google sign-in redirect is unavailable.');}
}
function authRedirect(origin:string,status:'complete'|'error',code?:string,setCookie?:string):Response{
  const target=new URL('/account',origin);
  target.searchParams.set('google_auth',status);
  if(code)target.searchParams.set('code',code);
  const headers=new Headers({'location':target.toString(),'cache-control':'no-store','referrer-policy':'no-referrer'});
  if(setCookie)headers.set('set-cookie',setCookie);
  return new Response(null,{status:303,headers});
}
function handoffCookie(value:string,maxAgeMs:number):string{return `${HANDOFF_COOKIE}=${encodeURIComponent(value)}; Max-Age=${Math.floor(maxAgeMs/1000)}; Path=/api/v1/auth/google/exchange; HttpOnly; Secure; SameSite=Lax`;}
function clearHandoffCookie():string{return `${HANDOFF_COOKIE}=; Max-Age=0; Path=/api/v1/auth/google/exchange; HttpOnly; Secure; SameSite=Lax`;}
function redirectErrorCode(error:unknown):string{
  if(error instanceof HttpError){
    if(error.code==='GOOGLE_AUTH_DISABLED'||error.code==='SESSION_SECRET_NOT_CONFIGURED'||error.code==='GOOGLE_REDIRECT_NOT_CONFIGURED')return 'unavailable';
    if(error.code==='GOOGLE_CHALLENGE_EXPIRED')return 'expired';
  }
  return 'sign_in_failed';
}
function constantTimeEqual(left:string,right:string):boolean{return constantTimeEqualBytes(encoder.encode(left),encoder.encode(right));}
function constantTimeEqualBytes(left:Uint8Array,right:Uint8Array):boolean{
  let diff=left.length^right.length;
  const length=Math.max(left.length,right.length);
  for(let index=0;index<length;index++)diff|=(left[index]??0)^(right[index]??0);
  return diff===0;
}
