import type { AuthContext, Env } from '../types.ts';
import { json } from '../http.ts';
import { requireTripAccess } from '../access.ts';
import { evaluateTrip } from '../../../../packages/trip-brain/src/index.ts';
import type { TripItem } from '../../../../packages/domain/src/index.ts';

export async function tripBrain(request: Request, env: Env, auth: AuthContext, tripId: string): Promise<Response> {
  await requireTripAccess(env, auth, tripId);
  const rows=(await env.DB.prepare(`SELECT id,trip_id,type,status,title,starts_at_utc,ends_at_utc,start_timezone,end_timezone,start_location_id,end_location_id,confidence,deleted_at FROM trip_items WHERE trip_id=? AND deleted_at IS NULL ORDER BY starts_at_utc`).bind(tripId).all<Record<string,unknown>>()).results??[];
  const items:TripItem[]=rows.map(r=>({id:String(r.id),tripId:String(r.trip_id),type:r.type as TripItem['type'],status:r.status as TripItem['status'],title:String(r.title),startsAtUtc:r.starts_at_utc==null?undefined:Number(r.starts_at_utc),endsAtUtc:r.ends_at_utc==null?undefined:Number(r.ends_at_utc),startTimezone:r.start_timezone==null?undefined:String(r.start_timezone),endTimezone:r.end_timezone==null?undefined:String(r.end_timezone),startLocationId:r.start_location_id==null?undefined:String(r.start_location_id),endLocationId:r.end_location_id==null?undefined:String(r.end_location_id),confidence:r.confidence as TripItem['confidence']}));
  const result=evaluateTrip({nowUtc:Date.now(),items});
  const essentials=(await env.DB.prepare(`SELECT id,title,priority,completed_at FROM trip_checklist_items WHERE trip_id=? AND deleted_at IS NULL AND completed_at IS NULL AND priority IN ('critical','high') ORDER BY CASE priority WHEN 'critical' THEN 0 ELSE 1 END, created_at LIMIT 5`).bind(tripId).all()).results??[];
  const alerts=(await env.DB.prepare(`SELECT id,type,severity,title,message,status FROM alerts WHERE trip_id=? AND status IN ('new','shown','acknowledged') ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, created_at DESC LIMIT 5`).bind(tripId).all()).results??[];
  return json({brain:{...result,smartEssentials:essentials,alerts}}, {}, request, env);
}
