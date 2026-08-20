import type { AuthContext, Env } from '../types.ts';
import { HttpError, enumValue, json, nowMs, optionalInteger, optionalString, readJson, requireString, uuid } from '../http.ts';
import { requireTripAccess } from '../access.ts';
import { recordBookingMilestones } from '../beta-events.ts';

const types = ['transport', 'stay', 'activity', 'reservation', 'custom'] as const;
const statuses = ['planned', 'confirmed', 'completed', 'cancelled', 'skipped', 'unknown'] as const;
const confidences = ['confirmed', 'live', 'estimated', 'unavailable', 'low_confidence'] as const;
const sourceTypes = ['manual', 'email', 'upload', 'system', 'provider'] as const;

interface ItemBody {
  type?: unknown; status?: unknown; title?: unknown; subtitle?: unknown;
  startsAtUtc?: unknown; endsAtUtc?: unknown; startLocalDatetime?: unknown; endLocalDatetime?: unknown;
  startTimezone?: unknown; endTimezone?: unknown; sourceType?: unknown; confidence?: unknown; version?: unknown;
}

export async function listTimeline(request: Request, env: Env, auth: AuthContext, tripId: string): Promise<Response> {
  await requireTripAccess(env, auth, tripId);
  const result = await env.DB.prepare(`SELECT * FROM trip_items WHERE trip_id=? AND deleted_at IS NULL ORDER BY CASE WHEN starts_at_utc IS NULL THEN 1 ELSE 0 END, starts_at_utc, created_at`).bind(tripId).all();
  return json({ items: result.results ?? [] }, {}, request, env);
}

export async function createTimelineItem(request: Request, env: Env, auth: AuthContext, tripId: string): Promise<Response> {
  await requireTripAccess(env, auth, tripId, true);
  const body = await readJson<ItemBody>(request);
  const values = normalize(body, false);
  const id = uuid(); const now = nowMs();
  await env.DB.prepare(`INSERT INTO trip_items (id,trip_id,type,status,title,subtitle,starts_at_utc,ends_at_utc,start_local_datetime,end_local_datetime,start_timezone,end_timezone,source_type,confidence,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`)
    .bind(id, tripId, values.type, values.status, values.title, values.subtitle, values.startsAtUtc, values.endsAtUtc, values.startLocalDatetime, values.endLocalDatetime, values.startTimezone, values.endTimezone, values.sourceType, values.confidence, now, now).run();
  const item = await env.DB.prepare('SELECT * FROM trip_items WHERE id=?').bind(id).first();
  if(['activity','reservation'].includes(values.type))await recordBookingMilestones(env,auth,tripId);
  return json({ item }, { status: 201 }, request, env);
}

export async function updateTimelineItem(request: Request, env: Env, auth: AuthContext, tripId: string, itemId: string): Promise<Response> {
  await requireTripAccess(env, auth, tripId, true);
  const existing = await env.DB.prepare('SELECT * FROM trip_items WHERE id=? AND trip_id=? AND deleted_at IS NULL').bind(itemId, tripId).first<Record<string, unknown>>();
  if (!existing) throw new HttpError(404, 'ITEM_NOT_FOUND', 'Timeline item was not found.');
  const body = await readJson<ItemBody>(request);
  if (!Number.isSafeInteger(body.version)) throw new HttpError(400, 'VERSION_REQUIRED', 'Current entity version is required.');
  if (existing.version !== body.version) throw new HttpError(409, 'VERSION_CONFLICT', 'Timeline item changed on another client.', { currentVersion: existing.version });
  const values = normalize(body, true, existing);
  const now = nowMs();
  await env.DB.prepare(`UPDATE trip_items SET type=?,status=?,title=?,subtitle=?,starts_at_utc=?,ends_at_utc=?,start_local_datetime=?,end_local_datetime=?,start_timezone=?,end_timezone=?,source_type=?,confidence=?,updated_at=?,version=version+1 WHERE id=? AND trip_id=? AND version=? AND deleted_at IS NULL`)
    .bind(values.type, values.status, values.title, values.subtitle, values.startsAtUtc, values.endsAtUtc, values.startLocalDatetime, values.endLocalDatetime, values.startTimezone, values.endTimezone, values.sourceType, values.confidence, now, itemId, tripId, body.version).run();
  const item = await env.DB.prepare('SELECT * FROM trip_items WHERE id=?').bind(itemId).first();
  return json({ item }, {}, request, env);
}

