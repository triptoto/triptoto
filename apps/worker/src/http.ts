import type { Env } from './types.ts';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

const requestIds = new WeakMap<Request, string>();
const requestIdPattern = /^[A-Za-z0-9._:-]{8,80}$/;

export function requestId(request: Request): string {
  const cached = requestIds.get(request);
  if (cached) return cached;
  const supplied = request.headers.get('x-request-id')?.trim() ?? '';
  const id = requestIdPattern.test(supplied) ? supplied : crypto.randomUUID();
  requestIds.set(request, id);
  return id;
}

export function json(data: unknown, init: ResponseInit = {}, request?: Request, env?: Env): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  if (request) headers.set('x-request-id', requestId(request));
  if (request && env) applyCors(headers, request, env);
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(error: unknown, request: Request, env: Env): Response {
  const id = requestId(request);
  if (error instanceof HttpError) {
    const headers = new Headers();
    const retry = error.details && typeof error.details === 'object' && 'retryAfterSeconds' in error.details
      ? Number((error.details as {retryAfterSeconds?:unknown}).retryAfterSeconds)
      : NaN;
    if (error.status === 429 && Number.isFinite(retry) && retry > 0) headers.set('retry-after', String(Math.ceil(retry)));
    return json({ error: { code: error.code, message: error.message, details: error.details, requestId: id } }, { status: error.status, headers }, request, env);
  }
  console.error('Unhandled worker error', { requestId: id, error });
  return json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.', requestId: id } }, { status: 500 }, request, env);
}

export async function readJson<T>(request: Request, maxBytes = 64 * 1024): Promise<T> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) throw new HttpError(415, 'JSON_REQUIRED', 'Expected application/json request body.');
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, 'REQUEST_TOO_LARGE', `Request body exceeds the ${maxBytes} byte limit.`);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new HttpError(413, 'REQUEST_TOO_LARGE', `Request body exceeds the ${maxBytes} byte limit.`);
  try {
    return JSON.parse(raw) as T;
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
    headers.set('access-control-expose-headers', 'x-request-id,content-disposition');
    headers.set('vary', 'Origin');
  }
}

export function corsPreflight(request: Request, env: Env): Response {
  const headers = new Headers();
  applyCors(headers, request, env);
  headers.set('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  headers.set('access-control-allow-headers', 'authorization,content-type,x-api-version,x-tripto-demo-secret,x-tripto-ops-secret,x-request-id');
  headers.set('access-control-max-age', '600');
  return new Response(null, { status: 204, headers });
}
