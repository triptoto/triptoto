import type { AuthContext, Env } from '../types.ts';
import { HttpError, json, nowMs, uuid } from '../http.ts';

type Subject = { type: 'user' | 'device'; id: string };
type StoredSubscription = {
  status: string;
  plan: string;
  renews_at: number | null;
  ends_at: number | null;
  customer_portal_url: string | null;
};
type LifetimeGrant = { id: string };

const ACCESS_STATUSES = new Set(['active', 'on_trial', 'cancelled', 'past_due']);

function subjectFor(auth: AuthContext): Subject {
  return auth.userId ? { type: 'user', id: auth.userId } : { type: 'device', id: auth.deviceId };
}

export function subscriptionSubject(auth: AuthContext): string {
  const subject = subjectFor(auth);
  return `${subject.type === 'user' ? 'u' : 'd'}:${subject.id}`;
}

function hasAccess(row: StoredSubscription | null, now = nowMs()): boolean {
  if (!row || !ACCESS_STATUSES.has(row.status)) return false;
  return row.ends_at == null || Number(row.ends_at) > now;
}

export async function hasTriptoPlus(env: Env, auth: AuthContext): Promise<boolean> {
  const subject = subjectFor(auth);
  if (subject.type === 'user' && await hasLifetimeGrant(env, subject.id)) return true;
  const row = await env.DB.prepare(`SELECT status,plan,renews_at,ends_at,customer_portal_url FROM tripto_plus_subscriptions WHERE subject_type=? AND subject_id=? ORDER BY updated_at DESC LIMIT 1`)
    .bind(subject.type, subject.id).first<StoredSubscription>();
  return hasAccess(row);
}

export async function subscriptionStatus(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const subject = subjectFor(auth);
  if (subject.type === 'user' && await hasLifetimeGrant(env, subject.id)) {
    return json({
      subscription: {
        active: true,
        plan: 'lifetime',
        status: 'lifetime',
        renewsAt: null,
        endsAt: null,
        customerPortalUrl: null,
        checkoutSubject: subscriptionSubject(auth),
      },
    }, {}, request, env);
  }
  const subscription = await env.DB.prepare(`SELECT status,plan,renews_at,ends_at,customer_portal_url FROM tripto_plus_subscriptions WHERE subject_type=? AND subject_id=? ORDER BY updated_at DESC LIMIT 1`)
    .bind(subject.type, subject.id).first<StoredSubscription>();
  const active = hasAccess(subscription);
  return json({
    subscription: {
      active,
      plan: active ? subscription?.plan ?? null : null,
      status: subscription?.status ?? 'free',
      renewsAt: active ? subscription?.renews_at ?? null : null,
      endsAt: active ? subscription?.ends_at ?? null : null,
      customerPortalUrl: active ? subscription?.customer_portal_url ?? null : null,
      checkoutSubject: subscriptionSubject(auth),
    },
  }, {}, request, env);
}

async function hasLifetimeGrant(env: Env, userId: string): Promise<boolean> {
  const grant = await env.DB.prepare('SELECT id FROM tripto_plus_lifetime_grants WHERE user_id=? AND revoked_at IS NULL LIMIT 1')
    .bind(userId).first<LifetimeGrant>();
  return !!grant;
}

