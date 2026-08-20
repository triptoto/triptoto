import type { AuthContext, Env } from '../types.ts';
import { json, nowMs, uuid } from '../http.ts';
import { requireTripAccess } from '../access.ts';
import { assessTripHealth, highestSeverity, type HealthChecklistItem, type HealthConnection, type HealthTrip } from '../../../../packages/trip-health/src/index.ts';
import type { TripItem } from '../../../../packages/domain/src/index.ts';

export async function expandedTripHealth(request:Request,env:Env,auth:AuthContext,tripId:string,persist=false):Promise<Response>{
  await requireTripAccess(env,auth,tripId,persist);
  const tripRow=await env.DB.prepare(`SELECT id,lifecycle_state,starts_on,ends_on,version FROM trips WHERE id=? AND deleted_at IS NULL`).bind(tripId).first<Record<string,unknown>>();
  if(!tripRow)return json({error:{code:'TRIP_NOT_FOUND',message:'Trip was not found.'}},{status:404},request,env);
  const itemRows=(await env.DB.prepare(`SELECT id,trip_id,type,status,title,starts_at_utc,ends_at_utc,start_timezone,end_timezone,start_location_id,end_location_id,confidence,deleted_at FROM trip_items WHERE trip_id=? AND deleted_at IS NULL ORDER BY starts_at_utc`).bind(tripId).all<Record<string,unknown>>()).results??[];
  const items:TripItem[]=itemRows.map(row=>({id:String(row.id),tripId:String(row.trip_id),type:row.type as TripItem['type'],status:row.status as TripItem['status'],title:String(row.title),startsAtUtc:row.starts_at_utc==null?undefined:Number(row.starts_at_utc),endsAtUtc:row.ends_at_utc==null?undefined:Number(row.ends_at_utc),startTimezone:row.start_timezone==null?undefined:String(row.start_timezone),endTimezone:row.end_timezone==null?undefined:String(row.end_timezone),startLocationId:row.start_location_id==null?undefined:String(row.start_location_id),endLocationId:row.end_location_id==null?undefined:String(row.end_location_id),confidence:row.confidence as TripItem['confidence']}));
  const connectionRows=(await env.DB.prepare(`SELECT id,from_item_id,to_item_id,connection_type,recommended_buffer_minutes,minimum_buffer_minutes,requires_airport_change,requires_baggage_reclaim,requires_immigration,requires_security,requires_terminal_change FROM connections WHERE trip_id=?`).bind(tripId).all<Record<string,unknown>>()).results??[];
  const connections:HealthConnection[]=connectionRows.map(row=>({id:String(row.id),fromItemId:String(row.from_item_id),toItemId:String(row.to_item_id),connectionType:row.connection_type as HealthConnection['connectionType'],recommendedBufferMinutes:row.recommended_buffer_minutes==null?undefined:Number(row.recommended_buffer_minutes),minimumBufferMinutes:row.minimum_buffer_minutes==null?undefined:Number(row.minimum_buffer_minutes),requiresAirportChange:Number(row.requires_airport_change)===1,requiresBaggageReclaim:Number(row.requires_baggage_reclaim)===1,requiresImmigration:Number(row.requires_immigration)===1,requiresSecurity:Number(row.requires_security)===1,requiresTerminalChange:Number(row.requires_terminal_change)===1}));
  const checklistRows=(await env.DB.prepare(`SELECT id,title,priority,completed_at FROM trip_checklist_items WHERE trip_id=? AND deleted_at IS NULL`).bind(tripId).all<Record<string,unknown>>()).results??[];
  const checklist:HealthChecklistItem[]=checklistRows.map(row=>({id:String(row.id),title:String(row.title),priority:row.priority as HealthChecklistItem['priority'],completedAt:row.completed_at==null?undefined:Number(row.completed_at)}));
  const counts=await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM travelers WHERE trip_id=? AND deleted_at IS NULL) traveler_count,(SELECT COUNT(*) FROM trip_items WHERE trip_id=? AND type='stay' AND status NOT IN ('cancelled','skipped') AND deleted_at IS NULL) stay_count,(SELECT COUNT(*) FROM trip_items WHERE trip_id=? AND type='transport' AND status NOT IN ('cancelled','skipped') AND deleted_at IS NULL) transport_count`).bind(tripId,tripId,tripId).first<{traveler_count:number;stay_count:number;transport_count:number}>();
  const trip:HealthTrip={id:String(tripRow.id),lifecycleState:tripRow.lifecycle_state as HealthTrip['lifecycleState'],startsOn:tripRow.starts_on==null?undefined:String(tripRow.starts_on),endsOn:tripRow.ends_on==null?undefined:String(tripRow.ends_on)};
  const issues=assessTripHealth({nowUtc:nowMs(),trip,items,connections,checklist,travelerCount:Number(counts?.traveler_count??0),stayCount:Number(counts?.stay_count??0),transportCount:Number(counts?.transport_count??0)});
  const highest=highestSeverity(issues);
  const calculatedAt=nowMs();
  if(persist){
    await env.DB.prepare(`INSERT INTO trip_health_runs(id,trip_id,input_version,highest_severity,issue_count,issues_json,calculated_at) VALUES (?,?,?,?,?,?,?)`).bind(uuid(),tripId,Number(tripRow.version??1),highest,issues.length,JSON.stringify(issues),calculatedAt).run();
    const oldRuns=(await env.DB.prepare(`SELECT id FROM trip_health_runs WHERE trip_id=? ORDER BY calculated_at DESC LIMIT -1 OFFSET 20`).bind(tripId).all<{id:string}>()).results??[];
    for(const run of oldRuns)await env.DB.prepare(`DELETE FROM trip_health_runs WHERE id=?`).bind(run.id).run();
  }
  return json({health:{highestSeverity:highest,issueCount:issues.length,issues,calculatedAt,persisted:persist}},{},request,env);
}
