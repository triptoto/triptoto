import type { AuthContext, Env } from '../types.ts';
import { json, requestId } from '../http.ts';
import { PRODUCT_LIMITS } from '../config.ts';

export async function diagnostics(request:Request,env:Env,auth:AuthContext):Promise<Response>{
  const device=await env.DB.prepare(`SELECT id,user_id,platform,app_version,api_version,created_at,last_seen_at,sync_cursor,revoked_at FROM devices WHERE id=?`).bind(auth.deviceId).first<Record<string,unknown>>();
  const tripCount=auth.userId
    ? await env.DB.prepare(`SELECT COUNT(DISTINCT t.id) AS count FROM trips t LEFT JOIN trip_members tm ON tm.trip_id=t.id AND tm.user_id=? AND tm.status='active' WHERE t.deleted_at IS NULL AND (t.owner_user_id=? OR tm.user_id=?)`).bind(auth.userId,auth.userId,auth.userId).first<{count:number}>()
    : await env.DB.prepare(`SELECT COUNT(*) AS count FROM trips WHERE created_by_device_id=? AND owner_user_id IS NULL AND deleted_at IS NULL`).bind(auth.deviceId).first<{count:number}>();
  const tables=await env.DB.prepare(`SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).first<{count:number}>();
  const migrations=await env.DB.prepare(`SELECT COUNT(*) AS count FROM d1_migrations`).first<{count:number}>().catch(()=>null);
  return json({diagnostics:{
    requestId:requestId(request),
    mode:auth.userId?'account':'guest',
    userId:auth.userId??null,
    device:device?{id:device.id,platform:device.platform,appVersion:device.app_version,apiVersion:device.api_version,createdAt:device.created_at,lastSeenAt:device.last_seen_at,syncCursor:device.sync_cursor}:null,
    tripCount:Number(tripCount?.count??0),
    database:{tables:Number(tables?.count??0),migrations:migrations?Number(migrations.count??0):null},
    limits:PRODUCT_LIMITS,
    features:{
      accountAuth:env.ACCOUNT_AUTH_ENABLED==='true',
      sharing:env.SHARING_ENABLED==='true',
      demoTools:env.DEMO_TOOLS_ENABLED==='true',
      liveFlights:env.LIVE_FLIGHTS_ENABLED==='true',
      generativeAI:env.AI_ENABLED==='true',
      gmailSync:env.GMAIL_SYNC_ENABLED==='true',
      r2Documents:env.R2_DOCUMENTS_ENABLED==='true',
      betaMetrics:env.BETA_METRICS_ENABLED==='true',
      ops:env.OPS_ENABLED==='true',
    },
    release:env.BETA_RELEASE||'beta-candidate-1',
    serverTime:Date.now(),
    privacy:'No booking contents, invite tokens, session secrets, or document bytes are included.',
  }},{},request,env);
}
