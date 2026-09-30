import type { AuthContext, Env } from './types.ts';
import { HttpError, nowMs } from './http.ts';

export interface RateLimitSpec {
  action: string;
  limit: number;
  windowMs: number;
}

export async function enforceActorRateLimit(env: Env, auth: AuthContext, spec: RateLimitSpec): Promise<void> {
  const actor = auth.userId ? `user:${auth.userId}` : `device:${auth.deviceId}`;
  await increment(env, 'user', actor, spec);
}

export async function enforcePublicRateLimit(request: Request, env: Env, spec: RateLimitSpec, options: { ipOnly?: boolean } = {}): Promise<void> {
  const scope = await publicScope(request, env, options.ipOnly === true);
  await increment(env, 'system', scope, spec);
}

export async function enforceGlobalRateLimit(env: Env, spec: RateLimitSpec): Promise<void> {
  await increment(env, 'system', `global:${spec.action}`, spec);
}

async function increment(env: Env, scopeType: 'user'|'system', scopeId: string, spec: RateLimitSpec): Promise<void> {
  const now = nowMs();
  const start = Math.floor(now / spec.windowMs) * spec.windowMs;
  const periodKey = `rl:${spec.action}:${start}`;
  // Single upsert-returning statement: atomically bump the window counter and read
  // back the new value in one round-trip (previously an INSERT then a SELECT).
  const row = await env.DB.prepare(`INSERT INTO usage_counters(scope_type,scope_id,period_key,metric,value,updated_at) VALUES (?,?,?,?,1,?) ON CONFLICT(scope_type,scope_id,period_key,metric) DO UPDATE SET value=value+1,updated_at=excluded.updated_at RETURNING value`)
    .bind(scopeType, scopeId, periodKey, 'requests', now).first<{value:number}>();
  const value = Number(row?.value ?? 0);
  if (value > spec.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((start + spec.windowMs - now) / 1000));
    throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Try again later.', { action: spec.action, limit: spec.limit, retryAfterSeconds });
  }
}

// Reclaim expired rate-limit windows. Every window in use is <= 1h, so rows not
// touched for 48h can never be re-read by increment() (a new window uses a new
// period_key) and only accrue storage. Called from the scheduled cron.
export async function pruneExpiredUsageCounters(env: Env, retentionMs = 48 * 60 * 60 * 1000): Promise<number> {
  const cutoff = nowMs() - retentionMs;
  const result = await env.DB.prepare(`DELETE FROM usage_counters WHERE updated_at < ?`).bind(cutoff).run();
  return Number((result.meta as { changes?: number } | undefined)?.changes ?? 0);
}

// ipOnly drops the user agent, which a client can rotate freely to escape the limit.
async function publicScope(request: Request, env: Env, ipOnly = false): Promise<string> {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new HttpError(503, 'SESSION_SECRET_NOT_CONFIGURED', 'Guest sessions are not configured yet.');
  // cf-connecting-ip is set by Cloudflare; x-forwarded-for is client-controlled.
  const forwarded = request.headers.get('cf-connecting-ip') || 'unknown';
  const ua = ipOnly ? '*' : (request.headers.get('user-agent') ?? '').slice(0, 160);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.SESSION_SECRET}|${forwarded}|${ua}`));
  return `public:${[...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}
