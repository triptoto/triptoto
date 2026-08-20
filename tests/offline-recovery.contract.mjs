import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const assert=(v,m)=>{if(!v)throw new Error(m)};
assert(source.includes("if(state.pendingSyncCount){showRecovery('Local data cannot be removed yet.'"),'data removal must block with pending sync');
assert(source.includes("q.status='needs_review'")&&source.includes("x.status!=='done'"),'conflict state must remain visible and pending');
assert(source.includes("Some changes still need review."),'reconnect must preserve unresolved review state');
assert(source.includes("Offline mode. Showing the last verified trip data cached on this device."),'offline cache status remains explicit');
assert(source.includes("Cached flight status is never presented as live."),'cached flight status remains non-live');
console.log('Offline recovery browser contract passed.');
