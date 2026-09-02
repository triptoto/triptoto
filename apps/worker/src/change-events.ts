import type { AuthContext, Env } from './types.ts';
import { nowMs, uuid } from './http.ts';

export async function recordChangeEvent(
  env: Env,
  tripId: string,
  entityType: string,
  entityId: string,
  eventType: string,
  oldValue: unknown,
  newValue: unknown,
  sourceType = 'manual',
  sourceId: string | null = null,
  actor: AuthContext | null = null,
): Promise<string> {
  const id = uuid();
  await env.DB.prepare(`INSERT INTO change_events (id,trip_id,entity_type,entity_id,event_type,old_value_json,new_value_json,source_type,source_id,actor_user_id,actor_device_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, tripId, entityType, entityId, eventType, oldValue == null ? null : JSON.stringify(oldValue), newValue == null ? null : JSON.stringify(newValue), sourceType, sourceId, actor?.userId ?? null, actor?.deviceId ?? null, nowMs()).run();
  return id;
}
