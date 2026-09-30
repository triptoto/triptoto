import { runScheduledTaxFreeSourceChecks } from '../apps/worker/src/tax-free-monitor.ts';

type Source = {id:string;url:string;etag:string|null;last_modified:string|null;content_hash:string|null};
const equal=(actual:unknown,expected:unknown,message:string)=>{if(actual!==expected)throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);};
const ok=(value:unknown,message:string)=>{if(!value)throw new Error(message);};

function mockEnv(enabled:boolean, source?:Source) {
  const sql:string[]=[];
  const DB={
    prepare(query:string){
      sql.push(query.replace(/\s+/g,' ').trim());
      return {
        bind(..._args:unknown[]){return this;},
        async all(){return {results:source?[source]:[]};},
        async run(){return {success:true};},
      };
    },
  };
  return {env:{DB,TAX_FREE_SOURCE_CHECKS_ENABLED:enabled?'true':'false',TAX_FREE_SOURCE_CHECK_BUDGET:'4',TAX_FREE_SOURCE_TIMEOUT_MS:'8000',TAX_FREE_SOURCE_MAX_BYTES:'750000'} as any,sql};
}

{
  const {env,sql}=mockEnv(false);
  await runScheduledTaxFreeSourceChecks(env);
  equal(sql.length,0,'disabled checks must not touch D1 or the network');
}

{
  const originalFetch=globalThis.fetch;
  let fetches=0;
  globalThis.fetch=async()=>{fetches++;return new Response('<main>official rule changed</main>',{status:200,headers:{etag:'"new"','last-modified':'Sun, 27 Sep 2026 00:00:00 GMT'}});};
  try{
    const {env,sql}=mockEnv(true,{id:'source-1',url:'https://www.gov.uk/tax-on-shopping/taxfree-shopping',etag:'"old"',last_modified:null,content_hash:'old-content-hash'});
    await runScheduledTaxFreeSourceChecks(env);
    equal(fetches,1,'allowlisted source fetch count');
    ok(sql.some(query=>query.includes('INSERT INTO tax_free_change_candidates')),'changed official content must create a review candidate');
    ok(!sql.some(query=>query.includes("SET lifecycle='published'")),'a source check must never publish a rule');
  } finally { globalThis.fetch=originalFetch; }
}

{
  const originalFetch=globalThis.fetch;
  let fetches=0;
  globalThis.fetch=async()=>{fetches++;return new Response('unexpected');};
  try{
    const {env,sql}=mockEnv(true,{id:'source-2',url:'http://127.0.0.1/private',etag:null,last_modified:null,content_hash:null});
    await runScheduledTaxFreeSourceChecks(env);
    equal(fetches,0,'non-HTTPS, private, or non-allowlisted sources must not be fetched');
    ok(sql.some(query=>query.includes('INSERT INTO tax_free_recheck_queue')),'failed source checks must enter the bounded recheck queue');
  } finally { globalThis.fetch=originalFetch; }
}

console.log('tax-free source monitor scenarios passed');
