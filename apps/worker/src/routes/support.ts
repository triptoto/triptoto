import type { AuthContext, Env } from '../types.ts';
import { HttpError, json } from '../http.ts';
import { requireTripAccess } from '../access.ts';

export async function tripSupportBundle(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  const access=await requireTripAccess(env,auth,tripId);
  const trip=await env.DB.prepare(`SELECT id,lifecycle_state,starts_on,ends_on,version,updated_at FROM trips WHERE id=? AND deleted_at IS NULL`).bind(tripId).first<Record<string,unknown>>();
  if(!trip)throw new HttpError(404,'TRIP_NOT_FOUND','Trip was not found.');
  const counts=await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM trip_items WHERE trip_id=? AND deleted_at IS NULL) timeline_items,
    (SELECT COUNT(*) FROM travelers WHERE trip_id=? AND deleted_at IS NULL) travelers,
    (SELECT COUNT(*) FROM trip_checklist_items WHERE trip_id=? AND deleted_at IS NULL) checklist_items,
    (SELECT COUNT(*) FROM connections WHERE trip_id=?) connections,
    (SELECT COUNT(*) FROM documents WHERE trip_id=? AND deleted_at IS NULL) documents`).bind(tripId,tripId,tripId,tripId,tripId).first<Record<string,unknown>>();
  const confidence=(await env.DB.prepare(`SELECT confidence,COUNT(*) count FROM trip_items WHERE trip_id=? AND deleted_at IS NULL GROUP BY confidence ORDER BY confidence`).bind(tripId).all()).results??[];
  const sources=(await env.DB.prepare(`SELECT source_type,COUNT(*) count FROM trip_items WHERE trip_id=? AND deleted_at IS NULL GROUP BY source_type ORDER BY source_type`).bind(tripId).all()).results??[];
  const changes=(await env.DB.prepare(`SELECT entity_type,event_type,source_type,created_at FROM change_events WHERE trip_id=? ORDER BY created_at DESC LIMIT 25`).bind(tripId).all()).results??[];
  const impacts=(await env.DB.prepare(`SELECT impact_type,severity,status,explanation_code,calculated_at FROM impact_assessments WHERE trip_id=? AND status='active' ORDER BY calculated_at DESC LIMIT 25`).bind(tripId).all()).results??[];
  const bundle={
    supportSchemaVersion:1,
    generatedAt:Date.now(),
    product:'tripto.to',
    role:access.role,
    trip,
    counts,
    confidence,
    sources,
    recentChanges:changes,
    activeImpacts:impacts,
    features:{
      accountAuth:env.ACCOUNT_AUTH_ENABLED==='true',sharing:env.SHARING_ENABLED==='true',demoTools:env.DEMO_TOOLS_ENABLED==='true',
      liveFlights:env.LIVE_FLIGHTS_ENABLED==='true',generativeAI:env.AI_ENABLED==='true',gmailSync:env.GMAIL_SYNC_ENABLED==='true',r2Documents:env.R2_DOCUMENTS_ENABLED==='true',
    },
    privacyNote:'No confirmation numbers, invite tokens, document file bytes, email bodies, addresses, or traveler names are included.',
  };
  return json(bundle,{headers:{'content-disposition':`attachment; filename="tripto-support-${tripId.slice(0,8)}.json"`}},request,env);
}
