import type { AuthContext, Env } from '../types.ts';
import { HttpError, enumValue, json, nowMs, optionalInteger, optionalString, readJson, requireString, uuid } from '../http.ts';
import { requireTripAccess } from '../access.ts';
import { recordChangeEvent } from '../change-events.ts';

// Planning collections reuse a `trip_items` row (type='custom') as their parent
// so they inherit timeline placement, the sync quartet, versioning, collaboration
// and offline caching. A 1:1 `planning_collections` subtype row marks the custom
// item as a collection and holds planning metadata. Child stops live in
// `planning_stops` and are never trip_items, so they can never surface as
// top-level timeline rows (the no-duplicate rule is structural).

const collectionTypes = ['neighborhood','day_trip','walking_route','places_to_visit','food_and_drink','shopping'] as const;
const itemStatuses = ['planned','confirmed','completed','cancelled','skipped','unknown'] as const;
const stopStatuses = ['planned','visited','skipped'] as const;
const placeTypes = ['cafe','restaurant','attraction','museum','shop','market','park','activity','viewpoint','monument','street','other'] as const;

interface CollectionBody {
  title?:unknown; collectionType?:unknown; status?:unknown; city?:unknown; centralLocationId?:unknown; notes?:unknown;
  startsAtUtc?:unknown; endsAtUtc?:unknown; startLocalDatetime?:unknown; endLocalDatetime?:unknown; timezone?:unknown; version?:unknown;
}
interface StopBody {
  title?:unknown; scheduledTime?:unknown; timezone?:unknown; position?:unknown; locationId?:unknown;
  addressSnapshot?:unknown; placeType?:unknown; notes?:unknown; linkedTripItemId?:unknown; status?:unknown; version?:unknown;
}

const COLLECTION_SELECT = `SELECT ti.*, pc.collection_type, pc.city, pc.central_location_id, pc.notes AS collection_notes, pc.created_by_user_id FROM trip_items ti JOIN planning_collections pc ON pc.trip_item_id=ti.id`;

async function ensureLocation(env:Env,tripId:string,id:string|null){
  if(!id)return;
  const row=await env.DB.prepare(`SELECT 1 AS ok FROM trip_locations WHERE trip_id=? AND location_id=?`).bind(tripId,id).first();
  if(!row)throw new HttpError(400,'LOCATION_NOT_IN_TRIP','Location does not belong to this trip.');
}
async function ensureLinkedItem(env:Env,tripId:string,id:string|null){
  if(!id)return;
  const row=await env.DB.prepare(`SELECT 1 AS ok FROM trip_items WHERE id=? AND trip_id=? AND deleted_at IS NULL`).bind(id,tripId).first();
  if(!row)throw new HttpError(400,'ITEM_NOT_IN_TRIP','Linked booking does not belong to this trip.',{itemId:id});
}
async function getCollection(env:Env,tripId:string,itemId:string):Promise<Record<string,unknown>|null>{
  return env.DB.prepare(`${COLLECTION_SELECT} WHERE ti.id=? AND ti.trip_id=? AND ti.deleted_at IS NULL`).bind(itemId,tripId).first<Record<string,unknown>>();
}
async function loadCollectionStops(env:Env,itemId:string):Promise<Record<string,unknown>[]>{
  return (await env.DB.prepare(`SELECT * FROM planning_stops WHERE collection_item_id=? AND deleted_at IS NULL ORDER BY position, created_at`).bind(itemId).all()).results ?? [];
}

export async function listCollections(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId);
  const collections=(await env.DB.prepare(`${COLLECTION_SELECT} WHERE ti.trip_id=? AND ti.deleted_at IS NULL ORDER BY CASE WHEN ti.starts_at_utc IS NULL THEN 1 ELSE 0 END, ti.starts_at_utc, ti.created_at`).bind(tripId).all()).results ?? [];
  const stops=(await env.DB.prepare(`SELECT ps.* FROM planning_stops ps JOIN planning_collections pc ON pc.trip_item_id=ps.collection_item_id JOIN trip_items ti ON ti.id=pc.trip_item_id WHERE ti.trip_id=? AND ti.deleted_at IS NULL AND ps.deleted_at IS NULL ORDER BY ps.collection_item_id, ps.position, ps.created_at`).bind(tripId).all()).results ?? [];
  return json({collections,stops},{},request,env);
}

