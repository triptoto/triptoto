import type { AuthContext, Env } from '../types.ts';
import { HttpError, enumValue, json, nowMs, optionalInteger, readJson, requireString, uuid } from '../http.ts';
import { requireTripAccess } from '../access.ts';
import { recordChangeEvent } from '../change-events.ts';
import { validateJourney, type JourneyRole, type JourneyType } from '../../../../packages/journeys/src/index.ts';

const journeyTypes = ['one_way','round_trip','multi_city','open_jaw','road_trip','single_city','mixed'] as const;
const statuses = ['planned','confirmed','completed','cancelled'] as const;
const roles = ['outbound','return','stopover','stay','transfer','activity','other'] as const;

interface JourneyBody { title?:unknown; journeyType?:unknown; status?:unknown; sequenceNo?:unknown; version?:unknown; }
interface JourneyItemInput { itemId?:unknown; sequenceNo?:unknown; semanticRole?:unknown; }

export async function listJourneys(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId);
  const groups=(await env.DB.prepare(`SELECT * FROM journey_groups WHERE trip_id=? AND deleted_at IS NULL ORDER BY sequence_no,created_at`).bind(tripId).all()).results??[];
  const items=(await env.DB.prepare(`SELECT jgi.*,ti.title,ti.type,ti.status,ti.starts_at_utc,ti.ends_at_utc FROM journey_group_items jgi JOIN journey_groups jg ON jg.id=jgi.journey_group_id JOIN trip_items ti ON ti.id=jgi.trip_item_id WHERE jg.trip_id=? AND jg.deleted_at IS NULL AND ti.deleted_at IS NULL ORDER BY jgi.journey_group_id,jgi.sequence_no`).bind(tripId).all()).results??[];
  return json({journeys:groups,items},{},request,env);
}

export async function createJourney(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const body=await readJson<JourneyBody>(request);
  const title=requireString(body.title,'title',160);
  const type=enumValue(body.journeyType,'journeyType',journeyTypes,'mixed');
  const status=enumValue(body.status,'status',statuses,'planned');
  const sequence=optionalInteger(body.sequenceNo,'sequenceNo')??0;
  const id=uuid(),now=nowMs();
  await env.DB.prepare(`INSERT INTO journey_groups(id,trip_id,title,journey_type,status,sequence_no,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,1)`).bind(id,tripId,title,type,status,sequence,now,now).run();
  const journey=await env.DB.prepare(`SELECT * FROM journey_groups WHERE id=?`).bind(id).first();
  await recordChangeEvent(env,tripId,'journey_group',id,'journey_created',null,journey);
  return json({journey},{status:201},request,env);
}

export async function updateJourney(request:Request,env:Env,auth:AuthContext,tripId:string,journeyId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const existing=await env.DB.prepare(`SELECT * FROM journey_groups WHERE id=? AND trip_id=? AND deleted_at IS NULL`).bind(journeyId,tripId).first<Record<string,unknown>>();
  if(!existing)throw new HttpError(404,'JOURNEY_NOT_FOUND','Journey was not found.');
  const body=await readJson<JourneyBody>(request);
  if(!Number.isSafeInteger(body.version))throw new HttpError(400,'VERSION_REQUIRED','Current entity version is required.');
  if(existing.version!==body.version)throw new HttpError(409,'VERSION_CONFLICT','Journey changed on another client.',{currentVersion:existing.version});
  const title=body.title===undefined?String(existing.title):requireString(body.title,'title',160);
  const type=body.journeyType===undefined?existing.journey_type as JourneyType:enumValue(body.journeyType,'journeyType',journeyTypes);
  const status=body.status===undefined?existing.status as typeof statuses[number]:enumValue(body.status,'status',statuses);
  const sequence=body.sequenceNo===undefined?Number(existing.sequence_no):optionalInteger(body.sequenceNo,'sequenceNo')??0;
  const now=nowMs();
  await env.DB.prepare(`UPDATE journey_groups SET title=?,journey_type=?,status=?,sequence_no=?,updated_at=?,version=version+1 WHERE id=? AND trip_id=? AND version=? AND deleted_at IS NULL`).bind(title,type,status,sequence,now,journeyId,tripId,body.version).run();
  const journey=await env.DB.prepare(`SELECT * FROM journey_groups WHERE id=?`).bind(journeyId).first();
  await recordChangeEvent(env,tripId,'journey_group',journeyId,'journey_updated',existing,journey);
  return json({journey},{},request,env);
}

