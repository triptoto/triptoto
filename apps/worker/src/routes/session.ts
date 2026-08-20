import type { AuthContext, Env } from '../types.ts';
import { HttpError, enumValue, json, nowMs, optionalString, readJson, uuid } from '../http.ts';
import { issueSession } from '../auth.ts';

interface GuestBody {
  platform?: unknown;
  appVersion?: unknown;
  apiVersion?: unknown;
  qaMarker?: unknown;
}

const SESSION_DAYS = 90;

export async function createGuestSession(request: Request, env: Env): Promise<Response> {
  const body = await readJson<GuestBody>(request);
  const platform = enumValue(body.platform, 'platform', ['ios', 'android', 'web', 'unknown'] as const, 'unknown');
  const appVersion = optionalString(body.appVersion, 'appVersion', 50);
  const apiVersion = optionalString(body.apiVersion, 'apiVersion', 20) ?? 'v1';
  const qaMarker = optionalString(body.qaMarker, 'qaMarker', 120);
  if (qaMarker && !/^qa:[a-z0-9][a-z0-9._:-]{7,119}$/i.test(qaMarker)) throw new HttpError(400,'INVALID_QA_MARKER','qaMarker must use the qa: namespace.');
  const qaAppVersions=new Set(['smoke','smoke-v1.1','smoke-v1.2','smoke-milestone-4','major-smoke']);
  if(qaMarker&&!qaAppVersions.has(appVersion??''))throw new HttpError(400,'QA_MARKER_NOT_ALLOWED','qaMarker is accepted only from repository smoke app versions.');
  const deviceId = uuid();
  const now = nowMs();
  await env.DB.prepare(`INSERT INTO devices (id, user_id, platform, app_version, api_version, qa_marker, created_at, last_seen_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`)
    .bind(deviceId, platform, appVersion, apiVersion, qaMarker??null, now, now).run();
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
