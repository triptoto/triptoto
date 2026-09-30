import type { Env } from './types.ts';
import { HttpError } from './http.ts';

// Shared opaque-key idempotency for offline create-replays (QA BUG-08). The client
// re-sends each queued row's stable `pending_<uuid>` id as an Idempotency-Key when
// flushing its offline queue; without a server guard a lossy reconnect that re-runs
// the queue would insert duplicate checklist items / collection stops. Mirrors the
// per-purpose pattern already used for trip creates (see routes/trips.ts).

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._~:-]{15,119}$/;

export function readIdempotencyKey(request: Request): string | null {
  const standard = request.headers.get('idempotency-key')?.trim() || '';
  const tripto = request.headers.get('x-tripto-client-request-id')?.trim() || '';
  if (standard && tripto && standard !== tripto) throw new HttpError(400, 'IDEMPOTENCY_KEY_CONFLICT', 'Idempotency headers must contain the same request ID.');
  const value = standard || tripto;
  if (!value) return null;
  if (!KEY_RE.test(value)) throw new HttpError(400, 'INVALID_IDEMPOTENCY_KEY', 'The client request ID must be an opaque 16-120 character identifier.');
  return value;
}

export async function digestJson(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export interface ReplayedCreate { resourceType: string; resourceId: string; }

// Returns the resource previously created for this (device,key), or null on first
// use. Throws 409 when the same key is replayed with a different request body.
export async function findReplayedCreate(env: Env, deviceId: string, key: string, fingerprint: string): Promise<ReplayedCreate | null> {
  const existing = await env.DB.prepare(`SELECT request_fingerprint,resource_type,resource_id FROM create_idempotency WHERE device_id=? AND client_request_id=?`)
    .bind(deviceId, key).first<{request_fingerprint:string;resource_type:string;resource_id:string}>();
  if (!existing) return null;
  if (existing.request_fingerprint !== fingerprint) throw new HttpError(409, 'IDEMPOTENCY_BODY_MISMATCH', 'This request ID was already used for a different create.');
  return { resourceType: existing.resource_type, resourceId: existing.resource_id };
}

export function idempotencyInsert(env: Env, deviceId: string, key: string, fingerprint: string, resourceType: string, resourceId: string, now: number) {
  return env.DB.prepare(`INSERT INTO create_idempotency(device_id,client_request_id,request_fingerprint,resource_type,resource_id,created_at) VALUES (?,?,?,?,?,?)`)
    .bind(deviceId, key, fingerprint, resourceType, resourceId, now);
}