export async function lemonSqueezyWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.LEMONSQUEEZY_WEBHOOK_SECRET) throw new HttpError(503, 'BILLING_NOT_CONFIGURED', 'Billing webhook is not configured.');
  const raw = await request.text();
  const signature = request.headers.get('x-signature') ?? '';
  if (!raw || !signature || !(await validSignature(raw, signature, env.LEMONSQUEEZY_WEBHOOK_SECRET))) {
    throw new HttpError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Webhook signature is invalid.');
  }
  let payload: any;
  try { payload = JSON.parse(raw); } catch (_) { throw new HttpError(400, 'INVALID_WEBHOOK', 'Webhook payload is not valid JSON.'); }
  const eventName = String(payload?.meta?.event_name ?? request.headers.get('x-event-name') ?? '');
  if (!eventName.startsWith('subscription_')) return json({ received: true, ignored: true }, { status: 202 }, request, env);
  const data = payload?.data;
  // subscription_payment_* events carry an invoice, not a subscription; storing it
  // as a subscription row (status "paid") would shadow the real one and drop access.
  if (String(data?.type ?? 'subscriptions') !== 'subscriptions') return json({ received: true, ignored: true }, { status: 202 }, request, env);
  const attributes = data?.attributes;
  const providerId = String(data?.id ?? '');
  const subject = parseSubject(payload?.meta?.custom_data?.tripto_subject);
  if (!providerId || !attributes || !subject) return json({ received: true, ignored: true }, { status: 202 }, request, env);
  const fingerprint = await sha256(`${eventName}:${providerId}:${String(attributes.updated_at ?? '')}:${raw}`);
  const now = nowMs();
  const duplicate = await env.DB.prepare('SELECT event_fingerprint FROM tripto_plus_webhook_events WHERE event_fingerprint=?').bind(fingerprint).first();
  if (duplicate) return json({ received: true, duplicate: true }, {}, request, env);
  const plan = planFor(attributes, payload?.meta?.custom_data?.tripto_plan);
  const status = String(attributes.status ?? (eventName === 'subscription_expired' ? 'expired' : 'inactive'));
  const endsAt = timestamp(attributes.ends_at);
  const renewsAt = timestamp(attributes.renews_at);
  const providerUpdatedAt = timestamp(attributes.updated_at) ?? now;
  const portal = stringOrNull(attributes?.urls?.customer_portal);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO tripto_plus_subscriptions(id,subject_type,subject_id,provider_subscription_id,provider_customer_id,plan,status,renews_at,ends_at,customer_portal_url,provider_updated_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(provider_subscription_id) DO UPDATE SET
        subject_type=CASE WHEN tripto_plus_subscriptions.subject_type='user' THEN 'user' ELSE excluded.subject_type END,
        subject_id=CASE WHEN tripto_plus_subscriptions.subject_type='user' THEN tripto_plus_subscriptions.subject_id ELSE excluded.subject_id END,plan=excluded.plan,status=excluded.status,renews_at=excluded.renews_at,ends_at=excluded.ends_at,customer_portal_url=excluded.customer_portal_url,provider_updated_at=excluded.provider_updated_at,updated_at=excluded.updated_at
      WHERE excluded.provider_updated_at>=tripto_plus_subscriptions.provider_updated_at`)
      .bind(uuid(), subject.type, subject.id, providerId, stringOrNull(attributes.customer_id), plan, status, renewsAt, endsAt, portal, providerUpdatedAt, now, now),
    env.DB.prepare('INSERT INTO tripto_plus_webhook_events(event_fingerprint,event_name,provider_subscription_id,received_at) VALUES (?,?,?,?)').bind(fingerprint, eventName, providerId, now),
  ]);
  return json({ received: true }, {}, request, env);
}

function planFor(attributes: any, customPlan: unknown): 'month' | 'year' {
  if (customPlan === 'month' || customPlan === 'year') return customPlan;
  const interval = String(attributes?.billing_interval ?? '').toLowerCase();
  const count = Number(attributes?.billing_interval_count ?? 1);
  return interval === 'year' || count >= 12 ? 'year' : 'month';
}
function parseSubject(value: unknown): Subject | null {
  const raw = typeof value === 'string' ? value : '';
  const match = raw.match(/^([ud]):([0-9a-f-]{16,80})$/i);
  if (!match) return null;
  return { type: match[1].toLowerCase() === 'u' ? 'user' : 'device', id: match[2] };
}
function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function stringOrNull(value: unknown): string | null { return typeof value === 'string' && value.length <= 2000 ? value : null; }
async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function validSignature(body: string, supplied: string, secret: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(supplied)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  const expected = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ supplied.toLowerCase().charCodeAt(index);
  return difference === 0;
}
