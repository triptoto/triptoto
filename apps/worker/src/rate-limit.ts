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

export async function enforcePublicRateLimit(request: Request, env: Env, spec: RateLimitSpec): Promise<void> {
  const scope = await publicScope(request, env);
  await increment(env, 'system', scope, spec);
}

async function increment(env: Env, scopeType: 'user'|'system', scopeId: string, spec: RateLimitSpec): Promise<void> {
  const now = nowMs();
  const start = Math.floor(now / spec.windowMs) * spec.windowMs;
  const periodKey = `rl:${spec.action}:${start}`;
  await env.DB.prepare(`INSERT INTO usage_counters(scope_type,scope_id,period_key,metric,value,updated_at) VALUES (?,?,?,?,1,?) ON CONFLICT(scope_type,scope_id,period_key,metric) DO UPDATE SET value=value+1,updated_at=excluded.updated_at`)
    .bind(scopeType, scopeId, periodKey, 'requests', now).run();
  const row = await env.DB.prepare(`SELECT value FROM usage_counters WHERE scope_type=? AND scope_id=? AND period_key=? AND metric='requests'`)
    .bind(scopeType, scopeId, periodKey).first<{value:number}>();
  const value = Number(row?.value ?? 0);
  if (value > spec.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((start + spec.windowMs - now) / 1000));
    throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Try again later.', { action: spec.action, limit: spec.limit, retryAfterSeconds });
  }
}

async function publicScope(request: Request, env: Env): Promise<string> {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new HttpError(503, 'SESSION_SECRET_NOT_CONFIGURED', 'Guest sessions are not configured yet.');
  const forwarded = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ua = (request.headers.get('user-agent') ?? '').slice(0, 160);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.SESSION_SECRET}|${forwarded}|${ua}`));
  return `public:${[...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}
