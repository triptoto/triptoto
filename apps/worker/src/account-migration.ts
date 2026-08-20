import type { Env } from './types.ts';
import { HttpError, nowMs, uuid } from './http.ts';

/**
 * Finalizes guest -> account ownership after an external auth adapter has
 * already verified the identity and created/located the destination user.
 *
 * This function is deliberately not exposed as a public API endpoint yet.
 * Apple/Google/email-code adapters can call it later after verification.
 */
export async function migrateGuestDeviceToUser(env: Env, deviceId: string, userId: string): Promise<{ migratedTrips: number }> {
  const device = await env.DB.prepare(`SELECT id,user_id,revoked_at FROM devices WHERE id=?`).bind(deviceId).first<{id:string;user_id:string|null;revoked_at:number|null}>();
  if (!device || device.revoked_at != null) throw new HttpError(401,'INVALID_DEVICE','Guest device is unavailable.');
  if (device.user_id && device.user_id !== userId) throw new HttpError(409,'DEVICE_ALREADY_LINKED','Device is linked to another account.');

  const user = await env.DB.prepare(`SELECT id,deleted_at FROM users WHERE id=?`).bind(userId).first<{id:string;deleted_at:number|null}>();
  if (!user || user.deleted_at != null) throw new HttpError(404,'USER_NOT_FOUND','Destination account was not found.');

  const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM trips WHERE created_by_device_id=? AND owner_user_id IS NULL AND deleted_at IS NULL`).bind(deviceId).first<{count:number}>();
  const migratedTrips = Number(count?.count ?? 0);
  const now = nowMs();
  const eventId = uuid();

  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO trip_members(trip_id,user_id,role,status,joined_at)
      SELECT id,?,'owner','active',? FROM trips WHERE created_by_device_id=? AND owner_user_id IS NULL AND deleted_at IS NULL`).bind(userId,now,deviceId),
    env.DB.prepare(`UPDATE trips SET owner_user_id=?,updated_at=?,version=version+1 WHERE created_by_device_id=? AND owner_user_id IS NULL AND deleted_at IS NULL`).bind(userId,now,deviceId),
    env.DB.prepare(`UPDATE imports SET user_id=? WHERE user_id IS NULL AND trip_id IN (SELECT id FROM trips WHERE created_by_device_id=?)`).bind(userId,deviceId),
    env.DB.prepare(`UPDATE sync_operations SET user_id=? WHERE user_id IS NULL AND device_id=?`).bind(userId,deviceId),
    env.DB.prepare(`UPDATE devices SET user_id=?,last_seen_at=? WHERE id=? AND user_id IS NULL`).bind(userId,now,deviceId),
    env.DB.prepare(`INSERT INTO identity_events(id,user_id,device_id,event_type,metadata_json,created_at) VALUES (?,?,?,'guest_migrated',?,?)`)
      .bind(eventId,userId,deviceId,JSON.stringify({migratedTrips}),now),
  ]);

  return { migratedTrips };
}