export async function createCollection(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const body=await readJson<CollectionBody>(request);
  const title=requireString(body.title,'title',160);
  const collectionType=enumValue(body.collectionType,'collectionType',collectionTypes);
  const status=enumValue(body.status,'status',itemStatuses,'planned');
  const city=optionalString(body.city,'city',120);
  const centralLocationId=optionalString(body.centralLocationId,'centralLocationId',80);
  const notes=optionalString(body.notes,'notes',2000);
  const startsAtUtc=optionalInteger(body.startsAtUtc,'startsAtUtc');
  const endsAtUtc=optionalInteger(body.endsAtUtc,'endsAtUtc');
  if(startsAtUtc!=null&&endsAtUtc!=null&&endsAtUtc<startsAtUtc)throw new HttpError(400,'VALIDATION_ERROR','endsAtUtc cannot be before startsAtUtc.');
  const startLocal=optionalString(body.startLocalDatetime,'startLocalDatetime',40);
  const endLocal=optionalString(body.endLocalDatetime,'endLocalDatetime',40);
  const timezone=optionalString(body.timezone,'timezone',80);
  await ensureLocation(env,tripId,centralLocationId);
  const id=uuid(),now=nowMs();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO trip_items(id,trip_id,type,status,title,start_location_id,starts_at_utc,ends_at_utc,start_local_datetime,end_local_datetime,start_timezone,end_timezone,source_type,confidence,created_at,updated_at,version) VALUES (?,?,'custom',?,?,?,?,?,?,?,?,?,'manual','confirmed',?,?,1)`)
      .bind(id,tripId,status,title,centralLocationId,startsAtUtc,endsAtUtc,startLocal,endLocal,timezone,timezone,now,now),
    env.DB.prepare(`INSERT INTO planning_collections(trip_item_id,collection_type,city,central_location_id,notes,created_by_user_id) VALUES (?,?,?,?,?,?)`)
      .bind(id,collectionType,city,centralLocationId,notes,auth.userId??null),
  ]);
  const collection=await getCollection(env,tripId,id);
  if(!collection)throw new HttpError(500,'COLLECTION_CREATE_FAILED','The collection was not available after saving.');
  await recordChangeEvent(env,tripId,'planning_collection',id,'collection_created',null,collection,'manual',null,auth);
  return json({collection,stops:[]},{status:201},request,env);
}

export async function updateCollection(request:Request,env:Env,auth:AuthContext,tripId:string,itemId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const existing=await getCollection(env,tripId,itemId);
  if(!existing)throw new HttpError(404,'COLLECTION_NOT_FOUND','Collection was not found.');
  const body=await readJson<CollectionBody>(request);
  if(!Number.isSafeInteger(body.version))throw new HttpError(400,'VERSION_REQUIRED','Current entity version is required.');
  if(existing.version!==body.version)throw new HttpError(409,'VERSION_CONFLICT','Collection changed on another client.',{currentVersion:existing.version});
  if(body.collectionType!==undefined&&enumValue(body.collectionType,'collectionType',collectionTypes)!==existing.collection_type)throw new HttpError(400,'TYPE_IMMUTABLE','Collection type cannot be changed after creation.');
  const title=body.title===undefined?String(existing.title):requireString(body.title,'title',160);
  const status=body.status===undefined?existing.status as typeof itemStatuses[number]:enumValue(body.status,'status',itemStatuses);
  const city=body.city===undefined?existing.city as string|null:optionalString(body.city,'city',120);
  const centralLocationId=body.centralLocationId===undefined?existing.central_location_id as string|null:optionalString(body.centralLocationId,'centralLocationId',80);
  const notes=body.notes===undefined?existing.collection_notes as string|null:optionalString(body.notes,'notes',2000);
  const startsAtUtc=body.startsAtUtc===undefined?existing.starts_at_utc as number|null:optionalInteger(body.startsAtUtc,'startsAtUtc');
  const endsAtUtc=body.endsAtUtc===undefined?existing.ends_at_utc as number|null:optionalInteger(body.endsAtUtc,'endsAtUtc');
  if(startsAtUtc!=null&&endsAtUtc!=null&&endsAtUtc<startsAtUtc)throw new HttpError(400,'VALIDATION_ERROR','endsAtUtc cannot be before startsAtUtc.');
  const startLocal=body.startLocalDatetime===undefined?existing.start_local_datetime as string|null:optionalString(body.startLocalDatetime,'startLocalDatetime',40);
  const endLocal=body.endLocalDatetime===undefined?existing.end_local_datetime as string|null:optionalString(body.endLocalDatetime,'endLocalDatetime',40);
  const timezone=body.timezone===undefined?existing.start_timezone as string|null:optionalString(body.timezone,'timezone',80);
  await ensureLocation(env,tripId,centralLocationId);
  const now=nowMs();
  await env.DB.batch([
    env.DB.prepare(`UPDATE trip_items SET status=?,title=?,start_location_id=?,starts_at_utc=?,ends_at_utc=?,start_local_datetime=?,end_local_datetime=?,start_timezone=?,end_timezone=?,updated_at=?,version=version+1 WHERE id=? AND trip_id=? AND version=? AND deleted_at IS NULL`)
      .bind(status,title,centralLocationId,startsAtUtc,endsAtUtc,startLocal,endLocal,timezone,timezone,now,itemId,tripId,body.version),
    env.DB.prepare(`UPDATE planning_collections SET city=?,central_location_id=?,notes=? WHERE trip_item_id=?`).bind(city,centralLocationId,notes,itemId),
  ]);
  const collection=await getCollection(env,tripId,itemId);
  if(collection?.version===existing.version)throw new HttpError(409,'VERSION_CONFLICT','Collection changed on another client.',{currentVersion:existing.version});
  await recordChangeEvent(env,tripId,'planning_collection',itemId,'collection_updated',existing,collection,'manual',null,auth);
  return json({collection,stops:await loadCollectionStops(env,itemId)},{},request,env);
}

export async function deleteCollection(request:Request,env:Env,auth:AuthContext,tripId:string,itemId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const existing=await getCollection(env,tripId,itemId);
  if(!existing)throw new HttpError(404,'COLLECTION_NOT_FOUND','Collection was not found.');
  const body=await readJson<{version?:unknown}>(request);
  if(!Number.isSafeInteger(body.version))throw new HttpError(400,'VERSION_REQUIRED','Current entity version is required.');
  const now=nowMs();
  // Soft-delete the parent only. Linked bookings (planning_stops.linked_trip_item_id)
  // are never touched — the relationship simply stops rendering.
  await env.DB.prepare(`UPDATE trip_items SET deleted_at=?,updated_at=?,version=version+1 WHERE id=? AND trip_id=? AND version=? AND deleted_at IS NULL`).bind(now,now,itemId,tripId,body.version).run();
  const row=await env.DB.prepare(`SELECT version,deleted_at FROM trip_items WHERE id=? AND trip_id=?`).bind(itemId,tripId).first<{version:number;deleted_at:number|null}>();
  if(!row?.deleted_at)throw new HttpError(409,'VERSION_CONFLICT','Collection changed on another client.');
  await env.DB.prepare(`UPDATE planning_stops SET deleted_at=?,updated_at=?,version=version+1 WHERE collection_item_id=? AND deleted_at IS NULL`).bind(now,now,itemId).run();
  await env.DB.prepare(`INSERT INTO tombstones(entity_type,entity_id,version,deleted_at) VALUES('trip_item',?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET version=excluded.version,deleted_at=excluded.deleted_at`).bind(itemId,row.version,row.deleted_at).run();
  await recordChangeEvent(env,tripId,'planning_collection',itemId,'collection_deleted',null,{deletedAt:row.deleted_at},'manual',null,auth);
  return new Response(null,{status:204});
}

function normalizeStop(body:StopBody,patch:boolean,existing:Record<string,unknown>={}){
  const title=body.title===undefined&&patch?String(existing.title):requireString(body.title,'title',160);
  const scheduledTime=body.scheduledTime===undefined&&patch?existing.scheduled_time as string|null:optionalString(body.scheduledTime,'scheduledTime',10);
  const timezone=body.timezone===undefined&&patch?existing.timezone as string|null:optionalString(body.timezone,'timezone',80);
  const position=body.position===undefined&&patch?Number(existing.position):optionalInteger(body.position,'position')??0;
  const locationId=body.locationId===undefined&&patch?existing.location_id as string|null:optionalString(body.locationId,'locationId',80);
  const addressSnapshot=body.addressSnapshot===undefined&&patch?existing.address_snapshot as string|null:optionalString(body.addressSnapshot,'addressSnapshot',300);
  const placeType=body.placeType===undefined&&patch?(existing.place_type==null?null:existing.place_type as typeof placeTypes[number]):(body.placeType==null||body.placeType===''?null:enumValue(body.placeType,'placeType',placeTypes));
  const notes=body.notes===undefined&&patch?existing.notes as string|null:optionalString(body.notes,'notes',1000);
  const linkedTripItemId=body.linkedTripItemId===undefined&&patch?existing.linked_trip_item_id as string|null:optionalString(body.linkedTripItemId,'linkedTripItemId',80);
  const status=body.status===undefined&&patch?existing.status as typeof stopStatuses[number]:enumValue(body.status,'status',stopStatuses,'planned');
  return {title,scheduledTime,timezone,position,locationId,addressSnapshot,placeType,notes,linkedTripItemId,status};
}

export async function addStop(request:Request,env:Env,auth:AuthContext,tripId:string,itemId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const collection=await getCollection(env,tripId,itemId);
  if(!collection)throw new HttpError(404,'COLLECTION_NOT_FOUND','Collection was not found.');
  const body=await readJson<StopBody>(request);
  const values=normalizeStop(body,false);
  await ensureLocation(env,tripId,values.locationId);
  await ensureLinkedItem(env,tripId,values.linkedTripItemId);
  // Default new stops to the end of the current order.
  let position=values.position;
  if(body.position===undefined){
    const max=await env.DB.prepare(`SELECT COALESCE(MAX(position),-1) AS m FROM planning_stops WHERE collection_item_id=? AND deleted_at IS NULL`).bind(itemId).first<{m:number}>();
    position=(max?.m??-1)+1;
  }
  const id=uuid(),now=nowMs();
  await env.DB.prepare(`INSERT INTO planning_stops(id,collection_item_id,title,scheduled_time,timezone,position,location_id,address_snapshot,place_type,notes,linked_trip_item_id,status,created_by_user_id,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`)
    .bind(id,itemId,values.title,values.scheduledTime,values.timezone,position,values.locationId,values.addressSnapshot,values.placeType,values.notes,values.linkedTripItemId,values.status,auth.userId??null,now,now).run();
  const stop=await env.DB.prepare(`SELECT * FROM planning_stops WHERE id=?`).bind(id).first();
  await touchCollection(env,itemId,now);
  await recordChangeEvent(env,tripId,'planning_stop',id,'stop_added',null,stop,'manual',null,auth);
  return json({stop},{status:201},request,env);
}

export async function updateStop(request:Request,env:Env,auth:AuthContext,tripId:string,itemId:string,stopId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const existing=await env.DB.prepare(`SELECT ps.* FROM planning_stops ps JOIN trip_items ti ON ti.id=ps.collection_item_id WHERE ps.id=? AND ps.collection_item_id=? AND ti.trip_id=? AND ps.deleted_at IS NULL AND ti.deleted_at IS NULL`).bind(stopId,itemId,tripId).first<Record<string,unknown>>();
  if(!existing)throw new HttpError(404,'STOP_NOT_FOUND','Place was not found.');
  const body=await readJson<StopBody>(request);
  if(!Number.isSafeInteger(body.version))throw new HttpError(400,'VERSION_REQUIRED','Current entity version is required.');
  if(existing.version!==body.version)throw new HttpError(409,'VERSION_CONFLICT','This place changed on another client.',{currentVersion:existing.version});
  const values=normalizeStop(body,true,existing);
  await ensureLocation(env,tripId,values.locationId);
  await ensureLinkedItem(env,tripId,values.linkedTripItemId);
  const now=nowMs();
  await env.DB.prepare(`UPDATE planning_stops SET title=?,scheduled_time=?,timezone=?,position=?,location_id=?,address_snapshot=?,place_type=?,notes=?,linked_trip_item_id=?,status=?,updated_at=?,version=version+1 WHERE id=? AND collection_item_id=? AND version=? AND deleted_at IS NULL`)
    .bind(values.title,values.scheduledTime,values.timezone,values.position,values.locationId,values.addressSnapshot,values.placeType,values.notes,values.linkedTripItemId,values.status,now,stopId,itemId,body.version).run();
  const stop=await env.DB.prepare(`SELECT * FROM planning_stops WHERE id=?`).bind(stopId).first<Record<string,unknown>>();
  if(stop?.version===existing.version)throw new HttpError(409,'VERSION_CONFLICT','This place changed on another client.',{currentVersion:existing.version});
  await touchCollection(env,itemId,now);
  await recordChangeEvent(env,tripId,'planning_stop',stopId,'stop_updated',existing,stop,'manual',null,auth);
  return json({stop},{},request,env);
}

export async function deleteStop(request:Request,env:Env,auth:AuthContext,tripId:string,itemId:string,stopId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const existing=await env.DB.prepare(`SELECT ps.version FROM planning_stops ps JOIN trip_items ti ON ti.id=ps.collection_item_id WHERE ps.id=? AND ps.collection_item_id=? AND ti.trip_id=? AND ps.deleted_at IS NULL`).bind(stopId,itemId,tripId).first<{version:number}>();
  if(!existing)throw new HttpError(404,'STOP_NOT_FOUND','Place was not found.');
  const body=await readJson<{version?:unknown}>(request);
  if(!Number.isSafeInteger(body.version))throw new HttpError(400,'VERSION_REQUIRED','Current entity version is required.');
  const now=nowMs();
  await env.DB.prepare(`UPDATE planning_stops SET deleted_at=?,updated_at=?,version=version+1 WHERE id=? AND collection_item_id=? AND version=? AND deleted_at IS NULL`).bind(now,now,stopId,itemId,body.version).run();
  const row=await env.DB.prepare(`SELECT version,deleted_at FROM planning_stops WHERE id=?`).bind(stopId).first<{version:number;deleted_at:number|null}>();
  if(!row?.deleted_at)throw new HttpError(409,'VERSION_CONFLICT','This place changed on another client.');
  await touchCollection(env,itemId,now);
  await recordChangeEvent(env,tripId,'planning_stop',stopId,'stop_deleted',null,{deletedAt:row.deleted_at},'manual',null,auth);
  return new Response(null,{status:204});
}

export async function reorderStops(request:Request,env:Env,auth:AuthContext,tripId:string,itemId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const collection=await getCollection(env,tripId,itemId);
  if(!collection)throw new HttpError(404,'COLLECTION_NOT_FOUND','Collection was not found.');
  const body=await readJson<{order?:unknown}>(request);
  if(!Array.isArray(body.order)||body.order.length>200)throw new HttpError(400,'VALIDATION_ERROR','order must be an array of at most 200 stop ids.');
  const ids=body.order.map((v,i)=>{if(typeof v!=='string'||!v)throw new HttpError(400,'VALIDATION_ERROR',`order[${i}] must be a stop id.`);return v;});
  const existing=(await env.DB.prepare(`SELECT id FROM planning_stops WHERE collection_item_id=? AND deleted_at IS NULL`).bind(itemId).all()).results as {id:string}[] ?? [];
  const known=new Set(existing.map(r=>r.id));
  for(const id of ids)if(!known.has(id))throw new HttpError(400,'STOP_NOT_IN_COLLECTION','A stop in the new order does not belong to this collection.',{stopId:id});
  const now=nowMs();
  const statements=ids.map((id,index)=>env.DB.prepare(`UPDATE planning_stops SET position=?,updated_at=?,version=version+1 WHERE id=? AND collection_item_id=? AND deleted_at IS NULL`).bind(index,now,id,itemId));
  if(statements.length)await env.DB.batch(statements);
  await touchCollection(env,itemId,now);
  await recordChangeEvent(env,tripId,'planning_collection',itemId,'stops_reordered',null,{order:ids},'manual',null,auth);
  return json({stops:await loadCollectionStops(env,itemId)},{},request,env);
}

// Bump the parent's updated_at so sync cursors and "last changed" ordering pick
// up stop-level edits, without inflating the collection version (stops carry
// their own version for conflict handling).
async function touchCollection(env:Env,itemId:string,now:number){
  await env.DB.prepare(`UPDATE trip_items SET updated_at=? WHERE id=? AND deleted_at IS NULL`).bind(now,itemId).run();
}
