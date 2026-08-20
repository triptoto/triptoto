import type { AuthContext, Env } from './types.ts';
import { HttpError } from './http.ts';

interface SessionPayload {
  v: 1;
  deviceId: string;
  userId?: string;
  exp: number;
}

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function hmac(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return new Uint8Array(signature);
}

function secret(env: Env): string {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new HttpError(503, 'SESSION_SECRET_NOT_CONFIGURED', 'Guest sessions are not configured yet.');
  }
  return env.SESSION_SECRET;
}

export async function issueSession(env: Env, payload: Omit<SessionPayload, 'v'>): Promise<string> {
  const body = base64UrlEncode(encoder.encode(JSON.stringify({ ...payload, v: 1 } satisfies SessionPayload)));
  const signature = base64UrlEncode(await hmac(secret(env), body));
  return `${body}.${signature}`;
}

export async function requireAuth(request: Request, env: Env): Promise<AuthContext> {
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) throw new HttpError(401, 'AUTH_REQUIRED', 'A valid session is required.');
  const token = authorization.slice(7).trim();
  const [body, signature] = token.split('.');
  if (!body || !signature) throw new HttpError(401, 'INVALID_SESSION', 'Session token is invalid.');

  const expected = await hmac(secret(env), body);
  const supplied = base64UrlDecode(signature);
  if (supplied.length !== expected.length) throw new HttpError(401, 'INVALID_SESSION', 'Session token is invalid.');
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ supplied[i];
  if (diff !== 0) throw new HttpError(401, 'INVALID_SESSION', 'Session token is invalid.');

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as SessionPayload;
  } catch {
    throw new HttpError(401, 'INVALID_SESSION', 'Session token is invalid.');
  }
  if (payload.v !== 1 || !payload.deviceId || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) {
    throw new HttpError(401, 'SESSION_EXPIRED', 'Session has expired.');
  }

  const device = await env.DB.prepare('SELECT id, user_id, revoked_at FROM devices WHERE id = ?').bind(payload.deviceId).first<{ id: string; user_id: string | null; revoked_at: number | null }>();
  if (!device || device.revoked_at != null) throw new HttpError(401, 'INVALID_SESSION', 'Session device is unavailable.');
  if ((payload.userId ?? null) !== (device.user_id ?? null)) throw new HttpError(401, 'INVALID_SESSION', 'Session identity no longer matches the device.');
  return { deviceId: device.id, userId: device.user_id ?? undefined };
}
