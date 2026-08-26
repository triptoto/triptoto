import type { AuthContext, Env } from './types.ts';
import { HttpError, nowMs, uuid } from './http.ts';

const LOCK_MS = 60_000;
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~:-]{15,119}$/;
const RESOURCE_TYPES = ['stay', 'transport', 'activity', 'contact'] as const;

export type ManualBookingResourceType = typeof RESOURCE_TYPES[number];

interface Row {
  trip_id: string;
  device_id: string;
  client_request_id: string;
  request_fingerprint: string;
  resource_type: ManualBookingResourceType;
  resource_id: string;
  status: 'pending' | 'completed';
  owner_token: string | null;
  lock_expires_at: number | null;
}

export interface ManualBookingClaim {
  enabled: boolean;
  owner: boolean;
  completed: boolean;
  tripId: string;
  deviceId: string;
  clientRequestId: string | null;
  fingerprint: string | null;
  resourceType: ManualBookingResourceType;
  resourceId: string;
  ownerToken: string | null;
}

export interface ManualBookingCreateEvent {
  entityType?: string;
  eventType: string;
  newValue: unknown;
}

/**
 * Reserve one server-generated resource ID for an optional client request ID.
 * Existing callers remain unchanged when neither supported header is present.
 */
export async function claimManualBookingCreate(
  request: Request,
  env: Env,
  auth: AuthContext,
  tripId: string,
  resourceType: ManualBookingResourceType,
  normalizedRequest: unknown,
): Promise<ManualBookingClaim> {
  const clientRequestId = readClientRequestId(request);
  if (!clientRequestId) {
    return {
      enabled: false,
      owner: true,
      completed: false,
      tripId,
      deviceId: auth.deviceId,
      clientRequestId: null,
      fingerprint: null,
      resourceType,
      resourceId: uuid(),
      ownerToken: null,
    };
  }

  const fingerprint = await fingerprintRequest(normalizedRequest);
  const ownerToken = uuid();
  const resourceId = uuid();
  const now = nowMs();
  await env.DB.prepare(`INSERT OR IGNORE INTO manual_booking_idempotency
    (trip_id,device_id,client_request_id,request_fingerprint,resource_type,resource_id,status,owner_token,lock_expires_at,created_at)
    VALUES (?,?,?,?,?,?,'pending',?,?,?)`)
    .bind(tripId, auth.deviceId, clientRequestId, fingerprint, resourceType, resourceId, ownerToken, now + LOCK_MS, now)
    .run();

  let row = await readRow(env, tripId, auth.deviceId, clientRequestId);
  if (!row) throw new HttpError(500, 'IDEMPOTENCY_STATE_UNAVAILABLE', 'The booking request could not be reserved.');
  assertSameRequest(row, fingerprint, resourceType);

  if (row.status === 'pending' && row.owner_token !== ownerToken && Number(row.lock_expires_at || 0) <= now) {
    await env.DB.prepare(`UPDATE manual_booking_idempotency
      SET owner_token=?,lock_expires_at=?
      WHERE trip_id=? AND device_id=? AND client_request_id=? AND status='pending' AND lock_expires_at<=?`)
      .bind(ownerToken, now + LOCK_MS, tripId, auth.deviceId, clientRequestId, now)
      .run();
    row = await readRow(env, tripId, auth.deviceId, clientRequestId);
    if (!row) throw new HttpError(500, 'IDEMPOTENCY_STATE_UNAVAILABLE', 'The booking request could not be reserved.');
    assertSameRequest(row, fingerprint, resourceType);
  }

  return {
    enabled: true,
    owner: row.status === 'pending' && row.owner_token === ownerToken,
    completed: row.status === 'completed',
    tripId,
    deviceId: auth.deviceId,
    clientRequestId,
    fingerprint,
    resourceType,
    resourceId: row.resource_id,
    ownerToken,
  };
}

/** Return the original canonical resource for a retry, or reject an overlap. */
export async function recoverManualBookingCreate<T>(
  env: Env,
  claim: ManualBookingClaim,
  loadResource: (resourceId: string) => Promise<T | null>,
  createEvent?: (resource: T) => ManualBookingCreateEvent,
): Promise<T | null> {
  if (!claim.enabled || claim.owner) return null;
  const resource = await loadResource(claim.resourceId);
  if (resource) {
    await completeManualBookingCreate(env, claim, createEvent?.(resource));
    return resource;
  }
  if (claim.completed) {
    throw new HttpError(409, 'IDEMPOTENCY_RESOURCE_UNAVAILABLE', 'The original booking is no longer available. Use a new request ID for a new booking.');
  }
  throw new HttpError(409, 'IDEMPOTENCY_IN_PROGRESS', 'This booking request is already being processed. Retry with the same request ID.', { retryAfterSeconds: 2 });
}

