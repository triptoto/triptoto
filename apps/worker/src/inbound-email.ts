import type { Env } from './types.ts';
import { nowMs, uuid } from './http.ts';
import { parseForwardedEmail } from '../../../packages/importer/src/index.ts';
import { parseMime } from '../../../packages/importer/src/mime.ts';

export interface InboundEmailMessage {
  from: string;
  to: string;
  raw: ReadableStream<Uint8Array>;
  headers: Headers;
  setReject(reason: string): void;
}

// Hard cap on the raw payload we will buffer. Raised from the old 512KB, which
// rejected realistic confirmations (inline logos, PDFs, HTML). The raw is still
// bounded so memory can't blow up, and only a small, separately-bounded slice of
// extracted TEXT (see parseMime's MAX_TEXT_CHARS) ever reaches the parser —
// inline images and attachments are reduced to metadata, never parsed as text.
const MAX_BYTES = 5 * 1024 * 1024;

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

  // Parse the RFC822/MIME payload safely instead of treating it as plain text:
  // extract clean text (text/plain preferred, sanitized HTML fallback), subject,
  // sender and attachment metadata. HTML is never executed and no remote resource
  // is fetched. The extracted text is length-bounded inside parseMime.
  const mime = parseMime(new TextDecoder().decode(bytes));
  const subject = ((headerValue(message.headers, 'subject') || mime.subject || '').slice(0, 500)) || null;
  const cleanText = mime.text;

  // Feed CLEAN normalized booking text (not raw MIME) to the deterministic parser.
  const parsed = parseForwardedEmail({ sender, subject: subject || undefined, body: cleanText });

  // Content-based dedup fingerprint: sender + normalized booking text. Message-ID
  // is deliberately excluded because forwarding the same confirmation again
  // generates a new Message-ID. This ensures the same booking
  // twice never creates a second import or booking. message_fingerprint is UNIQUE.
  const fingerprint = await digestHex(`${sender}\n${parsed.normalizedText}`);
  const duplicate = await env.DB.prepare(`SELECT id FROM inbound_booking_emails WHERE message_fingerprint=?`).bind(fingerprint).first();
  if (duplicate) return;

  const verified = await env.DB.prepare(`SELECT user_id FROM verified_sender_emails WHERE email_normalized=? AND revoked_at IS NULL`).bind(sender).first<{user_id:string}>();
  if (!verified) {
    // Reject at SMTP so the sender receives a bounce (recoverable, not a silent
    // disappearance) directing them to verify the address in the app.
    message.setReject('Sender is not verified');
    return;
  }

  const bookingWindow = deriveBookingWindow(parsed);
  const signals = deriveMatchSignals(parsed);
  const now = nowMs();

  // Full eligible set (not just one) so a dated/destination-matched booking can be
  // associated deterministically instead of forcing exactly-one-eligible-trip.
  const trips = (await env.DB.prepare(`SELECT id, title, starts_on, ends_on FROM trips WHERE owner_user_id=? AND deleted_at IS NULL AND lifecycle_state IN ('active','upcoming','draft') ORDER BY CASE lifecycle_state WHEN 'active' THEN 0 WHEN 'upcoming' THEN 1 ELSE 2 END, COALESCE(starts_on,'9999-12-31') LIMIT 50`).bind(verified.user_id).all<TripRow>()).results ?? [];

  // Neighbour signal: existing airports/locations already on each trip.
  const locationsByTrip = await loadTripLocations(env, trips.map((trip) => trip.id));

  let tripId: string | null = null;

  // 1. Deterministic confidence match across dates, destination airport codes,
  //    place names and existing trip locations. Associate only a clear winner:
  //    a strong score AND a decisive margin over the runner-up. A genuinely
  //    ambiguous set is never guessed.
  const ranked = trips
    .map((trip) => ({ trip, score: scoreTripMatch(trip, bookingWindow, signals, locationsByTrip[trip.id]) }))
    .sort((a, b) => b.score - a.score);
  if (ranked.length && ranked[0].score >= 0.6 && (ranked.length === 1 || ranked[0].score - ranked[1].score >= 0.3)) {
    tripId = ranked[0].trip.id;
  }
  // 2. Exactly one eligible trip and nothing to disambiguate: attach to it.
  if (!tripId && trips.length === 1) tripId = trips[0].id;
  // Always persist the review package, even when the trip cannot be determined.
  // The inbox can then ask the traveler to choose a trip. Never create a trip or
  // booking from an email automatically: nothing reaches Timeline until the
  // traveler explicitly confirms the extracted candidate.
  const candidateRows = parsed.candidates.map((candidate) => ({ id: uuid(), candidate }));
  const importStatus = parsed.candidates.length ? 'needs_confirmation' : 'unsupported';
  const inboundStatus = parsed.candidates.length ? (tripId ? 'needs_confirmation' : 'needs_trip') : 'unsupported';
  const rejectionCode = !tripId && parsed.candidates.length
    ? (trips.length ? 'AMBIGUOUS_TRIP' : 'NO_ELIGIBLE_TRIP')
    : null;

  const importId = uuid();
  const statements = [
    env.DB.prepare(`INSERT INTO imports(id,trip_id,user_id,source_type,status,source_fingerprint,recovery_action,created_at) VALUES (?,?,?,'forwarded_email',?,?,?,?)`).bind(importId,tripId,verified.user_id,importStatus,fingerprint,parsed.unsupportedReason ?? 'Review extracted booking details before confirming.',now),
    env.DB.prepare(`INSERT INTO import_messages(id,import_id,sequence_no,sender,subject,normalized_hash,created_at) VALUES (?,?,1,?,?,?,?)`).bind(uuid(),importId,sender,subject,fingerprint,now),
  ];
  for (const row of candidateRows) {
    statements.push(env.DB.prepare(`INSERT INTO import_candidates(id,import_id,candidate_type,payload_json,confidence,validation_status,created_at) VALUES (?,?,?,?,?,'pending',?)`).bind(row.id,importId,row.candidate.candidateType,JSON.stringify({...row.candidate.payload,warnings:row.candidate.warnings}),row.candidate.confidence,now));
  }
  statements.push(env.DB.prepare(`INSERT INTO inbound_booking_emails(id,user_id,trip_id,import_id,sender_normalized,message_fingerprint,subject,status,rejection_code,received_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(uuid(),verified.user_id,tripId,importId,sender,fingerprint,subject,inboundStatus,rejectionCode,now));
  await env.DB.batch(statements);
}

interface TripRow { id: string; title: string | null; starts_on: string | null; ends_on: string | null; }
interface BookingWindow { start: string | null; end: string | null; title: string | null; }
interface MatchSignals { iatas: string[]; places: string[]; }
interface TripLocationSignal { iatas: Set<string>; names: string[]; }

// Reduce parsed candidates to a single date range + a human title across every
// supported booking type (flight, stay, transport, plan).
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
    } else {
      consider(payload.travelDate); consider(payload.planDate);
      if (!title && payload.title) title = String(payload.title);
    }
  }
  return { start, end, title };
}

// Destination signals used to match a booking to the right existing trip.
function deriveMatchSignals(parsed: { candidates: Array<{ candidateType: string; payload: Record<string, unknown> }> }): MatchSignals {
  const iatas = new Set<string>(), places = new Set<string>();
  const addPlace = (v: unknown) => { const s = String(v ?? '').trim(); if (s.length >= 3) places.add(s.toLowerCase()); };
  const addIata = (v: unknown) => { const s = String(v ?? '').trim().toUpperCase(); if (/^[A-Z]{3}$/.test(s)) iatas.add(s); };
  for (const candidate of parsed.candidates || []) {
    const p = candidate.payload || {};
    addIata(p.departureIata); addIata(p.arrivalIata);
    addPlace(p.propertyName); addPlace(p.address); addPlace(p.departureName); addPlace(p.arrivalName); addPlace(p.venue); addPlace(p.locationHint);
  }
  return { iatas: [...iatas], places: [...places] };
}

// Deterministic 0..~1.15 score. Dates dominate; destination/airport/name matches
// and title overlap add supporting evidence. No randomness, no guessing.
function scoreTripMatch(trip: TripRow, window: BookingWindow, signals: MatchSignals, locs: TripLocationSignal | undefined): number {
  let score = 0;
  if (window.start) {
    if (tripCoversDate(trip, window.start)) score += 0.6;
    else if (withinDays(trip, window.start, 3)) score += 0.3;
  }
  if (locs) {
    if (signals.iatas.some((code) => locs.iatas.has(code))) score += 0.4;
    else if (signals.places.some((place) => locs.names.some((name) => name.includes(place) || place.includes(name)))) score += 0.3;
  }
  const title = (trip.title || '').toLowerCase();
  if (title && signals.places.some((place) => title.includes(place) || place.includes(title))) score += 0.15;
  return score;
}

async function loadTripLocations(env: Env, tripIds: string[]): Promise<Record<string, TripLocationSignal>> {
  const out: Record<string, TripLocationSignal> = {};
  if (!tripIds.length) return out;
  const placeholders = tripIds.map(() => '?').join(',');
  const rows = (await env.DB.prepare(`SELECT tl.trip_id AS trip_id, l.iata_code AS iata_code, l.display_name AS display_name FROM trip_locations tl JOIN locations l ON l.id=tl.location_id WHERE tl.trip_id IN (${placeholders})`).bind(...tripIds).all<{trip_id:string;iata_code:string|null;display_name:string|null}>()).results ?? [];
  for (const row of rows) {
    const bucket = out[row.trip_id] ?? (out[row.trip_id] = { iatas: new Set(), names: [] });
    if (row.iata_code) bucket.iatas.add(row.iata_code.toUpperCase());
    if (row.display_name && row.display_name.trim().length >= 3) bucket.names.push(row.display_name.trim().toLowerCase());
  }
  return out;
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

function withinDays(trip: { starts_on: string | null; ends_on: string | null }, date: string, days: number): boolean {
  if (!trip.starts_on) return false;
  const end = trip.ends_on || trip.starts_on;
  const d = Date.parse(`${date}T00:00:00Z`);
  const lo = Date.parse(`${trip.starts_on}T00:00:00Z`) - days * 86400000;
  const hi = Date.parse(`${end}T00:00:00Z`) + days * 86400000;
  return Number.isFinite(d) && d >= lo && d <= hi;
}

function normalizeAddress(value:string):string { const match=String(value||'').match(/<([^>]+)>/); return String(match?.[1] || value || '').trim().toLowerCase(); }
function headerValue(headers:Headers,name:string):string { return String(headers.get(name) || ''); }
async function readBounded(stream:ReadableStream<Uint8Array>,limit:number):Promise<Uint8Array>{const reader=stream.getReader(),chunks:Uint8Array[]=[];let total=0;for(;;){const {done,value}=await reader.read();if(done)break;if(!value)continue;total+=value.byteLength;if(total>limit)throw new Error('Inbound confirmation exceeds the safe size limit.');chunks.push(value);}const output=new Uint8Array(total);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.byteLength;}return output;}
async function digestHex(value:string):Promise<string>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
