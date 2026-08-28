import type { Env } from './types.ts';
import { nowMs, uuid } from './http.ts';
import { PRODUCT_LIMITS } from './config.ts';
import { parseForwardedEmail } from '../../../packages/importer/src/index.ts';

export interface InboundEmailMessage {
  from: string;
  to: string;
  raw: ReadableStream<Uint8Array>;
  headers: Headers;
  setReject(reason: string): void;
}

const MAX_BYTES = 512 * 1024;

// Addresses that Cloudflare Email Routing forwards to this worker. go@tripto.to
// is the user-facing brand address shown across the app; travelinkme@gmail.com
// is the routing destination that also delivers to the worker.
const ACCEPTED_RECIPIENTS = new Set(['go@tripto.to', 'travelinkme@gmail.com']);

export async function receiveBookingEmail(message: InboundEmailMessage, env: Env): Promise<void> {
  const recipient = normalizeAddress(message.to);
  if (!ACCEPTED_RECIPIENTS.has(recipient)) {
    message.setReject('Unknown recipient');
    return;
  }
  const sender = normalizeAddress(message.from);
  if (!sender) {
    message.setReject('Sender is required');
    return;
  }
  let bytes: Uint8Array;
  try {
    bytes = await readBounded(message.raw, MAX_BYTES);
  } catch {
    message.setReject('Confirmation exceeds the safe size limit');
    return;
  }
  const raw = new TextDecoder().decode(bytes);
  const subject = headerValue(message.headers, 'subject').slice(0, 500) || null;
  const messageId = headerValue(message.headers, 'message-id').slice(0, 500);
  const fingerprint = await digestHex(`${sender}\n${messageId}\n${raw}`);
  const duplicate = await env.DB.prepare(`SELECT id FROM inbound_booking_emails WHERE message_fingerprint=?`).bind(fingerprint).first();
  if (duplicate) return;

  const verified = await env.DB.prepare(`SELECT user_id FROM verified_sender_emails WHERE email_normalized=? AND revoked_at IS NULL`).bind(sender).first<{user_id:string}>();
  if (!verified) {
    message.setReject('Sender is not verified');
    return;
  }

  // Parse BEFORE choosing a trip so the booking's own dates can pick the right
  // one (or open a fresh draft) instead of forcing exactly-one-eligible-trip.
  const parsed = parseForwardedEmail({sender,subject:subject || undefined,body:raw});
  const bookingWindow = deriveBookingWindow(parsed);
  const now = nowMs();

  // Full eligible set (not just one) so a dated booking can be date-matched.
  const trips = (await env.DB.prepare(`SELECT id, starts_on, ends_on FROM trips WHERE owner_user_id=? AND deleted_at IS NULL AND lifecycle_state IN ('active','upcoming','draft') ORDER BY CASE lifecycle_state WHEN 'active' THEN 0 WHEN 'upcoming' THEN 1 ELSE 2 END, COALESCE(starts_on,'9999-12-31') LIMIT 50`).bind(verified.user_id).all<{id:string;starts_on:string|null;ends_on:string|null}>()).results ?? [];

  let tripId: string | null = null;
  // Draft-trip inserts are deferred into the SAME batch as the import so a
  // homeless booking either lands fully (trip + members + import + candidates +
  // inbound row) or not at all — never an orphan draft that reprocessing dups.
  let draftStatements: ReturnType<Env['DB']['prepare']>[] = [];
  // 1. Date-match: only accept an unambiguous single hit — never guess when a
  //    booking's dates land inside more than one trip.
  if (bookingWindow.start) {
    const hits = trips.filter((trip) => tripCoversDate(trip, bookingWindow.start as string));
    if (hits.length === 1) tripId = hits[0].id;
  }
  // 2. Exactly one eligible trip and nothing to disambiguate: attach to it.
  if (!tripId && trips.length === 1) tripId = trips[0].id;
  // 3. Parsed a dated booking with no home: open a draft trip for it so the
  //    forward is never silently dropped (respecting the beta trip cap).
  if (!tripId && parsed.candidates.length && bookingWindow.start && trips.length < PRODUCT_LIMITS.activeTripsPerAccount) {
    const draft = buildDraftTrip(env, verified.user_id, bookingWindow, now);
    tripId = draft.id;
    draftStatements = draft.statements;
  }
  // 4. Still nowhere to file it: park as needs_trip so it stays visible
  //    server-side instead of being guessed onto the wrong trip. A single
  //    eligible trip is always attached in step 2, so trips.length !== 1 here.
  if (!tripId && trips.length !== 1) {
    await recordInbound(env,{fingerprint,sender,subject,status:'needs_trip',userId:verified.user_id,rejectionCode:trips.length ? 'AMBIGUOUS_TRIP' : 'NO_ELIGIBLE_TRIP'});
    return;
  }
  if (!tripId) tripId = trips[0].id;

  const importId = uuid();
  const status = parsed.candidates.length ? 'needs_confirmation' : 'unsupported';
  const statements = [
    ...draftStatements,
    env.DB.prepare(`INSERT INTO imports(id,trip_id,user_id,source_type,status,source_fingerprint,recovery_action,created_at) VALUES (?,?,?,'forwarded_email',?,?,?,?)`).bind(importId,tripId,verified.user_id,status,fingerprint,parsed.unsupportedReason ?? 'Review extracted booking details before confirming.',now),
    env.DB.prepare(`INSERT INTO import_messages(id,import_id,sequence_no,sender,subject,normalized_hash,created_at) VALUES (?,?,1,?,?,?,?)`).bind(uuid(),importId,sender,subject,fingerprint,now),
  ];
  for (const candidate of parsed.candidates) {
    statements.push(env.DB.prepare(`INSERT INTO import_candidates(id,import_id,candidate_type,payload_json,confidence,validation_status,created_at) VALUES (?,?,?,?,?,'pending',?)`).bind(uuid(),importId,candidate.candidateType,JSON.stringify({...candidate.payload,warnings:candidate.warnings}),candidate.confidence,now));
  }
  statements.push(env.DB.prepare(`INSERT INTO inbound_booking_emails(id,user_id,trip_id,import_id,sender_normalized,message_fingerprint,subject,status,received_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(uuid(),verified.user_id,tripId,importId,sender,fingerprint,subject,status,now));
  await env.DB.batch(statements);
}

interface BookingWindow { start: string | null; end: string | null; title: string | null; }

// Reduce parsed candidates to a single date range + a human title. Flights use
// their departure/arrival local dates and destination airport; stays use their
// check-in/out dates and property name. Dates are the ISO date prefix only.
function deriveBookingWindow(parsed: { candidates: Array<{ candidateType: string; payload: Record<string, unknown> }> }): BookingWindow {
  let start: string | null = null, end: string | null = null, title: string | null = null;
  const consider = (value: unknown) => {
    const date = datePrefix(value);
    if (!date) return;
    if (!start || date < start) start = date;
    if (!end || date > end) end = date;
  };
  for (const candidate of parsed.candidates || []) {
    const payload = candidate.payload || {};
    if (candidate.candidateType === 'flight') {
      consider(payload.departureLocalDatetime); consider(payload.arrivalLocalDatetime);
      if (!title && payload.arrivalIata) title = `Trip to ${String(payload.arrivalIata)}`;
    } else if (candidate.candidateType === 'stay') {
      consider(payload.checkInDate); consider(payload.checkOutDate);
      if (!title && payload.propertyName) title = String(payload.propertyName);
    }
  }
  return { start, end, title };
}

function datePrefix(value: unknown): string | null {
  const match = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

// Unambiguous containment only: the booking date must fall within the trip's
// known bounds. Trips with no start date can't be matched (we won't guess).
function tripCoversDate(trip: { starts_on: string | null; ends_on: string | null }, date: string): boolean {
  if (!trip.starts_on) return false;
  const end = trip.ends_on || trip.starts_on;
  return trip.starts_on <= date && date <= end;
}

// Build (do not execute) the inserts for a fresh draft trip so a homeless
// booking is filed atomically with its import. Returns the new trip id plus the
// statements to fold into the caller's batch.
function buildDraftTrip(env: Env, userId: string, window: BookingWindow, now: number): { id: string; statements: ReturnType<Env['DB']['prepare']>[] } {
  const id = uuid();
  const title = (window.title || 'Imported trip').slice(0, 120);
  const startsOn = window.start, endsOn = window.end || window.start;
  return {
    id,
    statements: [
      env.DB.prepare(`INSERT INTO trips (id, owner_user_id, created_by_device_id, title, lifecycle_state, starts_on, ends_on, created_at, updated_at, version) VALUES (?, ?, NULL, ?, 'draft', ?, ?, ?, ?, 1)`).bind(id, userId, title, startsOn, endsOn, now, now),
      env.DB.prepare(`INSERT OR IGNORE INTO trip_members (trip_id,user_id,role,status,joined_at) VALUES (?,?,'owner','active',?)`).bind(id, userId, now),
    ],
  };
}

async function recordInbound(env:Env,input:{fingerprint:string;sender:string;subject:string|null;status:string;userId?:string;rejectionCode?:string}) {
  await env.DB.prepare(`INSERT INTO inbound_booking_emails(id,user_id,sender_normalized,message_fingerprint,subject,status,rejection_code,received_at) VALUES (?,?,?,?,?,?,?,?)`).bind(uuid(),input.userId ?? null,input.sender,input.fingerprint,input.subject,input.status,input.rejectionCode ?? null,nowMs()).run();
}
function normalizeAddress(value:string):string { const match=String(value||'').match(/<([^>]+)>/); return String(match?.[1] || value || '').trim().toLowerCase(); }
function headerValue(headers:Headers,name:string):string { return String(headers.get(name) || ''); }
async function readBounded(stream:ReadableStream<Uint8Array>,limit:number):Promise<Uint8Array>{const reader=stream.getReader(),chunks:Uint8Array[]=[];let total=0;for(;;){const {done,value}=await reader.read();if(done)break;if(!value)continue;total+=value.byteLength;if(total>limit)throw new Error('Inbound confirmation exceeds the safe size limit.');chunks.push(value);}const output=new Uint8Array(total);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.byteLength;}return output;}
async function digestHex(value:string):Promise<string>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
