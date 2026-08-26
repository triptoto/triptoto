import type { AuthContext, Env } from '../types.ts';
import { HttpError, enumValue, json, nowMs, optionalInteger, optionalString, readJson, requireString } from '../http.ts';
import { requireTripAccess } from '../access.ts';
import { recordChangeEvent } from '../change-events.ts';
import { claimManualBookingCreate, completeManualBookingCreate, manualBookingLocationFingerprint, recoverManualBookingCreate } from '../manual-booking-idempotency.ts';

const kinds=['activity','reservation'] as const;
const statuses=['planned','confirmed','completed','cancelled','skipped','unknown'] as const;
const confidences=['confirmed','live','estimated','unavailable','low_confidence'] as const;
interface Body{kind?:unknown;title?:unknown;status?:unknown;startsAtUtc?:unknown;endsAtUtc?:unknown;timezone?:unknown;locationId?:unknown;activityType?:unknown;reservationType?:unknown;reference?:unknown;arrivalDeadlineUtc?:unknown;windowStartUtc?:unknown;windowEndUtc?:unknown;notes?:unknown;confidence?:unknown;travelerIds?:unknown;version?:unknown;}

export async function listActivities(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId);
  const result=await env.DB.prepare(`SELECT ti.*,a.activity_type,a.venue_location_id,a.reservation_reference,a.arrival_deadline_utc,a.notes AS activity_notes,r.reservation_type,r.confirmation_number,r.window_start_utc,r.window_end_utc,r.notes AS reservation_notes,(SELECT GROUP_CONCAT(tit.traveler_id, ',') FROM trip_item_travelers tit WHERE tit.trip_item_id=ti.id) traveler_ids FROM trip_items ti LEFT JOIN activities a ON a.trip_item_id=ti.id LEFT JOIN reservations r ON r.trip_item_id=ti.id WHERE ti.trip_id=? AND ti.type IN ('activity','reservation') AND ti.deleted_at IS NULL ORDER BY ti.starts_at_utc,ti.created_at`).bind(tripId).all();
  return json({activities:result.results??[]},{},request,env);
}

export async function createActivity(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const body=await readJson<Body>(request);
  const values=normalize(body,false);
  await ensureLocation(env,tripId,values.locationId);
  const travelerIds=arrayOfIds(body.travelerIds);
  await ensureTravelers(env,tripId,travelerIds);
  const location=await manualBookingLocationFingerprint(env,tripId,values.locationId),claim=await claimManualBookingCreate(request,env,auth,tripId,'activity',{...values,locationId:undefined,location,travelerIds:[...travelerIds].sort()});
  const replay=await recoverManualBookingCreate(env,claim,id=>getCreatedActivity(env,tripId,id),item=>({eventType:`${String(item.type)}_added`,newValue:item}));
  if(replay)return json({item:replay,kind:replay.type},{status:201},request,env);
  const id=claim.resourceId,now=nowMs();
  const statements=[env.DB.prepare(`INSERT INTO trip_items(id,trip_id,type,status,title,start_location_id,starts_at_utc,ends_at_utc,start_timezone,end_timezone,source_type,confidence,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,'manual',?,?,?,1)`).bind(id,tripId,values.kind,values.status,values.title,values.locationId,values.startsAtUtc,values.endsAtUtc,values.timezone,values.timezone,values.confidence,now,now)];
  if(values.kind==='activity')statements.push(env.DB.prepare(`INSERT INTO activities(trip_item_id,activity_type,venue_location_id,reservation_reference,arrival_deadline_utc,notes) VALUES (?,?,?,?,?,?)`).bind(id,values.activityType,values.locationId,values.reference,values.arrivalDeadlineUtc,values.notes));
  else statements.push(env.DB.prepare(`INSERT INTO reservations(trip_item_id,reservation_type,confirmation_number,window_start_utc,window_end_utc,notes) VALUES (?,?,?,?,?,?)`).bind(id,values.reservationType,values.reference,values.windowStartUtc,values.windowEndUtc,values.notes));
  for(const travelerId of travelerIds)statements.push(env.DB.prepare(`INSERT INTO trip_item_travelers(trip_item_id,traveler_id,role,created_at) VALUES (?,?,'participant',?)`).bind(id,travelerId,now));
  await env.DB.batch(statements);
  const item=await getCreatedActivity(env,tripId,id);
  if(!item)throw new HttpError(500,'BOOKING_CREATE_FAILED','The activity was not available after saving.');
  await completeManualBookingCreate(env,claim,{eventType:`${values.kind}_added`,newValue:item});
  return json({item,kind:values.kind},{status:201},request,env);
}

