import type { Env } from '../types.ts';
import { json } from '../http.ts';

const requiredTables=['trips','trip_items','journey_groups','traveler_booking_details','trip_contacts','trip_time_markers','trip_sync_cursors','sync_idempotency','trip_health_runs'];

export async function readiness(request:Request,env:Env):Promise<Response>{
  const checks:{name:string;ok:boolean;detail?:string}[]=[];
  try{
    for(const table of requiredTables){
      const row=await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(table).first<{name:string}>();
      checks.push({name:`table:${table}`,ok:!!row,detail:row?'available':'missing'});
    }
  }catch(error){checks.push({name:'database',ok:false,detail:'query_failed'});}
  const ok=checks.every(check=>check.ok);
  return json({ready:ok,service:'tripto-api',build:env.BETA_RELEASE||'beta-candidate-1',checks,features:{liveFlights:env.LIVE_FLIGHTS_ENABLED==='true',generativeAI:env.AI_ENABLED==='true',gmailSync:env.GMAIL_SYNC_ENABLED==='true',r2Documents:env.R2_DOCUMENTS_ENABLED==='true'},timestamp:Date.now()},{status:ok?200:503},request,env);
}
