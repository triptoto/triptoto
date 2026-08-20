import type { AuthContext, Env } from '../types.ts';
import { enumValue, json, nowMs, optionalString, readJson, uuid } from '../http.ts';
import { issueSession } from '../auth.ts';

interface GuestBody {
  platform?: unknown;
  appVersion?: unknown;
  apiVersion?: unknown;
}

const SESSION_DAYS = 90;

export async function createGuestSession(request: Request, env: Env): Promise<Response> {
  const body = await readJson<GuestBody>(request);
  const platform = enumValue(body.platform, 'platform', ['ios', 'android', 'web', 'unknown'] as const, 'unknown');
  const appVersion = optionalString(body.appVersion, 'appVersion', 50);
  const apiVersion = optionalString(body.apiVersion, 'apiVersion', 20) ?? 'v1';
  const deviceId = uuid();
  const now = nowMs();
  await env.DB.prepare(`INSERT INTO devices (id, user_id, platform, app_version, api_version, created_at, last_seen_at) VALUES (?, NULL, ?, ?, ?, ?, ?)`)
    .bind(deviceId, platform, appVersion, apiVersion, now, now).run();
  const expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const token = await issueSession(env, { deviceId, exp: expiresAt });
  return json({ token, expiresAt, device: { id: deviceId, platform }, refreshRecommendedAfter: now + 30 * 24 * 60 * 60 * 1000 }, { status: 201 }, request, env);
}

export async function refreshSession(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const now = nowMs();
  const expiresAt = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await env.DB.prepare(`UPDATE devices SET last_seen_at=? WHERE id=? AND revoked_at IS NULL`).bind(now,auth.deviceId).run();
  const token = await issueSession(env, { deviceId: auth.deviceId, userId: auth.userId, exp: expiresAt });
  return json({ token, expiresAt, accountMode: !!auth.userId }, {}, request, env);
}
