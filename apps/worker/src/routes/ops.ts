import type { AuthContext, Env } from '../types.ts';
import { json } from '../http.ts';
import { BETA_RELEASE } from '../beta-events.ts';

export async function opsSummary(request:Request,env:Env,_auth:AuthContext):Promise<Response>{
  if(env.OPS_ENABLED!=='true')return json({error:{code:'NOT_FOUND',message:'Endpoint not found.'}},{status:404},request,env);
  const supplied=request.headers.get('x-tripto-ops-secret')??'';
  if(!env.OPS_SECRET||env.OPS_SECRET.length<20||!(await equalSecret(supplied,env.OPS_SECRET)))return json({error:{code:'NOT_FOUND',message:'Endpoint not found.'}},{status:404},request,env);
  const since=Date.now()-86400000;
  const tripStates=(await env.DB.prepare(`SELECT lifecycle_state,COUNT(*) count FROM trips WHERE deleted_at IS NULL GROUP BY lifecycle_state`).all<{lifecycle_state:string;count:number}>()).results??[];
  const eventCounts=(await env.DB.prepare(`SELECT event_name,COUNT(*) count FROM beta_events WHERE created_at>? GROUP BY event_name ORDER BY count DESC`).bind(since).all<{event_name:string;count:number}>()).results??[];
  const importStates=(await env.DB.prepare(`SELECT status,COUNT(*) count FROM imports WHERE created_at>? GROUP BY status`).bind(since).all<{status:string;count:number}>()).results??[];
  const impacts=(await env.DB.prepare(`SELECT severity,COUNT(*) count FROM impact_assessments WHERE status='active' GROUP BY severity`).all<{severity:string;count:number}>()).results??[];
  const integrationHealth=(await env.DB.prepare(`SELECT integration_type,provider_key,enabled,status,last_success_at,last_failure_at,consecutive_failures,quota_used,quota_limit,last_error_code,updated_at FROM integration_health ORDER BY integration_type,provider_key`).all()).results??[];
  const totals=await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) users,
    (SELECT COUNT(*) FROM devices WHERE revoked_at IS NULL) devices,
    (SELECT COUNT(*) FROM trips WHERE deleted_at IS NULL) trips,
    (SELECT COUNT(*) FROM beta_events WHERE created_at>?) events_24h
  `).bind(since).first<Record<string,unknown>>();
  return json({ops:{
    release:env.BETA_RELEASE||BETA_RELEASE,
    totals:{users:Number(totals?.users??0),devices:Number(totals?.devices??0),trips:Number(totals?.trips??0),events24h:Number(totals?.events_24h??0)},
    tripStates,eventCounts,importStates,activeImpacts:impacts,integrationHealth,
    features:{liveFlights:env.LIVE_FLIGHTS_ENABLED==='true',ai:env.AI_ENABLED==='true',gmail:env.GMAIL_SYNC_ENABLED==='true',r2:env.R2_DOCUMENTS_ENABLED==='true',auth:env.ACCOUNT_AUTH_ENABLED==='true',sharing:env.SHARING_ENABLED==='true'},
    privacy:'Aggregate counts only. No booking contents, email bodies, locations, tokens or document bytes.',
    generatedAt:Date.now(),
  }},{},request,env);
}
async function equalSecret(a:string,b:string):Promise<boolean>{
  const [aa,bb]=await Promise.all([digest(a),digest(b)]);if(aa.length!==bb.length)return false;let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0;
}
async function digest(value:string):Promise<Uint8Array>{return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));}
