import type { AuthContext, Env } from '../types.ts';
import { enumValue, json, readJson } from '../http.ts';
import { requireTripAccess } from '../access.ts';
import { BETA_RELEASE, betaEventNames, recordBetaEvent } from '../beta-events.ts';
import { PRODUCT_LIMITS } from '../config.ts';

const clientEvents = ['timeline_opened','whats_next_opened','during_trip_home_opened','ready_offline_opened','local_document_saved','local_document_opened','offline_conflict_seen'] as const;

export async function recordClientBetaEvent(request:Request,env:Env,auth:AuthContext):Promise<Response>{
  const body=await readJson<{eventName?:unknown;tripId?:unknown}>(request);
  const eventName=enumValue(body.eventName,'eventName',clientEvents);
  const tripId=typeof body.tripId==='string'&&body.tripId?body.tripId:null;
  if(tripId)await requireTripAccess(env,auth,tripId);
  await recordBetaEvent(env,auth,eventName,tripId,'daily');
  return json({recorded:true,eventName},{status:202},request,env);
}

export async function betaStatus(request:Request,env:Env,auth:AuthContext):Promise<Response>{
  const url=new URL(request.url); const tripId=url.searchParams.get('tripId');
  if(tripId)await requireTripAccess(env,auth,tripId);
  const actorEvents=(await env.DB.prepare(`SELECT event_name,COUNT(*) count,MAX(created_at) last_at FROM beta_events WHERE ${auth.userId?'user_id=?':'device_id=?'} GROUP BY event_name`)
    .bind(auth.userId??auth.deviceId).all<{event_name:string;count:number;last_at:number}>()).results??[];
  const eventMap=Object.fromEntries(actorEvents.map(x=>[x.event_name,{count:Number(x.count),lastAt:Number(x.last_at)}]));
  const tripCount=auth.userId
    ? await env.DB.prepare(`SELECT COUNT(DISTINCT t.id) count FROM trips t LEFT JOIN trip_members tm ON tm.trip_id=t.id AND tm.user_id=? AND tm.status='active' WHERE t.deleted_at IS NULL AND (t.owner_user_id=? OR tm.user_id=?)`).bind(auth.userId,auth.userId,auth.userId).first<{count:number}>()
    : await env.DB.prepare(`SELECT COUNT(*) count FROM trips WHERE created_by_device_id=? AND owner_user_id IS NULL AND deleted_at IS NULL`).bind(auth.deviceId).first<{count:number}>();
  let trip:null|Record<string,unknown>=null;
  if(tripId){
    const counts=await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM trip_items WHERE trip_id=? AND deleted_at IS NULL) timeline_items,
      (SELECT COUNT(*) FROM trip_items WHERE trip_id=? AND deleted_at IS NULL AND type IN ('transport','stay','activity','reservation')) bookings,
      (SELECT COUNT(*) FROM imports WHERE trip_id=? AND created_at>?) imports_24h,
      (SELECT COUNT(*) FROM impact_assessments WHERE trip_id=? AND status='active' AND severity IN ('critical','high')) urgent_impacts,
      (SELECT COUNT(*) FROM trip_checklist_items WHERE trip_id=? AND deleted_at IS NULL AND completed_at IS NULL AND priority IN ('critical','high')) important_tasks
    `).bind(tripId,tripId,tripId,Date.now()-86400000,tripId,tripId).first<Record<string,unknown>>();
    trip={
      id:tripId,
      timelineItems:Number(counts?.timeline_items??0),
      bookings:Number(counts?.bookings??0),
      imports24h:Number(counts?.imports_24h??0),
      importPreviewsRemaining:Math.max(0,PRODUCT_LIMITS.forwardedImportsPerDay-Number(counts?.imports_24h??0)),
      urgentImpacts:Number(counts?.urgent_impacts??0),
      importantTasks:Number(counts?.important_tasks??0),
    };
  }
  return json({beta:{
    release:env.BETA_RELEASE||BETA_RELEASE,
    metricsEnabled:env.BETA_METRICS_ENABLED==='true',
    accountMode:auth.userId?'account':'guest',
    tripCount:Number(tripCount?.count??0),
    trip,
    activation:{
      createdTrip:!!eventMap.trip_created,
      addedSecondBooking:!!eventMap.second_booking_added,
      usedWhatsNext:!!eventMap.whats_next_opened,
      usedTimeline:!!eventMap.timeline_opened,
      usedReadyOffline:!!eventMap.ready_offline_opened,
      completedTrip:!!eventMap.trip_completed,
      createdSecondTrip:!!eventMap.second_trip_created,
    },
    limits:PRODUCT_LIMITS,
    privacy:'Metrics contain only internal IDs, coarse event names, release and timestamps. No itinerary text, confirmation numbers, location history, email body, invite tokens or document bytes are recorded.',
  }},{},request,env);
}
