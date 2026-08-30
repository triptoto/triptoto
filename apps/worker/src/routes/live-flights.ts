import type { AuthContext, Env } from '../types.ts';
import { HttpError, json, readJson } from '../http.ts';
import { requireTripAccess } from '../access.ts';
import { LiveFlightUnavailableError, refreshLiveFlightById, scheduleLiveFlightMonitoring } from '../live-flights.ts';

export async function updateLiveFlightMonitoring(request: Request, env: Env, auth: AuthContext, tripId: string, itemId: string): Promise<Response> {
  await requireTripAccess(env, auth, tripId, true);
  const body = await readJson<{ enabled?: unknown }>(request, 4 * 1024);
  if (typeof body.enabled !== 'boolean') throw new HttpError(400, 'VALIDATION_ERROR', 'enabled must be a boolean.');
  try {
    const live = await scheduleLiveFlightMonitoring(env, auth, tripId, itemId, body.enabled);
    if (!live) throw new HttpError(404, 'FLIGHT_NOT_FOUND', 'Flight was not found.');
    return json({ live }, {}, request, env);
  } catch (error) {
    if (error instanceof LiveFlightUnavailableError) throw new HttpError(503, 'LIVE_FLIGHT_UNAVAILABLE', error.message);
    throw error;
  }
}

export async function refreshLiveFlight(request: Request, env: Env, auth: AuthContext, tripId: string, itemId: string): Promise<Response> {
  await requireTripAccess(env, auth, tripId, true);
  const result = await refreshLiveFlightById(env, auth, tripId, itemId);
  const status = result.outcome === 'not_due' ? 429 : result.outcome === 'quota_exhausted' ? 503 : result.outcome === 'error' ? 503 : 200;
  const headers = status === 429 ? { 'retry-after': String(Math.max(60, Number(env.LIVE_FLIGHT_MIN_REFRESH_MINUTES ?? 60) * 60)) } : undefined;
  return json({ refresh: result }, { status, headers }, request, env);
}
