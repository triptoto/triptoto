# SEO architecture

tripto.to is a client-rendered PWA. Only a handful of static pages are public;
everything else is a private, per-user app view. The setup keeps the public
pages discoverable and makes private data impossible to index.

## Single source of truth: `seo/site.json`

| Field | Used for |
| --- | --- |
| `pages[]` (`path`, `file`) | Worker routing of public pages, sitemap, IndexNow, `seo:check` |
| `appRoutes[]` | Worker app-shell routes (`APP_PATHS`, served with `X-Robots-Tag: noindex`) and robots.txt `Disallow` lines |
| `robotsDisallowExtra[]` | Extra robots.txt `Disallow` lines |
| `origin`, `productionHost`, `redirectHosts` | Canonical host, www → apex redirect, non-production noindex |
| `indexNowKey`, `indexNowEndpoints` | IndexNow key file and submissions (the key is public by design) |

`scripts/seo-build.mjs` (runs inside `npm run build:app-shell`) generates
`public/sitemap.xml`, `public/robots.txt`, `public/<key>.txt` and
`seo/manifest.json`. Never edit those by hand. `lastmod` only changes when a page's
content changes: the `?v=` tokens and `tripto-asset-ver` are stripped before
hashing.

## Route classes

| Class | Routes | Treatment |
| --- | --- | --- |
| A public, indexable | `/`, `/landing`, `/privacy`, `/terms`, `/cookies`, `/contact`, `/delete-account` | 200, `index, follow`, canonical, OG/Twitter, in sitemap, IndexNow |
| B public, noindex | `/404.html` (any unknown URL → real 404), `/index.html` (200 for the service worker, canonical → `/`) | 404 + noindex / canonical |
| C private | every `appRoutes` path and its sub-paths (`/trips/...`, `/join/<token>`, `/documents/...`) | app shell, `X-Robots-Tag: noindex, nofollow`, robots `Disallow` |
| D admin | `/api/v1/internal/...` | auth-gated API, noindex |
| E API | `/api/...`, `/health` | JSON, noindex. Deliberately **not** disallowed: blocking `/api/` makes Googlebot render `/` as "Trip data could not load" |

## Worker rules (`apps/worker/src/seo.ts`)

- `www.tripto.to` and `http://tripto.to` → one 301 (308 for non-GET) to
  `https://tripto.to` with the same path and query. No chains, no loops.
- `/landing/`, `/landing.html`, `/privacy/` and similar duplicates → 301 to the
  canonical path.
- A missing static file (`.png`, `.txt`, ...) returns a real 404, not the SPA
  shell with 200.
- On non-production hosts (`*.workers.dev`, preview, local), every response gets
  `X-Robots-Tag: noindex, nofollow`. robots.txt there allows crawling, so the
  noindex can be seen, and lists no sitemap.
- No locale URLs exist (the UI is English-only, translation is a client-side DOM
  swap), so there is no hreflang. When real locale pages ship, add them to
  `pages`, emit reciprocal `<link rel="alternate" hreflang>` plus `x-default`;
  `seo:check` already verifies reciprocity. Never redirect by browser language.

## Structured data

The only JSON-LD is on `/`: WebSite, Organization and WebApplication with a free
`Offer` (price 0, because the core app is free). There are no ratings, reviews or
paid prices. Keep it truthful: `seo:check` rejects `aggregateRating`, reviews and
non-zero prices.

## Webmaster verification

Set `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` and/or
`YANDEX_VERIFICATION` in `wrangler.jsonc` `vars` (production block) to the
code-only value. They are empty by default. The worker injects the matching
`<meta>` tag into the production home page only. Values are validated
(`[A-Za-z0-9_-]{6,128}`).

## IndexNow

- The key file is `https://tripto.to/<indexNowKey>.txt`.
- Only the production worker runs IndexNow (`INDEXNOW_ENABLED: "true"`; preview
  has `"false"`). The first request after a deploy checks `seo/manifest.json`
  against the hashes it already submitted and sends all changed public URLs in
  one request. The 30-minute cron is the fallback.
- State lives in `usage_counters` (`scope_id = 'seo:indexnow'`). There is no new
  table.
- Endpoints are tried in order (api.indexnow.org, Bing, Yandex); a 429/5xx/network
  error falls through to the next one.
- Failures back off (15 min, doubling, max 6 h) and retry automatically. They
  never affect serving or the deploy.
- `submittableUrls()` only lets through canonical public pages. Private, API,
  preview and foreign URLs are dropped.
- `npm run deploy:production` runs build, then `wrangler deploy`, then
  `npm run seo:indexnow -- --wait` and prints
  `IndexNow: SUCCESS | FAILED — retry available`.
- Manual retry from any machine: `npm run seo:indexnow -- --submit`.
- Status: `GET /api/v1/seo/indexnow` (public; lists only public URLs).

## Checks

`npm run seo:check` runs a 29-point suite against the real worker routing and
prints a PASS/FAIL table. It covers robots, sitemap, status codes, redirects,
canonicals, meta robots, OG/Twitter, JSON-LD, hreflang, no-JS crawlability,
internal links, private-route noindex, non-production noindex, IndexNow
key/filter/retry, verification and CSP. It runs inside `npm run check:ui` (and so
in CI).

## Adding a public page later

1. Create `public/<name>.html` with a unique title and description, a canonical
   link, `index, follow`, OG/Twitter tags and an `h1`.
2. Add `{ "path": "/<name>", "file": "<name>.html" }` to `seo/site.json`.
3. Link to it from at least one existing public page.
4. Run `npm run build:app-shell && npm run seo:check`, then deploy. The sitemap and
   IndexNow pick it up automatically.

Do not mass-generate pages and do not machine-translate them.
