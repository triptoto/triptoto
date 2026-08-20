import type { AuthContext, Env } from '../types.ts';
import { HttpError, enumValue, json, nowMs, optionalInteger, optionalString, readJson, requireString, uuid } from '../http.ts';
import { requireTripAccess } from '../access.ts';

const operationTypes=['create','update','delete'] as const;
interface AckBody{lastChangeCreatedAt?:unknown;lastChangeId?:unknown;pendingLocalOperations?:unknown;}
interface OperationBody{idempotencyKey?:unknown;entityType?:unknown;entityId?:unknown;operationType?:unknown;baseVersion?:unknown;payload?:unknown;}

export async function syncStatus(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId);
  const cursor=await env.DB.prepare(`SELECT * FROM trip_sync_cursors WHERE device_id=? AND trip_id=?`).bind(auth.deviceId,tripId).first();
  const counts=await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM sync_operations so JOIN sync_idempotency si ON si.operation_id=so.id WHERE so.device_id=? AND si.trip_id=? AND so.status IN ('pending','sending','failed_retryable','conflict')) pending,(SELECT COUNT(*) FROM sync_conflicts sc JOIN sync_operations so ON so.id=sc.operation_id JOIN sync_idempotency si ON si.operation_id=so.id WHERE so.device_id=? AND si.trip_id=? AND sc.status='open') conflicts`).bind(auth.deviceId,tripId,auth.deviceId,tripId).first<{pending:number;conflicts:number}>();
  return json({sync:{cursor:cursor??null,pendingOperations:Number(counts?.pending??0),openConflicts:Number(counts?.conflicts??0),safeMode:true,note:'Generic mutations remain queued until an entity-specific conflict handler can apply them safely.'}},{},request,env);
}

export async function syncChanges(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId);
  const url=new URL(request.url);
  const sinceRaw=Number(url.searchParams.get('sinceCreatedAt')??'0');
  const since=Number.isSafeInteger(sinceRaw)&&sinceRaw>=0?sinceRaw:0;
  const afterId=url.searchParams.get('afterId')??'';
  const limitRaw=Number(url.searchParams.get('limit')??'100');
  const limit=Math.max(1,Math.min(200,Number.isSafeInteger(limitRaw)?limitRaw:100));
  const changes=(await env.DB.prepare(`SELECT id,entity_type,entity_id,event_type,source_type,source_id,created_at FROM change_events WHERE trip_id=? AND (created_at>? OR (created_at=? AND id>?)) ORDER BY created_at,id LIMIT ?`).bind(tripId,since,since,afterId,limit).all()).results??[];
  const tombstones=(await env.DB.prepare(`SELECT t.entity_type,t.entity_id,t.version,t.deleted_at FROM tombstones t WHERE t.deleted_at>? AND (EXISTS(SELECT 1 FROM trip_items i WHERE i.id=t.entity_id AND i.trip_id=?) OR EXISTS(SELECT 1 FROM travelers tr WHERE tr.id=t.entity_id AND tr.trip_id=?) OR EXISTS(SELECT 1 FROM journey_groups j WHERE j.id=t.entity_id AND j.trip_id=?) OR EXISTS(SELECT 1 FROM trip_contacts c WHERE c.id=t.entity_id AND c.trip_id=?) OR EXISTS(SELECT 1 FROM trip_time_markers tm WHERE tm.id=t.entity_id AND tm.trip_id=?)) ORDER BY t.deleted_at,t.entity_id LIMIT ?`).bind(since,tripId,tripId,tripId,tripId,tripId,limit).all()).results??[];
  const last=changes.length?changes[changes.length-1] as Record<string,unknown>:null;
  return json({changes,tombstones,nextCursor:last?{createdAt:Number(last.created_at),id:String(last.id)}:{createdAt:since,id:afterId},hasMore:changes.length===limit},{},request,env);
}

export async function acknowledgeSync(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const body=await readJson<AckBody>(request);
  const createdAt=optionalInteger(body.lastChangeCreatedAt,'lastChangeCreatedAt');
  const lastId=optionalString(body.lastChangeId,'lastChangeId',80);
  const pending=optionalInteger(body.pendingLocalOperations,'pendingLocalOperations')??0;
  if(pending<0||pending>10000)throw new HttpError(400,'VALIDATION_ERROR','pendingLocalOperations is invalid.');
  const now=nowMs();
  await env.DB.prepare(`INSERT INTO trip_sync_cursors(device_id,trip_id,last_change_created_at,last_change_id,acknowledged_at,pending_local_operations,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(device_id,trip_id) DO UPDATE SET last_change_created_at=excluded.last_change_created_at,last_change_id=excluded.last_change_id,acknowledged_at=excluded.acknowledged_at,pending_local_operations=excluded.pending_local_operations,updated_at=excluded.updated_at`).bind(auth.deviceId,tripId,createdAt,lastId,now,pending,now).run();
  const cursor=await env.DB.prepare(`SELECT * FROM trip_sync_cursors WHERE device_id=? AND trip_id=?`).bind(auth.deviceId,tripId).first();
  return json({cursor},{},request,env);
}

export async function queueSyncOperation(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId,true);
  const body=await readJson<OperationBody>(request,64*1024);
  const key=requireString(body.idempotencyKey,'idempotencyKey',120);
  const existing=await env.DB.prepare(`SELECT response_json FROM sync_idempotency WHERE idempotency_key=? AND device_id=? AND trip_id=? AND expires_at>?`).bind(key,auth.deviceId,tripId,nowMs()).first<{response_json:string|null}>();
  if(existing?.response_json)return json(JSON.parse(existing.response_json),{},request,env);
  const entityType=requireString(body.entityType,'entityType',80);
  const entityId=requireString(body.entityId,'entityId',100);
  const operationType=enumValue(body.operationType,'operationType',operationTypes);
  const baseVersion=optionalInteger(body.baseVersion,'baseVersion');
  const payload=body.payload??{};
  const payloadJson=JSON.stringify(payload);
  if(new TextEncoder().encode(payloadJson).byteLength>64*1024)throw new HttpError(413,'OPERATION_TOO_LARGE','Sync operation payload exceeds 64 KiB.');
  const operationId=uuid(),now=nowMs();
  const response={operation:{id:operationId,status:'pending',safeMode:true,entityType,entityId,operationType,baseVersion,note:'Operation is queued. Automatic generic mutation application is intentionally disabled.'}};
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO sync_operations(id,user_id,device_id,entity_type,entity_id,operation_type,base_version,payload_json,status,created_at) VALUES (?,?,?,?,?,?,?,?, 'pending',?)`).bind(operationId,auth.userId??null,auth.deviceId,entityType,entityId,operationType,baseVersion,payloadJson,now),
    env.DB.prepare(`INSERT INTO sync_idempotency(idempotency_key,device_id,trip_id,operation_id,response_json,created_at,expires_at) VALUES (?,?,?,?,?,?,?)`).bind(key,auth.deviceId,tripId,operationId,JSON.stringify(response),now,now+24*60*60*1000),
  ]);
  return json(response,{status:202},request,env);
}

export async function listSyncConflicts(request:Request,env:Env,auth:AuthContext,tripId:string):Promise<Response>{
  await requireTripAccess(env,auth,tripId);
  const conflicts=(await env.DB.prepare(`SELECT sc.* FROM sync_conflicts sc JOIN sync_operations so ON so.id=sc.operation_id JOIN sync_idempotency si ON si.operation_id=so.id WHERE so.device_id=? AND si.trip_id=? AND sc.status='open' ORDER BY sc.created_at DESC LIMIT 100`).bind(auth.deviceId,tripId).all()).results??[];
  return json({conflicts},{},request,env);
}
