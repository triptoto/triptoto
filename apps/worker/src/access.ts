import type { AuthContext, Env } from './types.ts';
import { HttpError } from './http.ts';

export async function requireTripAccess(env: Env, auth: AuthContext, tripId: string, write = false): Promise<{ id: string; role: string }> {
  const trip = await env.DB.prepare(`
    SELECT t.id,
      CASE
        WHEN t.owner_user_id IS NULL AND t.created_by_device_id = ? THEN 'owner'
        WHEN t.owner_user_id IS NOT NULL AND t.owner_user_id = ? THEN 'owner'
        ELSE COALESCE(tm.role, '')
      END AS role
    FROM trips t
    LEFT JOIN trip_members tm ON tm.trip_id = t.id AND tm.user_id = ? AND tm.status = 'active'
    WHERE t.id = ? AND t.deleted_at IS NULL
    LIMIT 1
  `).bind(auth.deviceId, auth.userId ?? null, auth.userId ?? null, tripId).first<{ id: string; role: string }>();
  if (!trip || !trip.role) throw new HttpError(404, 'TRIP_NOT_FOUND', 'Trip was not found.');
  if (write && !['owner', 'editor'].includes(trip.role)) throw new HttpError(403, 'FORBIDDEN', 'This trip is read-only for the current member.');
  return trip;
}

// Owner-only authorization for destructive / trip-level actions (delete, cancel,
// transfer, metadata edits). A device-based guest owner of their own unshared
// trip qualifies via created_by_device_id — no account is required. Editors and
// viewers are rejected with 403 OWNER_REQUIRED. Release-blocking gate: editors
// must never be able to delete or cancel a trip.
export async function requireTripOwner(env: Env, auth: AuthContext, tripId: string): Promise<{ id: string; role: string }> {
  const access = await requireTripAccess(env, auth, tripId, true);
  if (access.role !== 'owner') throw new HttpError(403, 'OWNER_REQUIRED', 'Only the trip owner can perform this action.');
  return access;
}
