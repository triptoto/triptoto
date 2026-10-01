import type { Env } from './types.ts';
// seo/site.json is the single route manifest: the worker routes public pages and
// the private app shell from it, and scripts/seo-build.mjs generates robots.txt,
// sitemap.xml and seo/manifest.json from the same file.
import site from '../../../seo/site.json' with { type: 'json' };
import manifest from '../../../seo/manifest.json' with { type: 'json' };

export const SEO_SITE = site;
export const PUBLIC_PAGES = new Map(site.pages.map((page) => [page.path, page.file]));
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const APP_PATHS = [new RegExp(`^/(?:${site.appRoutes.map(escapeRegExp).join('|')})(?:/.*)?$`)];

const NOINDEX = 'noindex, nofollow';

export function isProductionHost(url: URL): boolean {
  return url.hostname === site.productionHost;
}

// www -> apex and http -> https in one hop, so no chain and no loop (the target is
// always the https apex, which never redirects). 308 keeps non-GET bodies intact.
export function canonicalHostRedirect(request: Request, url: URL): Response | null {
  const host = url.hostname.toLowerCase();
  const isRedirectHost = site.redirectHosts.includes(host);
  if (!isRedirectHost && !(host === site.productionHost && url.protocol === 'http:')) return null;
  const status = request.method === 'GET' || request.method === 'HEAD' ? 301 : 308;
  return new Response(null, { status, headers: { Location: `${site.origin}${url.pathname}${url.search}`, 'Cache-Control': 'public, max-age=3600' } });
}

// /landing/, /landing.html, /privacy/ ... are duplicates of the canonical path.
// /index.html keeps answering 200 (the service worker precaches it) and carries
// the canonical link to /.
export function publicPathRedirect(url: URL, path: string): Response | null {
  let target: string | null = null;
  if (PUBLIC_PAGES.has(path) && path !== '/' && url.pathname !== path) target = path;
  else target = site.pages.find((page) => page.path !== '/' && url.pathname === `/${page.file}`)?.path ?? null;
  if (!target) return null;
  return new Response(null, { status: 301, headers: { Location: `${target}${url.search}`, 'Cache-Control': 'public, max-age=3600' } });
}

