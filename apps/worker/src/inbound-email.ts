import type { Env } from './types.ts';
import { nowMs, uuid } from './http.ts';
import { parseForwardedEmail } from '../../../packages/importer/src/index.ts';

export interface InboundEmailMessage {
  from: string;
  to: string;
  raw: ReadableStream<Uint8Array>;
  headers: Headers;
  setReject(reason: string): void;
}

const MAX_BYTES = 512 * 1024;

export async function receiveBookingEmail(message: InboundEmailMessage, env: Env): Promise<void> {
  const recipient = normalizeAddress(message.to);
  if (recipient !== 'bookings@tripto.to') {
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
  const trips = (await env.DB.prepare(`SELECT id FROM trips WHERE owner_user_id=? AND deleted_at IS NULL AND lifecycle_state IN ('active','upcoming','draft') ORDER BY CASE lifecycle_state WHEN 'active' THEN 0 WHEN 'upcoming' THEN 1 ELSE 2 END, COALESCE(starts_on,'9999-12-31') LIMIT 3`).bind(verified.user_id).all<{id:string}>()).results ?? [];
  if (trips.length !== 1) {
    await recordInbound(env,{fingerprint,sender,subject,status:'needs_trip',userId:verified.user_id,rejectionCode:trips.length ? 'AMBIGUOUS_TRIP' : 'NO_ELIGIBLE_TRIP'});
    return;
  }
  const parsed = parseForwardedEmail({sender,subject:subject || undefined,body:raw});
  const now = nowMs(), tripId = trips[0].id, importId = uuid();
  const status = parsed.candidates.length ? 'needs_confirmation' : 'unsupported';
  const statements = [
    env.DB.prepare(`INSERT INTO imports(id,trip_id,user_id,source_type,status,source_fingerprint,recovery_action,created_at) VALUES (?,?,?,'forwarded_email',?,?,?,?)`).bind(importId,tripId,verified.user_id,status,fingerprint,parsed.unsupportedReason ?? 'Review extracted booking details before confirming.',now),
    env.DB.prepare(`INSERT INTO import_messages(id,import_id,sequence_no,sender,subject,normalized_hash,created_at) VALUES (?,?,1,?,?,?,?)`).bind(uuid(),importId,sender,subject,fingerprint,now),
  ];
  for (const candidate of parsed.candidates) {
    statements.push(env.DB.prepare(`INSERT INTO import_candidates(id,import_id,candidate_type,payload_json,confidence,validation_status,created_at) VALUES (?,?,?,?,?,'pending',?)`).bind(uuid(),importId,candidate.candidateType,JSON.stringify({...candidate.payload,warnings:candidate.warnings}),candidate.confidence,now));
  }
  statements.push(env.DB.prepare(`INSERT INTO inbound_booking_emails(id,user_id,trip_id,import_id,sender_normalized,message_fingerprint,subject,status,received_at) VALUES (?,?,?,?,?,?,?,?,?)`).bind(uuid(),verified.user_id,tripId,importId,sender,fingerprint,subject,status,now));
  await env.DB.batch(statements);
}

async function recordInbound(env:Env,input:{fingerprint:string;sender:string;subject:string|null;status:string;userId?:string;rejectionCode?:string}) {
  await env.DB.prepare(`INSERT INTO inbound_booking_emails(id,user_id,sender_normalized,message_fingerprint,subject,status,rejection_code,received_at) VALUES (?,?,?,?,?,?,?,?)`).bind(uuid(),input.userId ?? null,input.sender,input.fingerprint,input.subject,input.status,input.rejectionCode ?? null,nowMs()).run();
}
function normalizeAddress(value:string):string { const match=String(value||'').match(/<([^>]+)>/); return String(match?.[1] || value || '').trim().toLowerCase(); }
function headerValue(headers:Headers,name:string):string { return String(headers.get(name) || ''); }
async function readBounded(stream:ReadableStream<Uint8Array>,limit:number):Promise<Uint8Array>{const reader=stream.getReader(),chunks:Uint8Array[]=[];let total=0;for(;;){const {done,value}=await reader.read();if(done)break;if(!value)continue;total+=value.byteLength;if(total>limit)throw new Error('Inbound confirmation exceeds the safe size limit.');chunks.push(value);}const output=new Uint8Array(total);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.byteLength;}return output;}
async function digestHex(value:string):Promise<string>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