export async function updateActivity(request:Request,env:Env,auth:AuthContext,tripId:string,itemId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const existing=await env.DB.prepare(`SELECT ti.*,a.activity_type,a.venue_location_id,a.reservation_reference,a.arrival_deadline_utc,a.notes AS activity_notes,r.reservation_type,r.confirmation_number,r.window_start_utc,r.window_end_utc,r.notes AS reservation_notes FROM trip_items ti LEFT JOIN activities a ON a.trip_item_id=ti.id LEFT JOIN reservations r ON r.trip_item_id=ti.id WHERE ti.id=? AND ti.trip_id=? AND ti.type IN ('activity','reservation') AND ti.deleted_at IS NULL`).bind(itemId,tripId).first<Record<string,unknown>>();
  if(!existing)throw new HttpError(404,'ACTIVITY_NOT_FOUND','Activity or reservation was not found.');
  const body=await readJson<Body>(request);
  if(!Number.isSafeInteger(body.version))throw new HttpError(400,'VERSION_REQUIRED','Current entity version is required.');
  if(existing.version!==body.version)throw new HttpError(409,'VERSION_CONFLICT','Activity changed on another client.',{currentVersion:existing.version});
  const values=normalize(body,true,existing);
  if(values.kind!==existing.type)throw new HttpError(400,'KIND_IMMUTABLE','Activity kind cannot be changed after creation.');
  await ensureLocation(env,tripId,values.locationId);
  const now=nowMs();
  await env.DB.prepare(`UPDATE trip_items SET status=?,title=?,start_location_id=?,starts_at_utc=?,ends_at_utc=?,start_timezone=?,end_timezone=?,confidence=?,updated_at=?,version=version+1 WHERE id=? AND trip_id=? AND version=? AND deleted_at IS NULL`).bind(values.status,values.title,values.locationId,values.startsAtUtc,values.endsAtUtc,values.timezone,values.timezone,values.confidence,now,itemId,tripId,body.version).run();
  if(values.kind==='activity')await env.DB.prepare(`UPDATE activities SET activity_type=?,venue_location_id=?,reservation_reference=?,arrival_deadline_utc=?,notes=? WHERE trip_item_id=?`).bind(values.activityType,values.locationId,values.reference,values.arrivalDeadlineUtc,values.notes,itemId).run();
  else await env.DB.prepare(`UPDATE reservations SET reservation_type=?,confirmation_number=?,window_start_utc=?,window_end_utc=?,notes=? WHERE trip_item_id=?`).bind(values.reservationType,values.reference,values.windowStartUtc,values.windowEndUtc,values.notes,itemId).run();
  const item=await env.DB.prepare(`SELECT * FROM trip_items WHERE id=?`).bind(itemId).first();
  await recordChangeEvent(env,tripId,'trip_item',itemId,`${values.kind}_updated`,existing,item);
  return json({item},{},request,env);
}

export async function deleteActivity(request:Request,env:Env,auth:AuthContext,tripId:string,itemId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const body=await readJson<{version?:unknown}>(request);
  if(!Number.isSafeInteger(body.version))throw new HttpError(400,'VERSION_REQUIRED','Current entity version is required.');
  const now=nowMs();
  await env.DB.prepare(`UPDATE trip_items SET deleted_at=?,updated_at=?,version=version+1 WHERE id=? AND trip_id=? AND version=? AND type IN ('activity','reservation') AND deleted_at IS NULL`).bind(now,now,itemId,tripId,body.version).run();
  const row=await env.DB.prepare(`SELECT version,deleted_at FROM trip_items WHERE id=? AND trip_id=?`).bind(itemId,tripId).first<{version:number;deleted_at:number|null}>();
  if(!row?.deleted_at)throw new HttpError(409,'VERSION_CONFLICT','Activity changed on another client.');
  await env.DB.prepare(`INSERT INTO tombstones(entity_type,entity_id,version,deleted_at) VALUES('trip_item',?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET version=excluded.version,deleted_at=excluded.deleted_at`).bind(itemId,row.version,row.deleted_at).run();
  await recordChangeEvent(env,tripId,'trip_item',itemId,'activity_deleted',null,{deletedAt:row.deleted_at});
  return new Response(null,{status:204});
}

