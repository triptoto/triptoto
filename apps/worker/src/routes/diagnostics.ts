import type { AuthContext, Env } from '../types.ts';
import { json } from '../http.ts';
import { PRODUCT_LIMITS } from '../config.ts';

export async function diagnostics(request:Request,env:Env,auth:AuthContext):Promise<Response>{
  const device=await env.DB.prepare(`SELECT id,user_id,platform,app_version,api_version,created_at,last_seen_at,sync_cursor,revoked_at FROM devices WHERE id=?`).bind(auth.deviceId).first<Record<string,unknown>>();
  const tripCount=auth.userId
    ? await env.DB.prepare(`SELECT COUNT(DISTINCT t.id) AS count FROM trips t LEFT JOIN trip_members tm ON tm.trip_id=t.id AND tm.user_id=? AND tm.status='active' WHERE t.deleted_at IS NULL AND (t.owner_user_id=? OR tm.user_id=?)`).bind(auth.userId,auth.userId,auth.userId).first<{count:number}>()
    : await env.DB.prepare(`SELECT COUNT(*) AS count FROM trips WHERE created_by_device_id=? AND owner_user_id IS NULL AND deleted_at IS NULL`).bind(auth.deviceId).first<{count:number}>();
  return json({diagnostics:{
    mode:auth.userId?'account':'guest',
    userId:auth.userId??null,
    device:device?{id:device.id,platform:device.platform,appVersion:device.app_version,apiVersion:device.api_version,createdAt:device.created_at,lastSeenAt:device.last_seen_at,syncCursor:device.sync_cursor}:null,
    tripCount:Number(tripCount?.count??0),
    limits:PRODUCT_LIMITS,
    features:{
      accountAuth:env.ACCOUNT_AUTH_ENABLED==='true',
      sharing:env.SHARING_ENABLED==='true',
      demoTools:env.DEMO_TOOLS_ENABLED==='true',
      liveFlights:env.LIVE_FLIGHTS_ENABLED==='true',
      generativeAI:env.AI_ENABLED==='true',
      gmailSync:env.GMAIL_SYNC_ENABLED==='true',
      r2Documents:env.R2_DOCUMENTS_ENABLED==='true',
    },
    serverTime:Date.now(),
  }},{},request,env);
}