// Non-production hosts (workers.dev, preview, local) are crawlable but never
// indexable: every response is noindex and robots.txt lists no sitemap. Crawling
// stays allowed so crawlers can actually see the noindex. On production, API and
// health responses are noindex too.
export function applyIndexingPolicy(url: URL, response: Response): Response {
  const path = url.pathname;
  const noindex = !isProductionHost(url) || path.startsWith('/api/') || path === '/health';
  if (!noindex || response.headers.get('X-Robots-Tag') === NOINDEX) return response;
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', NOINDEX);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function nonProductionRobots(request: Request): Response {
  const body = `# Non-production host. Nothing here is indexable; the canonical site is ${site.origin}/\nUser-agent: *\nDisallow:\n`;
  return new Response(request.method === 'HEAD' ? null : body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': NOINDEX } });
}

// Webmaster verification codes come from worker vars (empty by default) and are
// only emitted on the production home page. Values are validated so a bad var can
// never inject markup.
const VERIFICATION_TAGS: Array<[keyof Env, string]> = [
  ['GOOGLE_SITE_VERIFICATION', 'google-site-verification'],
  ['BING_SITE_VERIFICATION', 'msvalidate.01'],
  ['YANDEX_VERIFICATION', 'yandex-verification'],
];
export function siteVerificationMeta(env: Env): string {
  return VERIFICATION_TAGS.map(([key, name]) => {
    const value = String(env[key] ?? '').trim();
    return /^[A-Za-z0-9_-]{6,128}$/.test(value) ? `<meta name="${name}" content="${value}">` : '';
  }).join('');
}
export async function withSiteVerification(response: Response, env: Env): Promise<Response> {
  const meta = siteVerificationMeta(env);
  if (!meta || !(response.headers.get('Content-Type') ?? '').includes('text/html')) return response;
  const html = (await response.text()).replace('</head>', `${meta}</head>`);
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

// ---------------------------------------------------------------- IndexNow
// After a production deploy, every public page whose content hash (from
// seo/manifest.json) has not been submitted yet is sent to IndexNow in one
// request. State lives in usage_counters (scope system / seo:indexnow); page rows
// are re-touched every 12h so the 48h counter prune never drops them. Failures are
// retried with backoff by later checks and the cron; they never affect serving.
const STATE_SCOPE = 'seo:indexnow';
const LOCK_MS = 2 * 60 * 1000;
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;
const TOUCH_AFTER_MS = 12 * 60 * 60 * 1000;

export interface IndexNowResult { status: 'disabled' | 'up-to-date' | 'backoff' | 'locked' | 'success' | 'failed'; submitted?: string[]; httpStatus?: number }

// Only canonical public pages may ever be submitted: never private app routes,
// API URLs, previews or other hosts.
export function submittableUrls(urls: string[]): string[] {
  const allowed = new Set(site.pages.map((page) => site.origin + page.path));
  return [...new Set(urls)].filter((url) => allowed.has(url));
}

export function indexNowRequestBody(urls: string[]) {
  return { host: site.productionHost, key: site.indexNowKey, keyLocation: `${site.origin}/${site.indexNowKey}.txt`, urlList: submittableUrls(urls) };
}

// Every IndexNow endpoint shares submissions with the others, so one success is
// enough. A rate limit (429), server error or network error moves on to the next
// endpoint; a definitive rejection (400/403/422) stops.
export async function submitIndexNow(urls: string[], fetcher: typeof fetch = fetch): Promise<{ ok: boolean; httpStatus: number; endpoint?: string }> {
  const body = indexNowRequestBody(urls);
  if (!body.urlList.length) return { ok: true, httpStatus: 0 };
  let httpStatus = 0;
  for (const endpoint of site.indexNowEndpoints) {
    try {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      httpStatus = response.status;
      if (response.status === 200 || response.status === 202) return { ok: true, httpStatus, endpoint };
      if (response.status !== 429 && response.status < 500) return { ok: false, httpStatus, endpoint };
    } catch {
      httpStatus = 0;
    }
  }
  return { ok: false, httpStatus };
}

type StateRow = { period_key: string; value: number; updated_at: number };
const pageKey = (page: { path: string; hash: string }) => `page:${page.path}:${page.hash}`;

async function readState(env: Env): Promise<StateRow[]> {
  return ((await env.DB.prepare(`SELECT period_key,value,updated_at FROM usage_counters WHERE scope_type='system' AND scope_id=?`).bind(STATE_SCOPE).all<StateRow>()).results ?? []);
}
async function putState(env: Env, key: string, value: number, now: number): Promise<void> {
  await env.DB.prepare(`INSERT INTO usage_counters(scope_type,scope_id,period_key,metric,value,updated_at) VALUES ('system',?,?,'state',?,?) ON CONFLICT(scope_type,scope_id,period_key,metric) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
    .bind(STATE_SCOPE, key, value, now).run();
}

export async function indexNowStatus(env: Env) {
  const enabled = env.INDEXNOW_ENABLED === 'true';
  const rows = enabled ? await readState(env) : [];
  const byKey = new Map(rows.map((row) => [row.period_key, row]));
  const pending = manifest.pages.filter((page) => !byKey.has(pageKey(page))).map((page) => page.url);
  const failures = byKey.get('failures');
  return {
    enabled,
    pending,
    lastSuccessAt: byKey.get('last-success')?.updated_at ?? null,
    lastHttpStatus: byKey.get('last-status')?.value ?? null,
    consecutiveFailures: failures?.value ?? 0,
    lastFailureAt: failures && failures.value > 0 ? failures.updated_at : null,
  };
}

export async function runIndexNow(env: Env, options: { fetcher?: typeof fetch; now?: number } = {}): Promise<IndexNowResult> {
  if (env.INDEXNOW_ENABLED !== 'true' || !env.DB) return { status: 'disabled' };
  const now = options.now ?? Date.now();
  const rows = await readState(env);
  const byKey = new Map(rows.map((row) => [row.period_key, row]));
  if (rows.some((row) => row.period_key.startsWith('page:') && now - row.updated_at > TOUCH_AFTER_MS)) {
    await env.DB.prepare(`UPDATE usage_counters SET updated_at=? WHERE scope_type='system' AND scope_id=? AND period_key LIKE 'page:%'`).bind(now, STATE_SCOPE).run();
  }
  const pending = manifest.pages.filter((page) => !byKey.has(pageKey(page)));
  if (!pending.length) return { status: 'up-to-date' };
  const failures = byKey.get('failures');
  if (failures && failures.value > 0 && now - failures.updated_at < Math.min(MAX_BACKOFF_MS, 15 * 60 * 1000 * 2 ** (failures.value - 1))) return { status: 'backoff' };
  // One submitter at a time across isolates: the conditional upsert only wins
  // when there is no lock or it is older than LOCK_MS.
  const lock = await env.DB.prepare(`INSERT INTO usage_counters(scope_type,scope_id,period_key,metric,value,updated_at) VALUES ('system',?,'lock','state',0,?) ON CONFLICT(scope_type,scope_id,period_key,metric) DO UPDATE SET updated_at=excluded.updated_at WHERE usage_counters.updated_at < ? RETURNING value`)
    .bind(STATE_SCOPE, now, now - LOCK_MS).first();
  if (!lock) return { status: 'locked' };
  const urls = pending.map((page) => page.url);
  const result = await submitIndexNow(urls, options.fetcher);
  await putState(env, 'last-status', result.httpStatus, now);
  if (!result.ok) {
    await putState(env, 'failures', (failures?.value ?? 0) + 1, now);
    console.warn(`IndexNow: FAILED (HTTP ${result.httpStatus || 'network'}) for ${urls.length} URL(s); retry scheduled.`);
    return { status: 'failed', httpStatus: result.httpStatus };
  }
  for (const page of pending) await putState(env, pageKey(page), 1, now);
  const current = new Set(manifest.pages.map(pageKey));
  for (const row of rows) if (row.period_key.startsWith('page:') && !current.has(row.period_key)) {
    await env.DB.prepare(`DELETE FROM usage_counters WHERE scope_type='system' AND scope_id=? AND period_key=?`).bind(STATE_SCOPE, row.period_key).run();
  }
  await putState(env, 'failures', 0, now);
  await putState(env, 'last-success', urls.length, now);
  console.log(`IndexNow: SUCCESS (HTTP ${result.httpStatus} from ${result.endpoint}) for ${urls.length} URL(s).`);
  return { status: 'success', submitted: urls, httpStatus: result.httpStatus };
}

// Checked once per isolate, so the first request after a deploy submits the
// changed pages within seconds; the cron is the fallback.
let checkedThisIsolate = false;
export function maybeRunIndexNow(env: Env, ctx?: { waitUntil(promise: Promise<unknown>): void }): void {
  if (checkedThisIsolate || env.INDEXNOW_ENABLED !== 'true' || !ctx) return;
  checkedThisIsolate = true;
  ctx.waitUntil(runIndexNow(env).catch((error) => console.warn(`IndexNow: check failed: ${error instanceof Error ? error.message : 'unknown error'}`)));
}