function normalize(body:Body,patch:boolean,existing:Record<string,unknown>={}){
  const kind=body.kind===undefined&&patch?existing.type as typeof kinds[number]:enumValue(body.kind,'kind',kinds,'activity');
  const title=body.title===undefined&&patch?String(existing.title):requireString(body.title,'title',160);
  const status=body.status===undefined&&patch?existing.status as typeof statuses[number]:enumValue(body.status,'status',statuses,'planned');
  const startsAtUtc=body.startsAtUtc===undefined&&patch?existing.starts_at_utc as number|null:optionalInteger(body.startsAtUtc,'startsAtUtc');
  const endsAtUtc=body.endsAtUtc===undefined&&patch?existing.ends_at_utc as number|null:optionalInteger(body.endsAtUtc,'endsAtUtc');
  if(startsAtUtc!=null&&endsAtUtc!=null&&endsAtUtc<startsAtUtc)throw new HttpError(400,'VALIDATION_ERROR','endsAtUtc cannot be before startsAtUtc.');
  const timezone=body.timezone===undefined&&patch?existing.start_timezone as string|null:optionalString(body.timezone,'timezone',80);
  const locationId=body.locationId===undefined&&patch?existing.start_location_id as string|null:optionalString(body.locationId,'locationId',80);
  return {kind,title,status,startsAtUtc,endsAtUtc,timezone,locationId,activityType:body.activityType===undefined&&patch?(existing.activity_type==null?null:String(existing.activity_type)):optionalString(body.activityType,'activityType',80),reservationType:body.reservationType===undefined&&patch?(existing.reservation_type==null?null:String(existing.reservation_type)):optionalString(body.reservationType,'reservationType',80),reference:body.reference===undefined&&patch?(kind==='activity'?(existing.reservation_reference==null?null:String(existing.reservation_reference)):(existing.confirmation_number==null?null:String(existing.confirmation_number))):optionalString(body.reference,'reference',100),arrivalDeadlineUtc:body.arrivalDeadlineUtc===undefined&&patch?(existing.arrival_deadline_utc==null?null:Number(existing.arrival_deadline_utc)):optionalInteger(body.arrivalDeadlineUtc,'arrivalDeadlineUtc'),windowStartUtc:body.windowStartUtc===undefined&&patch?(existing.window_start_utc==null?null:Number(existing.window_start_utc)):optionalInteger(body.windowStartUtc,'windowStartUtc'),windowEndUtc:body.windowEndUtc===undefined&&patch?(existing.window_end_utc==null?null:Number(existing.window_end_utc)):optionalInteger(body.windowEndUtc,'windowEndUtc'),notes:body.notes===undefined&&patch?(kind==='activity'?(existing.activity_notes==null?null:String(existing.activity_notes)):(existing.reservation_notes==null?null:String(existing.reservation_notes))):optionalString(body.notes,'notes',1000),confidence:body.confidence===undefined&&patch?existing.confidence as typeof confidences[number]:enumValue(body.confidence,'confidence',confidences,'confirmed')};
}
async function getCreatedActivity(env:Env,tripId:string,itemId:string):Promise<Record<string,unknown>|null>{return env.DB.prepare(`SELECT * FROM trip_items WHERE id=? AND trip_id=? AND type IN ('activity','reservation') AND deleted_at IS NULL`).bind(itemId,tripId).first<Record<string,unknown>>();}
async function ensureLocation(env:Env,tripId:string,id:string|null){if(!id)return;const row=await env.DB.prepare(`SELECT 1 AS ok FROM trip_locations WHERE trip_id=? AND location_id=?`).bind(tripId,id).first();if(!row)throw new HttpError(400,'LOCATION_NOT_IN_TRIP','Location does not belong to this trip.');}
async function ensureTravelers(env:Env,tripId:string,ids:string[]){for(const id of ids){const row=await env.DB.prepare(`SELECT 1 AS ok FROM travelers WHERE trip_id=? AND id=? AND deleted_at IS NULL`).bind(tripId,id).first();if(!row)throw new HttpError(400,'TRAVELER_NOT_IN_TRIP','Traveler does not belong to this trip.');}}
function arrayOfIds(value:unknown):string[]{if(value==null)return[];if(!Array.isArray(value)||value.length>20||value.some((entry)=>typeof entry!=='string'||!entry))throw new HttpError(400,'VALIDATION_ERROR','travelerIds must be an array of IDs.');return [...new Set(value as string[])];}