export async function replaceJourneyItems(request:Request,env:Env,auth:AuthContext,tripId:string,journeyId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const journey=await env.DB.prepare(`SELECT * FROM journey_groups WHERE id=? AND trip_id=? AND deleted_at IS NULL`).bind(journeyId,tripId).first<Record<string,unknown>>();
  if(!journey)throw new HttpError(404,'JOURNEY_NOT_FOUND','Journey was not found.');
  const body=await readJson<{items?:unknown}>(request);
  if(!Array.isArray(body.items)||body.items.length>100)throw new HttpError(400,'VALIDATION_ERROR','items must be an array with at most 100 entries.');
  const normalized:{itemId:string;sequenceNo:number;semanticRole:JourneyRole;startsAtUtc?:number;endsAtUtc?:number}[]=[];
  for(const raw of body.items as JourneyItemInput[]){
    const itemId=requireString(raw.itemId,'itemId',80);
    const sequenceNo=optionalInteger(raw.sequenceNo,'sequenceNo')??normalized.length;
    const semanticRole=enumValue(raw.semanticRole,'semanticRole',roles,'other');
    const item=await env.DB.prepare(`SELECT starts_at_utc,ends_at_utc FROM trip_items WHERE id=? AND trip_id=? AND deleted_at IS NULL`).bind(itemId,tripId).first<{starts_at_utc:number|null;ends_at_utc:number|null}>();
    if(!item)throw new HttpError(400,'ITEM_NOT_IN_TRIP','Journey item does not belong to this trip.',{itemId});
    normalized.push({itemId,sequenceNo,semanticRole,startsAtUtc:item.starts_at_utc??undefined,endsAtUtc:item.ends_at_utc??undefined});
  }
  const validation=validateJourney(journey.journey_type as JourneyType,normalized);
  const now=nowMs();
  const statements=[env.DB.prepare(`DELETE FROM journey_group_items WHERE journey_group_id=?`).bind(journeyId)];
  for(const item of normalized)statements.push(env.DB.prepare(`INSERT INTO journey_group_items(journey_group_id,trip_item_id,sequence_no,semantic_role,created_at) VALUES (?,?,?,?,?)`).bind(journeyId,item.itemId,item.sequenceNo,item.semanticRole,now));
  await env.DB.batch(statements);
  await recordChangeEvent(env,tripId,'journey_group',journeyId,'journey_items_replaced',null,{items:normalized,validation});
  return json({items:normalized,validation},{},request,env);
}

export async function deleteJourney(request:Request,env:Env,auth:AuthContext,tripId:string,journeyId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const body=await readJson<{version?:unknown}>(request);
  if(!Number.isSafeInteger(body.version))throw new HttpError(400,'VERSION_REQUIRED','Current entity version is required.');
  const now=nowMs();
  await env.DB.prepare(`UPDATE journey_groups SET deleted_at=?,updated_at=?,version=version+1 WHERE id=? AND trip_id=? AND version=? AND deleted_at IS NULL`).bind(now,now,journeyId,tripId,body.version).run();
  const row=await env.DB.prepare(`SELECT version,deleted_at FROM journey_groups WHERE id=? AND trip_id=?`).bind(journeyId,tripId).first<{version:number;deleted_at:number|null}>();
  if(!row?.deleted_at)throw new HttpError(409,'VERSION_CONFLICT','Journey changed on another client.');
  await env.DB.prepare(`INSERT INTO tombstones(entity_type,entity_id,version,deleted_at) VALUES('journey_group',?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET version=excluded.version,deleted_at=excluded.deleted_at`).bind(journeyId,row.version,row.deleted_at).run();
  await recordChangeEvent(env,tripId,'journey_group',journeyId,'journey_deleted',null,{deletedAt:row.deleted_at});
  return new Response(null,{status:204});
}
