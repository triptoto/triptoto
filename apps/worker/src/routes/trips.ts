import type { AuthContext, Env } from '../types.ts';
import { HttpError, enumValue, json, nowMs, optionalString, readJson, requireString, uuid } from '../http.ts';
import { requireTripAccess } from '../access.ts';

const states = ['draft', 'upcoming', 'active', 'completed', 'cancelled'] as const;

interface TripBody {
  title?: unknown;
  lifecycleState?: unknown;
  startsOn?: unknown;
  endsOn?: unknown;
  version?: unknown;
}

export async function listTrips(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const result = auth.userId
    ? await env.DB.prepare(`SELECT DISTINCT t.* FROM trips t LEFT JOIN trip_members tm ON tm.trip_id=t.id AND tm.user_id=? AND tm.status='active' WHERE t.deleted_at IS NULL AND (t.owner_user_id=? OR tm.user_id=?) ORDER BY COALESCE(t.starts_on,'9999-12-31'), t.created_at DESC LIMIT 100`).bind(auth.userId, auth.userId, auth.userId).all()
    : await env.DB.prepare(`SELECT * FROM trips WHERE created_by_device_id=? AND owner_user_id IS NULL AND deleted_at IS NULL ORDER BY COALESCE(starts_on,'9999-12-31'), created_at DESC LIMIT 100`).bind(auth.deviceId).all();
  return json({ trips: result.results ?? [] }, {}, request, env);
}

export async function createTrip(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const body = await readJson<TripBody>(request);
  const title = requireString(body.title, 'title', 120);
  const lifecycleState = enumValue(body.lifecycleState, 'lifecycleState', states, 'draft');
  const startsOn = optionalDate(body.startsOn, 'startsOn');
  const endsOn = optionalDate(body.endsOn, 'endsOn');
  if (startsOn && endsOn && endsOn < startsOn) throw new HttpError(400, 'VALIDATION_ERROR', 'endsOn cannot be before startsOn.');

  const activeCount = await env.DB.prepare(`SELECT COUNT(*) AS count FROM trips WHERE deleted_at IS NULL AND lifecycle_state IN ('draft','upcoming','active') AND ${auth.userId ? 'owner_user_id=?' : 'created_by_device_id=? AND owner_user_id IS NULL'}`)
    .bind(auth.userId ?? auth.deviceId).first<{ count: number }>();
  if (Number(activeCount?.count ?? 0) >= 10) throw new HttpError(409, 'TRIP_LIMIT_REACHED', 'Beta limit of 10 active trips reached.');

  const id = uuid();
  const now = nowMs();
  await env.DB.prepare(`INSERT INTO trips (id, owner_user_id, created_by_device_id, title, lifecycle_state, starts_on, ends_on, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
    .bind(id, auth.userId ?? null, auth.deviceId, title, lifecycleState, startsOn, endsOn, now, now).run();
  if (auth.userId) {
    await env.DB.prepare(`INSERT OR IGNORE INTO trip_members (trip_id,user_id,role,status,joined_at) VALUES (?,?,'owner','active',?)`).bind(id, auth.userId, now).run();
  }
  const trip = await env.DB.prepare('SELECT * FROM trips WHERE id=?').bind(id).first();
  return json({ trip }, { status: 201 }, request, env);
}

export async function getTrip(request: Request, env: Env, auth: AuthContext, tripId: string): Promise<Response> {
  await requireTripAccess(env, auth, tripId);
  const trip = await env.DB.prepare('SELECT * FROM trips WHERE id=? AND deleted_at IS NULL').bind(tripId).first();
  return json({ trip }, {}, request, env);
}

export async function updateTrip(request: Request, env: Env, auth: AuthContext, tripId: string): Promise<Response> {
  await requireTripAccess(env, auth, tripId, true);
  const body = await readJson<TripBody>(request);
  if (!Number.isSafeInteger(body.version)) throw new HttpError(400, 'VERSION_REQUIRED', 'Current entity version is required.');
  const existing = await env.DB.prepare('SELECT * FROM trips WHERE id=? AND deleted_at IS NULL').bind(tripId).first<Record<string, unknown>>();
  if (!existing) throw new HttpError(404, 'TRIP_NOT_FOUND', 'Trip was not found.');
  if (existing.version !== body.version) throw new HttpError(409, 'VERSION_CONFLICT', 'Trip changed on another client.', { currentVersion: existing.version });

  const title = body.title === undefined ? existing.title as string : requireString(body.title, 'title', 120);
  const state = body.lifecycleState === undefined ? existing.lifecycle_state as typeof states[number] : enumValue(body.lifecycleState, 'lifecycleState', states);
  const startsOn = body.startsOn === undefined ? existing.starts_on as string | null : optionalDate(body.startsOn, 'startsOn');
  const endsOn = body.endsOn === undefined ? existing.ends_on as string | null : optionalDate(body.endsOn, 'endsOn');
  if (startsOn && endsOn && endsOn < startsOn) throw new HttpError(400, 'VALIDATION_ERROR', 'endsOn cannot be before startsOn.');
  const now = nowMs();
  const result = await env.DB.prepare(`UPDATE trips SET title=?, lifecycle_state=?, starts_on=?, ends_on=?, updated_at=?, version=version+1, cancelled_at=CASE WHEN ?='cancelled' THEN COALESCE(cancelled_at,?) ELSE cancelled_at END WHERE id=? AND version=? AND deleted_at IS NULL`)
    .bind(title, state, startsOn, endsOn, now, state, now, tripId, body.version).run();
  if (!result.success) throw new HttpError(500, 'UPDATE_FAILED', 'Trip could not be updated.');
  const trip = await env.DB.prepare('SELECT * FROM trips WHERE id=?').bind(tripId).first();
  return json({ trip }, {}, request, env);
}

export async function deleteTrip(request: Request, env: Env, auth: AuthContext, tripId: string): Promise<Response> {
  await requireTripAccess(env, auth, tripId, true);
  const body = await readJson<{ version?: unknown }>(request);
  if (!Number.isSafeInteger(body.version)) throw new HttpError(400, 'VERSION_REQUIRED', 'Current entity version is required.');
  const now = nowMs();
  await env.DB.prepare(`UPDATE trips SET deleted_at=?, updated_at=?, version=version+1 WHERE id=? AND version=? AND deleted_at IS NULL`).bind(now, now, tripId, body.version).run();
  const row = await env.DB.prepare('SELECT deleted_at FROM trips WHERE id=?').bind(tripId).first<{ deleted_at: number | null }>();
  if (!row?.deleted_at) throw new HttpError(409, 'VERSION_CONFLICT', 'Trip changed on another client.');
  await env.DB.prepare(`INSERT INTO tombstones(entity_type,entity_id,version,deleted_at) SELECT 'trip',id,version,deleted_at FROM trips WHERE id=? ON CONFLICT(entity_type,entity_id) DO UPDATE SET version=excluded.version, deleted_at=excluded.deleted_at`).bind(tripId).run();
  return new Response(null, { status: 204 });
}

function optionalDate(value: unknown, name: string): string | null {
  const out = optionalString(value, name, 10);
  if (out == null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out) || Number.isNaN(Date.parse(`${out}T00:00:00Z`))) throw new HttpError(400, 'VALIDATION_ERROR', `${name} must be YYYY-MM-DD.`);
  return out;
}
