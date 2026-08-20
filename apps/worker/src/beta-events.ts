import type { AuthContext, Env } from './types.ts';
import { nowMs, uuid } from './http.ts';

export const BETA_RELEASE = 'beta-candidate-1';
export const betaEventNames = [
  'trip_created','second_trip_created','booking_added','second_booking_added','timeline_opened','whats_next_opened',
  'during_trip_home_opened','ready_offline_opened','local_document_saved','local_document_opened','import_previewed',
  'import_confirmed','trip_completed','offline_conflict_seen',
] as const;
export type BetaEventName = typeof betaEventNames[number];

const oncePerTrip = new Set<BetaEventName>(['trip_created','second_booking_added','trip_completed','import_confirmed']);
const oncePerActor = new Set<BetaEventName>(['second_trip_created']);

export async function recordBetaEvent(env: Env, auth: AuthContext, eventName: BetaEventName, tripId: string | null = null, mode: 'default'|'daily'|'always' = 'default'): Promise<void> {
  if (env.BETA_METRICS_ENABLED !== 'true') return;
  const qaDevice=await env.DB.prepare(`SELECT qa_marker FROM devices WHERE id=?`).bind(auth.deviceId).first<{qa_marker:string|null}>();
  if (qaDevice?.qa_marker) return;
  const now = nowMs();
  const day = new Date(now).toISOString().slice(0,10);
  const actor = auth.userId ? `u:${auth.userId}` : `d:${auth.deviceId}`;
  let dedupeKey: string | null = null;
  if (mode === 'daily') dedupeKey = `${actor}:${tripId ?? '-'}:${eventName}:${day}`;
  else if (mode !== 'always' && oncePerTrip.has(eventName) && tripId) dedupeKey = `${actor}:${tripId}:${eventName}`;
  else if (mode !== 'always' && oncePerActor.has(eventName)) dedupeKey = `${actor}:${eventName}`;
  try {
    await env.DB.prepare(`INSERT INTO beta_events(id,user_id,device_id,trip_id,event_name,event_day,release,dedupe_key,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(uuid(),auth.userId??null,auth.deviceId,tripId,eventName,day,env.BETA_RELEASE||BETA_RELEASE,dedupeKey,now).run();
  } catch (error) {
    if (dedupeKey) return;
    console.error('beta event write failed', { eventName, error });
  }
}

export async function recordBookingMilestones(env: Env, auth: AuthContext, tripId: string): Promise<void> {
  await recordBetaEvent(env, auth, 'booking_added', tripId, 'always');
  const row = await env.DB.prepare(`SELECT COUNT(*) count FROM trip_items WHERE trip_id=? AND deleted_at IS NULL AND type IN ('transport','stay','activity','reservation')`)
    .bind(tripId).first<{count:number}>();
  if (Number(row?.count ?? 0) >= 2) await recordBetaEvent(env, auth, 'second_booking_added', tripId);
}
