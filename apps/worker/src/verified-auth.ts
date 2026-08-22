import type { Env } from './types.ts';
import { HttpError, nowMs, optionalString, uuid } from './http.ts';
import { issueSession } from './auth.ts';

export type VerifiedProvider = 'apple' | 'google' | 'email';

export interface VerifiedIdentityInput {
  provider: VerifiedProvider;
  providerSubject: string;
  email?: string | null;
  emailVerified: boolean;
  displayName?: string | null;
  locale?: string | null;
  timezone?: string | null;
  avatarUrl?: string | null;
}

export interface VerifiedLoginResult {
  token: string;
  expiresAt: number;
  userId: string;
  createdAccount: boolean;
  migratedTrips: number;
}

/**
 * Internal auth bridge.
 *
 * This MUST only be called after an external Apple/Google/email-code adapter has
 * cryptographically verified the identity. There is intentionally no public
 * route that accepts these fields directly from a browser.
 */
export async function completeVerifiedIdentityLogin(
  env: Env,
  deviceId: string,
  input: VerifiedIdentityInput,
): Promise<VerifiedLoginResult> {
  if (env.ACCOUNT_AUTH_ENABLED !== 'true') {
    throw new HttpError(503, 'ACCOUNT_AUTH_DISABLED', 'Verified account sign-in is not enabled in this environment.');
  }

  const provider = input.provider;
  const subject = normalizeSubject(input.providerSubject);
  const email = normalizeEmail(input.email);
  if (provider === 'email' && (!email || !input.emailVerified)) {
    throw new HttpError(400, 'VERIFIED_EMAIL_REQUIRED', 'Email sign-in requires a verified email address.');
  }
  if (email && !input.emailVerified) {
    throw new HttpError(400, 'UNVERIFIED_EMAIL', 'An unverified email cannot be attached to an account.');
  }

  const device = await env.DB.prepare(`SELECT id,user_id,revoked_at FROM devices WHERE id=?`)
    .bind(deviceId).first<{id:string;user_id:string|null;revoked_at:number|null}>();
  if (!device || device.revoked_at != null) throw new HttpError(401, 'INVALID_DEVICE', 'Device is unavailable.');

  const now = nowMs();
  const existingIdentity = await env.DB.prepare(`SELECT id,user_id,email,email_verified FROM auth_identities WHERE provider=? AND provider_subject=? LIMIT 1`)
    .bind(provider, subject).first<{id:string;user_id:string;email:string|null;email_verified:number}>();

  let userId: string;
  let createdAccount = false;
  const statements = [];

  if (existingIdentity) {
    userId = existingIdentity.user_id;
    const user = await env.DB.prepare(`SELECT id,deleted_at FROM users WHERE id=?`).bind(userId).first<{id:string;deleted_at:number|null}>();
    if (!user || user.deleted_at != null) throw new HttpError(409, 'IDENTITY_ACCOUNT_UNAVAILABLE', 'Verified identity points to an unavailable account.');
    if (device.user_id && device.user_id !== userId) throw new HttpError(409, 'DEVICE_ALREADY_LINKED', 'This device is already linked to another account.');

    statements.push(env.DB.prepare(`UPDATE auth_identities SET email=COALESCE(?,email),email_verified=CASE WHEN ?=1 THEN 1 ELSE email_verified END,last_used_at=? WHERE id=?`)
      .bind(email, input.emailVerified ? 1 : 0, now, existingIdentity.id));
    statements.push(userProfileStatement(env, userId, input, email, now));
  } else {
    if (device.user_id) {
      userId = device.user_id;
      const active = await env.DB.prepare(`SELECT id,deleted_at FROM users WHERE id=?`).bind(userId).first<{id:string;deleted_at:number|null}>();
      if (!active || active.deleted_at != null) throw new HttpError(409, 'DEVICE_ACCOUNT_UNAVAILABLE', 'The device account is unavailable.');
    } else {
      userId = uuid();
      createdAccount = true;
      statements.push(env.DB.prepare(`INSERT INTO users(id,display_name,primary_email,locale,timezone,avatar_url,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,1)`)
        .bind(
          userId,
          cleanOptional(input.displayName, 120),
          email,
          cleanOptional(input.locale, 40),
          cleanOptional(input.timezone, 80),
          cleanUrl(input.avatarUrl),
          now,
          now,
        ));
    }

    const identityId = uuid();
    statements.push(env.DB.prepare(`INSERT INTO auth_identities(id,user_id,provider,provider_subject,email,email_verified,created_at,last_used_at) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(identityId, userId, provider, subject, email, input.emailVerified ? 1 : 0, now, now));
    statements.push(env.DB.prepare(`INSERT INTO identity_events(id,user_id,device_id,event_type,metadata_json,created_at) VALUES (?,?,?,'identity_linked',?,?)`)
      .bind(uuid(), userId, deviceId, JSON.stringify({ provider }), now));
  }

  let migratedTrips = 0;
  if (!device.user_id) {
    const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM trips WHERE created_by_device_id=? AND owner_user_id IS NULL AND deleted_at IS NULL`).bind(deviceId).first<{count:number}>();
    migratedTrips = Number(count?.count ?? 0);
    statements.push(
      env.DB.prepare(`INSERT OR IGNORE INTO trip_members(trip_id,user_id,role,status,joined_at) SELECT id,?,'owner','active',? FROM trips WHERE created_by_device_id=? AND owner_user_id IS NULL AND deleted_at IS NULL`).bind(userId,now,deviceId),
      env.DB.prepare(`UPDATE trips SET owner_user_id=?,updated_at=?,version=version+1 WHERE created_by_device_id=? AND owner_user_id IS NULL AND deleted_at IS NULL`).bind(userId,now,deviceId),
      env.DB.prepare(`UPDATE imports SET user_id=? WHERE user_id IS NULL AND trip_id IN (SELECT id FROM trips WHERE created_by_device_id=?)`).bind(userId,deviceId),
      env.DB.prepare(`UPDATE sync_operations SET user_id=? WHERE user_id IS NULL AND device_id=?`).bind(userId,deviceId),
      env.DB.prepare(`UPDATE devices SET user_id=?,last_seen_at=? WHERE id=? AND user_id IS NULL`).bind(userId,now,deviceId),
      env.DB.prepare(`INSERT INTO identity_events(id,user_id,device_id,event_type,metadata_json,created_at) VALUES (?,?,?,'guest_migrated',?,?)`).bind(uuid(),userId,deviceId,JSON.stringify({migratedTrips}),now),
    );
  } else {
    statements.push(env.DB.prepare(`UPDATE devices SET last_seen_at=? WHERE id=?`).bind(now, deviceId));
  }

  try {
    await env.DB.batch(statements);
  } catch {
    throw new HttpError(409, 'IDENTITY_LINK_FAILED', 'Sign-in could not be completed safely. Please try again.');
  }

  const expiresAt = now + 90 * 24 * 60 * 60 * 1000;
  const token = await issueSession(env, { deviceId, userId, exp: expiresAt });
  return { token, expiresAt, userId, createdAccount, migratedTrips };
}

function userProfileStatement(env: Env, userId: string, input: VerifiedIdentityInput, email: string | null, now: number) {
  const displayName = cleanOptional(input.displayName, 120);
  const locale = cleanOptional(input.locale, 40);
  const timezone = cleanOptional(input.timezone, 80);
  return env.DB.prepare(`UPDATE users SET display_name=COALESCE(?,display_name),primary_email=COALESCE(?,primary_email),locale=COALESCE(?,locale),timezone=COALESCE(?,timezone),avatar_url=COALESCE(?,avatar_url),updated_at=?,version=version+1 WHERE id=? AND deleted_at IS NULL`)
    .bind(displayName, email, locale, timezone, cleanUrl(input.avatarUrl), now, userId);
}

function normalizeSubject(value: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, 'VERIFIED_SUBJECT_REQUIRED', 'Verified provider subject is required.');
  const out = value.trim();
  if (out.length > 300) throw new HttpError(400, 'VERIFIED_SUBJECT_INVALID', 'Verified provider subject is too long.');
  return out;
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  const out = optionalString(value, 'email', 254);
  if (!out || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out)) throw new HttpError(400, 'VERIFIED_EMAIL_INVALID', 'Verified email address is invalid.');
  return out.toLowerCase();
}

function cleanOptional(value: string | null | undefined, max: number): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return null;
  const out = value.trim();
  return out ? out.slice(0, max) : null;
}

function cleanUrl(value: string | null | undefined): string | null {
  const out = cleanOptional(value, 1000);
  if (!out) return null;
  try {
    const parsed = new URL(out);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch { return null; }
}
