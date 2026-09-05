import { PRODUCT_LIMITS, FEATURE_FLAGS } from '../../apps/worker/src/config.ts';
import { readJson } from '../../apps/worker/src/http.ts';
import { betaEventNames } from '../../apps/worker/src/beta-events.ts';

function assert(condition:unknown,label:string):asserts condition{if(!condition)throw new Error(`Launch scenario failed: ${label}`);}

assert(PRODUCT_LIMITS.activeTripsPerAccount===10,'active trip beta quota');
assert(PRODUCT_LIMITS.documentsPerTrip===20,'local/cloud beta document count aligned');
assert(PRODUCT_LIMITS.maxDocumentBytes===10*1024*1024,'document byte cap');
assert(PRODUCT_LIMITS.forwardedImportsPerDay===20,'forwarded import daily quota');
assert(PRODUCT_LIMITS.actorWritesPerHour===300,'actor write rate limit');
assert(PRODUCT_LIMITS.guestSessionsPerHourPerFingerprint===60,'guest-session abuse guard');
assert(FEATURE_FLAGS.betaMetrics===true,'privacy-safe beta metrics enabled');
assert(FEATURE_FLAGS.liveFlights===false&&FEATURE_FLAGS.generativeAI===false,'paid/live integrations remain disabled');
assert(betaEventNames.every(name=>!/(email|address|location|confirmation|document_bytes)/i.test(name)),'beta event names contain no payload fields');

let tooLarge=false;
try{
  const payload=JSON.stringify({value:'x'.repeat(2048)});
  await readJson(new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body:payload}),1024);
}catch(error){tooLarge=(error as {code?:string}).code==='REQUEST_TOO_LARGE';}
assert(tooLarge,'JSON body cap rejects oversized request');

console.log('Launch readiness scenarios passed: quotas, feature boundaries, event privacy and request-size guard.');
