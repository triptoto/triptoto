import { verifyGoogleCredential } from '../../apps/worker/src/google-auth.ts';
import type { Env } from '../../apps/worker/src/types.ts';

const assert={equal(a:unknown,b:unknown,label='values differ'){if(a!==b)throw new Error(`${label}: ${String(a)} !== ${String(b)}`);},async rejects(fn:()=>Promise<unknown>,re:RegExp){try{await fn();}catch(error){if(re.test(String(error)))return;throw error;}throw new Error('Expected promise to reject.');}};

const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const publicJwk=await crypto.subtle.exportKey('jwk',pair.publicKey) as JsonWebKey&{kid?:string};Object.assign(publicJwk,{kid:'test-key',alg:'RS256',use:'sig'});
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({keys:[publicJwk]}),{status:200,headers:{'cache-control':'public,max-age=300','content-type':'application/json'}});
const env={ACCOUNT_AUTH_ENABLED:'true',GOOGLE_CLIENT_ID:'client.apps.googleusercontent.com'} as Env;
const b64=(value:Uint8Array|string)=>{const bytes=typeof value==='string'?new TextEncoder().encode(value):value;let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
async function token(overrides:Record<string,unknown>={}){const now=Math.floor(Date.now()/1000),header=b64(JSON.stringify({alg:'RS256',kid:'test-key',typ:'JWT'})),payload=b64(JSON.stringify({iss:'https://accounts.google.com',aud:env.GOOGLE_CLIENT_ID,sub:'google-subject-123',email:'traveler@example.test',email_verified:true,name:'Traveler',picture:'https://example.test/avatar.png',nonce:'nonce-123',iat:now,exp:now+600,...overrides})),data=`${header}.${payload}`,signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(data));return `${data}.${b64(new Uint8Array(signature))}`;}
const verified=await verifyGoogleCredential(env,await token(),'nonce-123');assert.equal(verified.providerSubject,'google-subject-123');assert.equal(verified.emailVerified,true);assert.equal(verified.avatarUrl,'https://example.test/avatar.png');
await assert.rejects(async()=>verifyGoogleCredential(env,await token({aud:'wrong-client'}),'nonce-123'),/could not be verified/);
await assert.rejects(async()=>verifyGoogleCredential(env,await token({exp:1}),'nonce-123'),/could not be verified/);
await assert.rejects(async()=>verifyGoogleCredential(env,await token({nonce:'other'}),'nonce-123'),/could not be verified/);
await assert.rejects(async()=>verifyGoogleCredential(env,await token({email_verified:false}),'nonce-123'),/could not be verified/);
await assert.rejects(async()=>verifyGoogleCredential({...env,ACCOUNT_AUTH_ENABLED:'false'},await token(),'nonce-123'),/unavailable/);
globalThis.fetch=originalFetch;
console.log('Google auth scenarios passed: signed JWT, issuer, audience, expiry, nonce, verified email and feature gate.');
