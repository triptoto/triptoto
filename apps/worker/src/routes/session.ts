import type { Env } from '../types.ts';
import { enumValue, json, nowMs, optionalString, readJson, uuid } from '../http.ts';
import { issueSession } from '../auth.ts';

interface GuestBody {
  platform?: unknown;
  appVersion?: unknown;
  apiVersion?: unknown;
}

export async function createGuestSession(request: Request, env: Env): Promise<Response> {
  const body = await readJson<GuestBody>(request);
  const platform = enumValue(body.platform, 'platform', ['ios', 'android', 'web', 'unknown'] as const, 'unknown');
  const appVersion = optionalString(body.appVersion, 'appVersion', 50);
  const apiVersion = optionalString(body.apiVersion, 'apiVersion', 20) ?? 'v1';
  const deviceId = uuid();
  const now = nowMs();
  await env.DB.prepare(`INSERT INTO devices (id, user_id, platform, app_version, api_version, created_at, last_seen_at) VALUES (?, NULL, ?, ?, ?, ?, ?)`)
    .bind(deviceId, platform, appVersion, apiVersion, now, now).run();
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000;
  const token = await issueSession(env, { deviceId, exp: expiresAt });
  return json({ token, expiresAt, device: { id: deviceId, platform } }, { status: 201 }, request, env);
}
