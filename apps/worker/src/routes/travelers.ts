import type { AuthContext, Env } from '../types.ts';
import { HttpError, enumValue, json, nowMs, optionalInteger, optionalString, readJson, requireString, uuid } from '../http.ts';
import { requireTripAccess } from '../access.ts';
import { recordChangeEvent } from '../change-events.ts';

const travelerTypes = ['adult','child','infant','unknown'] as const;
interface TravelerBody { displayName?: unknown; givenName?: unknown; familyName?: unknown; travelerType?: unknown; birthYear?: unknown; version?: unknown; }

export async function listTravelers(request: Request, env: Env, auth: AuthContext, tripId: string): Promise<Response> {
  await requireTripAccess(env, auth, tripId);
  const result = await env.DB.prepare(`SELECT * FROM travelers WHERE trip_id=? AND deleted_at IS NULL ORDER BY created_at`).bind(tripId).all();
  return json({ travelers: result.results ?? [] }, {}, request, env);
}

export async function createTraveler(request: Request, env: Env, auth: AuthContext, tripId: string): Promise<Response> {
  await requireTripAccess(env, auth, tripId, true);
  const body = await readJson<TravelerBody>(request);
  const displayName = requireString(body.displayName, 'displayName', 120);
  const givenName = optionalString(body.givenName, 'givenName', 80);
  const familyName = optionalString(body.familyName, 'familyName', 80);
  const travelerType = enumValue(body.travelerType, 'travelerType', travelerTypes, 'unknown');
  const birthYear = optionalInteger(body.birthYear, 'birthYear');
  if (birthYear != null && (birthYear < 1900 || birthYear > 2200)) throw new HttpError(400,'VALIDATION_ERROR','birthYear is out of range.');
  const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM travelers WHERE trip_id=? AND deleted_at IS NULL`).bind(tripId).first<{count:number}>();
  if (Number(count?.count ?? 0) >= 20) throw new HttpError(409,'TRAVELER_LIMIT_REACHED','Beta limit of 20 travelers per trip reached.');
  const id = uuid(), now = nowMs();
  await env.DB.prepare(`INSERT INTO travelers (id,trip_id,linked_user_id,display_name,given_name,family_name,traveler_type,birth_year,created_at,updated_at,version) VALUES (?,?,NULL,?,?,?,?,?,?,?,1)`)
    .bind(id,tripId,displayName,givenName,familyName,travelerType,birthYear,now,now).run();
  const traveler = await env.DB.prepare(`SELECT * FROM travelers WHERE id=?`).bind(id).first();
  await recordChangeEvent(env,tripId,'traveler',id,'traveler_added',null,traveler);
  return json({ traveler }, { status: 201 }, request, env);
}

export async function updateTraveler(request: Request, env: Env, auth: AuthContext, tripId: string, travelerId: string): Promise<Response> {
  await requireTripAccess(env,auth,tripId,true);
  const existing = await env.DB.prepare(`SELECT * FROM travelers WHERE id=? AND trip_id=? AND deleted_at IS NULL`).bind(travelerId,tripId).first<Record<string,unknown>>();
  if (!existing) throw new HttpError(404,'TRAVELER_NOT_FOUND','Traveler was not found.');
  const body = await readJson<TravelerBody>(request);
  if (!Number.isSafeInteger(body.version)) throw new HttpError(400,'VERSION_REQUIRED','Current entity version is required.');
  if (existing.version !== body.version) throw new HttpError(409,'VERSION_CONFLICT','Traveler changed on another client.',{currentVersion:existing.version});
  const displayName = body.displayName === undefined ? existing.display_name as string : requireString(body.displayName,'displayName',120);
  const givenName = body.givenName === undefined ? existing.given_name as string|null : optionalString(body.givenName,'givenName',80);
  const familyName = body.familyName === undefined ? existing.family_name as string|null : optionalString(body.familyName,'familyName',80);
  const travelerType = body.travelerType === undefined ? existing.traveler_type as typeof travelerTypes[number] : enumValue(body.travelerType,'travelerType',travelerTypes);
  const birthYear = body.birthYear === undefined ? existing.birth_year as number|null : optionalInteger(body.birthYear,'birthYear');
  if (birthYear != null && (birthYear < 1900 || birthYear > 2200)) throw new HttpError(400,'VALIDATION_ERROR','birthYear is out of range.');
  const now=nowMs();
  await env.DB.prepare(`UPDATE travelers SET display_name=?,given_name=?,family_name=?,traveler_type=?,birth_year=?,updated_at=?,version=version+1 WHERE id=? AND trip_id=? AND version=? AND deleted_at IS NULL`)
    .bind(displayName,givenName,familyName,travelerType,birthYear,now,travelerId,tripId,body.version).run();
  const traveler = await env.DB.prepare(`SELECT * FROM travelers WHERE id=?`).bind(travelerId).first();
  await recordChangeEvent(env,tripId,'traveler',travelerId,'traveler_updated',existing,traveler);
  return json({ traveler },{},request,env);
}

export async function deleteTraveler(request: Request, env: Env, auth: AuthContext, tripId: string, travelerId: string): Promise<Response> {
  await requireTripAccess(env,auth,tripId,true);
  const body=await readJson<{version?:unknown}>(request);
  if (!Number.isSafeInteger(body.version)) throw new HttpError(400,'VERSION_REQUIRED','Current entity version is required.');
  const now=nowMs();
  await env.DB.prepare(`UPDATE travelers SET deleted_at=?,updated_at=?,version=version+1 WHERE id=? AND trip_id=? AND version=? AND deleted_at IS NULL`).bind(now,now,travelerId,tripId,body.version).run();
  const row=await env.DB.prepare(`SELECT version,deleted_at FROM travelers WHERE id=? AND trip_id=?`).bind(travelerId,tripId).first<{version:number;deleted_at:number|null}>();
  if(!row?.deleted_at) throw new HttpError(409,'VERSION_CONFLICT','Traveler changed on another client.');
  await env.DB.prepare(`INSERT INTO tombstones(entity_type,entity_id,version,deleted_at) VALUES('traveler',?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET version=excluded.version,deleted_at=excluded.deleted_at`).bind(travelerId,row.version,row.deleted_at).run();
  await recordChangeEvent(env,tripId,'traveler',travelerId,'traveler_removed',null,{deletedAt:row.deleted_at});
  return new Response(null,{status:204});
}