/**
 * Finalize the reservation and its sync-visible create event atomically.
 * The stable event ID makes a replay repair a missing event without creating
 * duplicates. Callers without an idempotency key still receive one event.
 */
export async function completeManualBookingCreate(
  env: Env,
  claim: ManualBookingClaim,
  createEvent?: ManualBookingCreateEvent,
): Promise<void> {
  const now = nowMs();
  const statements = [];
  if (claim.enabled) {
    statements.push(env.DB.prepare(`UPDATE manual_booking_idempotency
      SET status='completed',owner_token=NULL,lock_expires_at=NULL,completed_at=?
      WHERE trip_id=? AND device_id=? AND client_request_id=?
        AND request_fingerprint=? AND resource_type=? AND resource_id=?`)
      .bind(now, claim.tripId, claim.deviceId, claim.clientRequestId, claim.fingerprint, claim.resourceType, claim.resourceId));
  }
  if (createEvent) {
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO change_events
      (id,trip_id,entity_type,entity_id,event_type,old_value_json,new_value_json,source_type,source_id,created_at)
      VALUES (?,?,?,?,?,NULL,?,'manual',NULL,?)`)
      .bind(
        `manual_create:${claim.resourceId}`,
        claim.tripId,
        createEvent.entityType || 'trip_item',
        claim.resourceId,
        createEvent.eventType,
        createEvent.newValue == null ? null : JSON.stringify(createEvent.newValue),
        now,
      ));
  }
  if (statements.length) await env.DB.batch(statements);
}

/**
 * Fingerprint a trip-scoped location by immutable travel semantics rather than
 * its generated row ID. A client may have to recreate the same place before a
 * retry if the first response was lost; that must still replay the booking.
 */
export async function manualBookingLocationFingerprint(env: Env, tripId: string, locationId: string | null): Promise<unknown> {
  if (!locationId) return null;
  const row = await env.DB.prepare(`SELECT l.place_id,l.type,l.display_name,l.local_name,l.formatted_address,l.local_address,l.latitude,l.longitude,l.country_name,l.country_code,l.region,l.region_code,l.city,l.timezone,l.iata_code,l.icao_code,l.station_code
    FROM locations l JOIN trip_locations tl ON tl.location_id=l.id
    WHERE tl.trip_id=? AND l.id=?`)
    .bind(tripId, locationId)
    .first<Record<string, unknown>>();
  if (!row) throw new HttpError(400, 'LOCATION_NOT_IN_TRIP', 'Location does not belong to this trip.');
  return row;
}

function readClientRequestId(request: Request): string | null {
  const standard = request.headers.get('idempotency-key')?.trim() || '';
  const tripto = request.headers.get('x-tripto-client-request-id')?.trim() || '';
  if (standard && tripto && standard !== tripto) {
    throw new HttpError(400, 'IDEMPOTENCY_KEY_CONFLICT', 'Idempotency headers must contain the same request ID.');
  }
  const value = standard || tripto;
  if (!value) return null;
  if (!KEY_PATTERN.test(value)) {
    throw new HttpError(400, 'INVALID_IDEMPOTENCY_KEY', 'The client request ID must be an opaque 16-120 character identifier.');
  }
  return value;
}

async function readRow(env: Env, tripId: string, deviceId: string, clientRequestId: string): Promise<Row | null> {
  return env.DB.prepare(`SELECT trip_id,device_id,client_request_id,request_fingerprint,resource_type,resource_id,status,owner_token,lock_expires_at
    FROM manual_booking_idempotency WHERE trip_id=? AND device_id=? AND client_request_id=?`)
    .bind(tripId, deviceId, clientRequestId)
    .first<Row>();
}

function assertSameRequest(row: Row, fingerprint: string, resourceType: ManualBookingResourceType): void {
  if (row.request_fingerprint !== fingerprint || row.resource_type !== resourceType) {
    throw new HttpError(409, 'IDEMPOTENCY_BODY_MISMATCH', 'This request ID was already used for different booking details.');
  }
}

async function fingerprintRequest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new HttpError(400, 'VALIDATION_ERROR', 'Booking details contain an invalid number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).filter(key => object[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  }
  throw new HttpError(400, 'VALIDATION_ERROR', 'Booking details contain an unsupported value.');
}
