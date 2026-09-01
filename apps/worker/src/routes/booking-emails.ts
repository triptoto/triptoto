import type { AuthContext, Env } from '../types.ts';
import { HttpError, json, nowMs, readJson, requireString } from '../http.ts';
import { requireTripAccess } from '../access.ts';

interface AssignBody { tripId?: unknown }

function requireAccount(auth: AuthContext): string {
  if (!auth.userId) throw new HttpError(403, 'ACCOUNT_REQUIRED', 'Sign in with Google to use the booking email inbox.');
  return auth.userId;
}

export async function listBookingEmails(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const userId = requireAccount(auth);
  const rows = (await env.DB.prepare(`
    SELECT e.id,e.trip_id,e.import_id,e.subject,e.status,e.rejection_code,e.received_at,
      t.title AS trip_title,i.status AS import_status,i.recovery_action,
      (SELECT COUNT(*) FROM import_candidates c WHERE c.import_id=e.import_id) AS candidate_count,
      (SELECT c.candidate_type FROM import_candidates c WHERE c.import_id=e.import_id ORDER BY c.created_at,c.id LIMIT 1) AS candidate_type
    FROM inbound_booking_emails e
    LEFT JOIN trips t ON t.id=e.trip_id AND t.deleted_at IS NULL
    LEFT JOIN imports i ON i.id=e.import_id
    WHERE e.user_id=?
    ORDER BY e.received_at DESC
    LIMIT 100
  `).bind(userId).all()).results ?? [];
  return json({ bookingEmails: rows }, {}, request, env);
}

export async function assignBookingEmail(request: Request, env: Env, auth: AuthContext, emailId: string): Promise<Response> {
  const userId = requireAccount(auth);
  const body = await readJson<AssignBody>(request, 8 * 1024);
  const tripId = requireString(body.tripId, 'tripId', 80);
  await requireTripAccess(env, auth, tripId, true);
  const email = await env.DB.prepare(`
    SELECT e.id,e.user_id,e.status,e.import_id,i.status AS import_status
    FROM inbound_booking_emails e
    LEFT JOIN imports i ON i.id=e.import_id
    WHERE e.id=? AND e.user_id=?
  `).bind(emailId, userId).first<{id:string;user_id:string;status:string;import_id:string|null;import_status:string|null}>();
  if (!email) throw new HttpError(404, 'BOOKING_EMAIL_NOT_FOUND', 'Booking email was not found.');
  if (!email.import_id) throw new HttpError(409, 'BOOKING_EMAIL_NOT_REVIEWABLE', 'This older email needs to be forwarded again so its booking details can be reviewed.');
  if (email.status !== 'needs_trip') {
    if (email.status === 'needs_confirmation' && email.import_status === 'needs_confirmation') {
      const assigned = await env.DB.prepare(`SELECT trip_id FROM inbound_booking_emails WHERE id=?`).bind(emailId).first<{trip_id:string|null}>();
      if (assigned?.trip_id === tripId) return json({ emailId, tripId, importId: email.import_id, status: 'needs_confirmation' }, {}, request, env);
    }
    throw new HttpError(409, 'BOOKING_EMAIL_ALREADY_ASSIGNED', 'This booking email has already been handled.');
  }
  const candidate = await env.DB.prepare(`SELECT id FROM import_candidates WHERE import_id=? AND validation_status='pending' LIMIT 1`).bind(email.import_id).first();
  if (!candidate) throw new HttpError(409, 'BOOKING_EMAIL_NOT_REVIEWABLE', 'No pending booking details are available to review.');
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE imports SET trip_id=? WHERE id=? AND user_id=? AND trip_id IS NULL AND status='needs_confirmation'`).bind(tripId,email.import_id,userId),
    env.DB.prepare(`UPDATE inbound_booking_emails SET trip_id=?,status='needs_confirmation',rejection_code=NULL WHERE id=? AND user_id=? AND status='needs_trip'`).bind(tripId,emailId,userId),
  ]);
  if (!results.every((result) => result.success && Number(result.meta?.changes ?? 0) === 1)) {
    throw new HttpError(409, 'BOOKING_EMAIL_ASSIGN_RACE', 'This booking email was changed on another device. Refresh and review its current state.');
  }
  return json({ emailId, tripId, importId: email.import_id, status: 'needs_confirmation' }, {}, request, env);
}

export async function dismissBookingEmail(request: Request, env: Env, auth: AuthContext, emailId: string): Promise<Response> {
  const userId = requireAccount(auth);
  const email = await env.DB.prepare(`SELECT e.id,e.status,e.import_id,i.status AS import_status FROM inbound_booking_emails e LEFT JOIN imports i ON i.id=e.import_id WHERE e.id=? AND e.user_id=?`).bind(emailId,userId).first<{id:string;status:string;import_id:string|null;import_status:string|null}>();
  if (!email) throw new HttpError(404, 'BOOKING_EMAIL_NOT_FOUND', 'Booking email was not found.');
  if (['completed','partial'].includes(String(email.import_status))) throw new HttpError(409, 'BOOKING_EMAIL_ALREADY_HANDLED', 'A completed booking email cannot be dismissed.');
  const statements = [env.DB.prepare(`UPDATE inbound_booking_emails SET status='rejected',rejection_code='USER_DISMISSED' WHERE id=? AND user_id=?`).bind(emailId,userId)];
  if (email.import_id) {
    statements.push(env.DB.prepare(`UPDATE import_candidates SET validation_status='rejected' WHERE import_id=? AND validation_status='pending'`).bind(email.import_id));
    statements.push(env.DB.prepare(`UPDATE imports SET status='unsupported',completed_at=? WHERE id=? AND user_id=? AND status IN ('received','processing','needs_confirmation')`).bind(nowMs(),email.import_id,userId));
  }
  await env.DB.batch(statements);
  return json({ dismissed: true, emailId }, {}, request, env);
}