export async function deleteTimelineItem(request: Request, env: Env, auth: AuthContext, tripId: string, itemId: string): Promise<Response> {
  await requireTripAccess(env, auth, tripId, true);
  const body = await readJson<{ version?: unknown }>(request);
  if (!Number.isSafeInteger(body.version)) throw new HttpError(400, 'VERSION_REQUIRED', 'Current entity version is required.');
  const now = nowMs();
  await env.DB.prepare(`UPDATE trip_items SET deleted_at=?,updated_at=?,version=version+1 WHERE id=? AND trip_id=? AND version=? AND deleted_at IS NULL`).bind(now, now, itemId, tripId, body.version).run();
  const row = await env.DB.prepare('SELECT version,deleted_at FROM trip_items WHERE id=? AND trip_id=?').bind(itemId, tripId).first<{ version: number; deleted_at: number | null }>();
  if (!row?.deleted_at) throw new HttpError(409, 'VERSION_CONFLICT', 'Timeline item changed on another client.');
  await env.DB.prepare(`INSERT INTO tombstones(entity_type,entity_id,version,deleted_at) VALUES('trip_item',?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET version=excluded.version,deleted_at=excluded.deleted_at`).bind(itemId,row.version,row.deleted_at).run();
  return new Response(null, { status: 204 });
}

function normalize(body: ItemBody, patch: boolean, existing: Record<string, unknown> = {}) {
  const type = body.type === undefined && patch ? existing.type as typeof types[number] : enumValue(body.type,'type',types);
  const status = body.status === undefined && patch ? existing.status as typeof statuses[number] : enumValue(body.status,'status',statuses,'planned');
  const title = body.title === undefined && patch ? existing.title as string : requireString(body.title,'title',160);
  const subtitle = body.subtitle === undefined && patch ? existing.subtitle as string|null : optionalString(body.subtitle,'subtitle',300);
  const startsAtUtc = body.startsAtUtc === undefined && patch ? existing.starts_at_utc as number|null : optionalInteger(body.startsAtUtc,'startsAtUtc');
  const endsAtUtc = body.endsAtUtc === undefined && patch ? existing.ends_at_utc as number|null : optionalInteger(body.endsAtUtc,'endsAtUtc');
  if (startsAtUtc != null && endsAtUtc != null && endsAtUtc < startsAtUtc) throw new HttpError(400,'VALIDATION_ERROR','endsAtUtc cannot be before startsAtUtc.');
  const startLocalDatetime = body.startLocalDatetime === undefined && patch ? existing.start_local_datetime as string|null : optionalString(body.startLocalDatetime,'startLocalDatetime',40);
  const endLocalDatetime = body.endLocalDatetime === undefined && patch ? existing.end_local_datetime as string|null : optionalString(body.endLocalDatetime,'endLocalDatetime',40);
  const startTimezone = body.startTimezone === undefined && patch ? existing.start_timezone as string|null : optionalString(body.startTimezone,'startTimezone',80);
  const endTimezone = body.endTimezone === undefined && patch ? existing.end_timezone as string|null : optionalString(body.endTimezone,'endTimezone',80);
  const sourceType = body.sourceType === undefined && patch ? existing.source_type as typeof sourceTypes[number] : enumValue(body.sourceType,'sourceType',sourceTypes,'manual');
  const confidence = body.confidence === undefined && patch ? existing.confidence as typeof confidences[number] : enumValue(body.confidence,'confidence',confidences,'confirmed');
  return {type,status,title,subtitle,startsAtUtc,endsAtUtc,startLocalDatetime,endLocalDatetime,startTimezone,endTimezone,sourceType,confidence};
}
