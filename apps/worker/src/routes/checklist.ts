import type { AuthContext, Env } from '../types.ts';
import { HttpError, enumValue, json, nowMs, optionalInteger, readJson, requireString, uuid } from '../http.ts';
import { requireTripAccess } from '../access.ts';
import { seedChecklist } from '../../../../packages/checklists/src/index.ts';

const categories = ['documents','before_you_leave','packing','custom'] as const;
const priorities = ['critical','high','medium','low'] as const;

export async function listChecklist(request: Request, env: Env, auth: AuthContext, tripId: string): Promise<Response> {
  await requireTripAccess(env, auth, tripId);
  const result = await env.DB.prepare(`SELECT * FROM trip_checklist_items WHERE trip_id=? AND deleted_at IS NULL ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, completed_at IS NOT NULL, created_at`).bind(tripId).all();
  return json({ items: result.results ?? [] }, {}, request, env);
}

export async function createChecklistItem(request: Request, env: Env, auth: AuthContext, tripId: string): Promise<Response> {
  await requireTripAccess(env, auth, tripId, true);
  const body = await readJson<{title?:unknown;category?:unknown;priority?:unknown;dueAtUtc?:unknown}>(request);
  const id=uuid(), now=nowMs();
  await env.DB.prepare(`INSERT INTO trip_checklist_items(id,trip_id,title,category,priority,due_at_utc,completion_source,reminder_enabled,created_at,updated_at,version) VALUES(?,?,?,?,?,?,'none',0,?,?,1)`)
    .bind(id,tripId,requireString(body.title,'title',160),enumValue(body.category,'category',categories,'custom'),enumValue(body.priority,'priority',priorities,'medium'),optionalInteger(body.dueAtUtc,'dueAtUtc'),now,now).run();
  return json({item:await env.DB.prepare('SELECT * FROM trip_checklist_items WHERE id=?').bind(id).first()},{status:201},request,env);
}

export async function seedTripChecklist(request: Request, env: Env, auth: AuthContext, tripId: string): Promise<Response> {
  await requireTripAccess(env, auth, tripId, true);
  const body = await readJson<{international?:unknown;durationDays?:unknown;hasFlight?:unknown;travelerCount?:unknown;destinationCountryCode?:unknown}>(request);
  if (typeof body.international !== 'boolean' || typeof body.hasFlight !== 'boolean' || !Number.isInteger(body.travelerCount) || Number(body.travelerCount) < 1) throw new HttpError(400,'VALIDATION_ERROR','international, hasFlight and travelerCount are required.');
  const seeds=seedChecklist({international:body.international,durationDays:typeof body.durationDays==='number'?body.durationDays:undefined,hasFlight:body.hasFlight,travelerCount:Number(body.travelerCount),destinationCountryCode:typeof body.destinationCountryCode==='string'?body.destinationCountryCode:undefined});
  const now=nowMs(); let created=0;
  for (const seed of seeds) {
    const marker=`seed:${seed.key}`;
    const exists=await env.DB.prepare('SELECT id FROM trip_checklist_items WHERE trip_id=? AND auto_rule=? AND deleted_at IS NULL').bind(tripId,marker).first();
    if (exists) continue;
    await env.DB.prepare(`INSERT INTO trip_checklist_items(id,trip_id,title,category,priority,completion_source,auto_rule,reminder_enabled,created_at,updated_at,version) VALUES(?,?,?,?,?,'none',?,0,?,?,1)`).bind(uuid(),tripId,seed.title,seed.category,seed.priority,marker,now,now).run();
    created++;
  }
  return json({created,seeds:seeds.length},{},request,env);
}

export async function updateChecklistItem(request: Request, env: Env, auth: AuthContext, tripId: string, itemId: string): Promise<Response> {
  await requireTripAccess(env, auth, tripId, true);
  const body=await readJson<{version?:unknown;completed?:unknown;title?:unknown;priority?:unknown;dueAtUtc?:unknown}>(request);
  if(!Number.isSafeInteger(body.version)) throw new HttpError(400,'VERSION_REQUIRED','Current entity version is required.');
  const current=await env.DB.prepare('SELECT * FROM trip_checklist_items WHERE id=? AND trip_id=? AND deleted_at IS NULL').bind(itemId,tripId).first<Record<string,unknown>>();
  if(!current) throw new HttpError(404,'CHECKLIST_ITEM_NOT_FOUND','Checklist item was not found.');
  if(current.version!==body.version) throw new HttpError(409,'VERSION_CONFLICT','Checklist item changed on another client.',{currentVersion:current.version});
  const title=body.title===undefined?current.title as string:requireString(body.title,'title',160);
  const priority=body.priority===undefined?current.priority as typeof priorities[number]:enumValue(body.priority,'priority',priorities);
  const due=body.dueAtUtc===undefined?current.due_at_utc as number|null:optionalInteger(body.dueAtUtc,'dueAtUtc');
  const now=nowMs(); let completedAt=current.completed_at as number|null; let source=current.completion_source as string;
  if(body.completed!==undefined){if(typeof body.completed!=='boolean')throw new HttpError(400,'VALIDATION_ERROR','completed must be boolean.');completedAt=body.completed?now:null;source=body.completed?'user':'none';}
  await env.DB.prepare(`UPDATE trip_checklist_items SET title=?,priority=?,due_at_utc=?,completed_at=?,completion_source=?,updated_at=?,version=version+1 WHERE id=? AND trip_id=? AND version=?`).bind(title,priority,due,completedAt,source,now,itemId,tripId,body.version).run();
  return json({item:await env.DB.prepare('SELECT * FROM trip_checklist_items WHERE id=?').bind(itemId).first()},{},request,env);
}
