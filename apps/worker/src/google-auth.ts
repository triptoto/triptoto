import type { Env } from './types.ts';
import { HttpError } from './http.ts';

const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com','https://accounts.google.com']);
type GoogleJwk=JsonWebKey&{kid?:string};
let keyCache: { expiresAt:number; keys:GoogleJwk[] } | null = null;

export interface GoogleIdentity {
  provider: 'google';
  providerSubject: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  locale: string | null;
  avatarUrl: string | null;
}

/**
 * Reads only the nonce claim needed to locate a redirect challenge. The value
 * is not trusted until verifyGoogleCredential validates the JWT signature and
 * compares the same nonce again.
 */
export function googleCredentialNonce(credential: string): string {
  if (typeof credential !== 'string' || credential.length < 100 || credential.length > 16000) throw invalid();
  const parts = credential.split('.');
  if (parts.length !== 3) throw invalid();
  const payload = parseSegment(parts[1]) as Record<string, unknown>;
  if (typeof payload.nonce !== 'string' || !payload.nonce || payload.nonce.length > 200) throw invalid();
  return payload.nonce;
}

export async function verifyGoogleCredential(env:Env, credential:string, expectedNonce:string):Promise<GoogleIdentity> {
  if (env.ACCOUNT_AUTH_ENABLED !== 'true' || !env.GOOGLE_CLIENT_ID) throw new HttpError(503,'GOOGLE_AUTH_DISABLED','Google sign-in is unavailable.');
  if (typeof credential !== 'string' || credential.length < 100 || credential.length > 16000) throw invalid();
  const parts=credential.split('.');
  if(parts.length!==3)throw invalid();
  const header=parseSegment(parts[0]) as {alg?:unknown;kid?:unknown;typ?:unknown};
  const payload=parseSegment(parts[1]) as Record<string,unknown>;
  if(header.alg!=='RS256'||typeof header.kid!=='string'||!header.kid)throw invalid();
  const key=await googleKey(header.kid);
  const cryptoKey=await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const signature=decodeBase64Url(parts[2]);
  const ok=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',cryptoKey,signature.slice().buffer as ArrayBuffer,new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if(!ok)throw invalid();
  const now=Math.floor(Date.now()/1000),aud=payload.aud;
  const audienceOk=typeof aud==='string'?aud===env.GOOGLE_CLIENT_ID:Array.isArray(aud)&&aud.length===1&&aud[0]===env.GOOGLE_CLIENT_ID;
  if(!ISSUERS.has(String(payload.iss||''))||!audienceOk||!Number.isFinite(payload.exp)||Number(payload.exp)<=now-30||Number(payload.exp)>now+3700)throw invalid();
  if(payload.nbf!=null&&(!Number.isFinite(payload.nbf)||Number(payload.nbf)>now+30))throw invalid();
  if(typeof payload.sub!=='string'||!payload.sub||payload.sub.length>300)throw invalid();
  if(payload.nonce!==expectedNonce)throw invalid();
  if(payload.email_verified!==true&&payload.email_verified!=='true')throw invalid();
  const email=typeof payload.email==='string'&&payload.email.length<=254?payload.email.toLowerCase():null;
  return {provider:'google',providerSubject:payload.sub,email,emailVerified:true,displayName:text(payload.name,120),locale:text(payload.locale,40),avatarUrl:httpsUrl(payload.picture)};
}

async function googleKey(kid:string):Promise<JsonWebKey>{
  if(!keyCache||keyCache.expiresAt<=Date.now()){
    const response=await fetch(GOOGLE_JWKS,{headers:{accept:'application/json'}});
    if(!response.ok)throw invalid();
    const raw=await response.text();
    if(raw.length>128*1024)throw invalid();
    const parsed=JSON.parse(raw) as {keys?:GoogleJwk[]};
    if(!Array.isArray(parsed.keys)||parsed.keys.length>20)throw invalid();
    const maxAge=Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1]||300);
    keyCache={keys:parsed.keys,expiresAt:Date.now()+Math.min(Math.max(maxAge,60),21600)*1000};
  }
  const found=keyCache.keys.find((key)=>key.kid===kid&&key.kty==='RSA'&&key.alg==='RS256');
  if(!found){keyCache=null;throw invalid();}
  return found;
}
function parseSegment(value:string):unknown{try{return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));}catch{throw invalid();}}
function decodeBase64Url(value:string):Uint8Array{try{const padded=value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4);return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));}catch{throw invalid();}}
function text(value:unknown,max:number):string|null{return typeof value==='string'&&value.trim()?value.trim().slice(0,max):null;}
function httpsUrl(value:unknown):string|null{if(typeof value!=='string'||value.length>1000)return null;try{const url=new URL(value);return url.protocol==='https:'?url.toString():null;}catch{return null;}}
function invalid(){return new HttpError(401,'GOOGLE_SIGN_IN_FAILED','Google sign-in could not be verified.');}
