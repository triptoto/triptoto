import type { Env } from './types.ts';

const ALLOWED_HOSTS = new Set(['www.douane.gouv.fr','www.impots.gouv.fr','www.adm.gov.it','vatrefund.adm.gov.it','www.nta.go.jp','www.gov.uk','taxation-customs.ec.europa.eu','europa.eu','www.adr.it','www.taxrefund.it','milanairports.com','www.veneziaairport.it','www.globalblue.com','taxfree.weareplanet.com','www.abf.gov.au','www.iras.gov.sg','tax.gov.ae','www.airport.az','www.gov.il','vrtweb.rd.go.th','www.dot.gov.tw','www.pajak.go.id','www.sars.gov.za','bir-cdn.bir.gov.ph']);

function enabled(env:Env):boolean{return env.TAX_FREE_SOURCE_CHECKS_ENABLED==='true';}
function bounded(raw:string|undefined,fallback:number,min:number,max:number):number{const n=Number(raw);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.floor(n))):fallback;}
function safeUrl(raw:string):URL|null{try{const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||url.port||!ALLOWED_HOSTS.has(url.hostname))return null;return url;}catch{return null;}}
async function hash(value:Uint8Array):Promise<string>{const copy=new Uint8Array(value.byteLength);copy.set(value);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',copy.buffer))].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function readLimited(response:Response,maxBytes:number):Promise<Uint8Array>{const reader=response.body?.getReader();if(!reader)return new Uint8Array();const chunks:Uint8Array[]=[];let total=0;while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>maxBytes){await reader.cancel();throw new Error('source_too_large');}chunks.push(value);}const out=new Uint8Array(total);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.byteLength;}return out;}

async function fetchOfficial(source:{id:string;url:string;etag?:string|null;last_modified?:string|null},timeoutMs:number,maxBytes:number):Promise<{status:number;etag:string|null;lastModified:string|null;body?:Uint8Array;finalUrl?:string}>{
  let url=safeUrl(source.url);if(!url)throw new Error('source_not_allowlisted');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  const headers=new Headers({accept:'text/html,application/pdf;q=0.9,*/*;q=0.2','user-agent':'TriptoTaxFreeVerifier/1.0 (+https://tripto.to/contact)'});
  if(source.etag)headers.set('if-none-match',source.etag);if(source.last_modified)headers.set('if-modified-since',source.last_modified);
  try{
    for(let redirect=0;redirect<3;redirect++){
      const response=await fetch(url,{method:'GET',headers,redirect:'manual',signal:controller.signal});
      if(response.status>=300&&response.status<400){const next=response.headers.get('location');if(!next)throw new Error('redirect_without_location');const resolved=safeUrl(new URL(next,url).toString());if(!resolved)throw new Error('unsafe_redirect');url=resolved;continue;}
      if(response.status===304)return{status:304,etag:response.headers.get('etag'),lastModified:response.headers.get('last-modified'),finalUrl:url.toString()};
      if(!response.ok)throw new Error(`source_http_${response.status}`);
      const declared=Number(response.headers.get('content-length')||0);if(declared>maxBytes)throw new Error('source_too_large');
      return{status:response.status,etag:response.headers.get('etag'),lastModified:response.headers.get('last-modified'),body:await readLimited(response,maxBytes),finalUrl:url.toString()};
    }
    throw new Error('too_many_redirects');
  }finally{clearTimeout(timer);}
}

export async function runScheduledTaxFreeSourceChecks(env:Env):Promise<void>{
  if(!enabled(env))return;
  const budget=bounded(env.TAX_FREE_SOURCE_CHECK_BUDGET,4,1,20),timeoutMs=bounded(env.TAX_FREE_SOURCE_TIMEOUT_MS,8000,1000,15000),maxBytes=bounded(env.TAX_FREE_SOURCE_MAX_BYTES,750000,50000,2000000),now=Date.now();
  const sources=(await env.DB.prepare(`SELECT id,url,etag,last_modified,content_hash FROM tax_free_sources WHERE active=1 AND (next_check_at IS NULL OR next_check_at<=?) ORDER BY COALESCE(next_check_at,0),id LIMIT ?`).bind(now,budget).all<{id:string;url:string;etag:string|null;last_modified:string|null;content_hash:string|null}>()).results||[];
  for(const source of sources){
    try{
      const result=await fetchOfficial(source,timeoutMs,maxBytes),next=now+7*86400000;
      if(result.status===304){await env.DB.prepare(`UPDATE tax_free_sources SET last_technical_check_at=?,next_check_at=?,etag=COALESCE(?,etag),last_modified=COALESCE(?,last_modified) WHERE id=?`).bind(now,next,result.etag,result.lastModified,source.id).run();continue;}
      const digest=await hash(result.body||new Uint8Array());
      if(source.content_hash&&digest!==source.content_hash){
        const excerpt=new TextDecoder().decode((result.body||new Uint8Array()).slice(0,16000)).replace(/\s+/g,' ').trim();
        await env.DB.prepare(`INSERT INTO tax_free_change_candidates(id,source_id,detected_at,before_hash,after_hash,http_status,diff_summary,candidate_content,status) VALUES(?,?,?,?,?,?,?,?, 'pending')`).bind(crypto.randomUUID(),source.id,now,source.content_hash,digest,result.status,'Official source content changed; manual rule review required.',excerpt).run();
      }
      await env.DB.prepare(`UPDATE tax_free_sources SET last_technical_check_at=?,next_check_at=?,etag=?,last_modified=?,content_hash=? WHERE id=?`).bind(now,next,result.etag,result.lastModified,digest,source.id).run();
    }catch(error){
      const message=error instanceof Error?error.message:'source_check_failed',next=now+86400000;
      await env.DB.prepare(`INSERT INTO tax_free_recheck_queue(source_id,reason,priority,due_at,attempts,last_error,updated_at) VALUES(?,?,?,?,1,?,?) ON CONFLICT(source_id) DO UPDATE SET reason=excluded.reason,due_at=excluded.due_at,attempts=tax_free_recheck_queue.attempts+1,last_error=excluded.last_error,updated_at=excluded.updated_at`).bind(source.id,'technical_check_failed',50,next,message.slice(0,500),now).run();
      await env.DB.prepare(`UPDATE tax_free_sources SET last_technical_check_at=?,next_check_at=? WHERE id=?`).bind(now,next,source.id).run();
    }
  }
}
