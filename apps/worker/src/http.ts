import type { Env } from './types.ts';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}, request?: Request, env?: Env): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  if (request && env) applyCors(headers, request, env);
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(error: unknown, request: Request, env: Env): Response {
  if (error instanceof HttpError) {
    return json({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status }, request, env);
  }
  console.error('Unhandled worker error', error);
  return json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' } }, { status: 500 }, request, env);
}

export async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) throw new HttpError(415, 'JSON_REQUIRED', 'Expected application/json request body.');
  try {
    return await request.json() as T;
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
}

export function requireString(value: unknown, name: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, 'VALIDATION_ERROR', `${name} is required.`);
  const out = value.trim();
  if (out.length > max) throw new HttpError(400, 'VALIDATION_ERROR', `${name} is too long.`);
  return out;
}

export function optionalString(value: unknown, name: string, max = 500): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'VALIDATION_ERROR', `${name} must be a string.`);
  const out = value.trim();
  if (out.length > max) throw new HttpError(400, 'VALIDATION_ERROR', `${name} is too long.`);
  return out || null;
}

export function optionalInteger(value: unknown, name: string): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new HttpError(400, 'VALIDATION_ERROR', `${name} must be an integer.`);
  return value;
}

export function enumValue<T extends string>(value: unknown, name: string, allowed: readonly T[], fallback?: T): T {
  if (value == null && fallback != null) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new HttpError(400, 'VALIDATION_ERROR', `${name} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function nowMs(): number {
  return Date.now();
}

export function applyCors(headers: Headers, request: Request, env: Env): void {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map(v => v.trim()).filter(Boolean);
  if (allowed.includes(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
}

export function corsPreflight(request: Request, env: Env): Response {
  const headers = new Headers();
  applyCors(headers, request, env);
  headers.set('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  headers.set('access-control-allow-headers', 'authorization,content-type,x-api-version');
  headers.set('access-control-max-age', '600');
  return new Response(null, { status: 204, headers });
}
