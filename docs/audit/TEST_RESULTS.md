# Test results and evidence

Audit date: 2026-09-09. Platform: macOS, Node 22-compatible project toolchain, Chrome Headless through CDP, local loopback-only preview. Production was queried read-only; no production mutation or deployment occurred.

## Automated checks

| Check | Result | Evidence |
|---|---|---|
| `npm run validate:candidate` baseline | PASS | Major scenarios, local D1 integration, 25 clean migrations, UI/PWA/offline/manual-booking contracts |
| `npm run typecheck` after fixes | PASS | TypeScript completed without diagnostics |
| `node tests/seo-release.contract.mjs` | PASS | Canonical, public metadata, Noto Sans, legal Night theme, sitemap and manifest |
| `node --import tsx/esm tests/frontend-routing.scenarios.ts` | PASS | Public pages, private deep links, HEAD, assets and unknown-route 404 |
| `npx wrangler deploy --dry-run --env="" --outdir /tmp/tripto-production-audit-dry-run-final` | PASS | 102 assets; Worker bundle accepts D1 and ASSETS bindings; no publication occurred |
| `git diff --check` | PASS | No whitespace errors |
| `npm audit --omit=dev` | BLOCKED | Apple Artifactory returned 401 because the local token is expired |

## Browser coverage

| Suite | Count | Result | What was checked |
|---|---:|---|---|
| Route/form templates | 59 | PASS | Every current screen and form template at 390 × 844, including full inner scroll |
| State variants | 47 | PASS | Empty, loading, error, offline, missing, role, collaboration, join and import variants |
| Popup/confirmation variants | 24 | PASS | Open path, viewport containment, focus containment, Escape, long content and destructive confirmation |
| Responsive matrix | 114 | PASS | 320, 360, 430, 768, 1024, 1440, 1920 widths and 844 × 390 landscape; no horizontal overflow or popup clipping |
| Saved screenshots | 505 | PASS | PNG evidence under `docs/audit/evidence/current/` |

The UI uses deterministic fixture travel data under `?preview=1`; no real travel record was changed. The matrix tests actual document viewports rather than scaling a phone mockup.

## Read-only production observations before this prepared build

| URL | Current HTTP | Observation |
|---|---:|---|
| `/`, `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml` | 200 | Public assets reachable over HTTPS |
| `/trips`, `/weather` | 200 | Private deep links reachable |
| `/does-not-exist` | 200 | Current production soft-404; fixed in prepared Worker, pending deploy |

## Security and privacy review

- CSP, HSTS, frame denial, MIME sniffing protection, referrer policy and restrictive permissions policy are present in `_headers`.
- Disabled integrations remain disabled: live flights, generative AI, Gmail sync, R2 documents, demo tools and ops.
- No secret value was printed or changed. `GOOGLE_CLIENT_ID` is a public OAuth client identifier; private secret material remains outside source.
- Local document behavior and collaboration authorization passed the existing integration/contract suites.
- Production account deletion, actual email delivery and real notifications were intentionally not executed.

## Limits

- Screenshot evidence proves the fixture flows and templates, not every production database record.
- Search Console indexing and rich-result state require the owner’s Google account after deployment.
- Dependency advisory status remains unknown until registry authentication is refreshed.
- A physical iPhone PWA cold-install test remains an owner post-deploy smoke step; Chrome emulation covered viewport and interaction geometry.

---

## Re-verification — 2026-09-10

Environment: audit sandbox. Real browser engines (Playwright/Chromium/WebKit) are **not available here**, and the apex `https://tripto.to` is network-blocked from the sandbox; live HTTP checks used the same Worker via its edge domain `https://tripto-api.travelinkme.workers.dev`. Browser-rendered visual/interaction coverage remains as recorded by the 2026-09-09 CDP run (505 screenshots under `docs/audit/evidence/`); this pass added static analysis + live HTTP evidence, not new browser captures.

### Automated checks (this pass)

| Check | Result | Evidence |
|---|---|---|
| `tsc --noEmit` | PASS | No diagnostics |
| `node tests/seo-release.contract.mjs` | PASS | Canonical/robots/OG/JSON-LD/Noto Sans/Night PWA + new `html_handling:"none"` guard |
| `node --import tsx/esm tests/frontend-routing.scenarios.ts` | PASS | Public, private deep-link, HEAD, asset, unknown-route 404 |
| `node tests/currency.contract.mjs` | PASS (was FAIL) | `en-US` pin makes `$125.00` deterministic |
| Full `*.contract.mjs` sweep | 24 PASS / 2 FAIL | Fails: `trip-map` (REL-002, other session), `detail-loading` (REL-003, other session) |

### Live edge HTTP evidence (`tripto-api.travelinkme.workers.dev`)

| URL | HTTP | Content-Type | X-Robots-Tag |
|---|---:|---|---|
| `/` | 200 | text/html | (indexable) |
| `/privacy` | 200 | text/html | (indexable) — was a 307 loop before SEO-003 |
| `/terms` | 200 | text/html | (indexable) — was a 307 loop before SEO-003 |
| `/robots.txt` | 200 | text/plain | — |
| `/sitemap.xml` | 200 | application/xml | — |
| `/health` | 200 | application/json | `ok:true`, `product-v2-production`, disabled integrations all `false` |
| `/trips/example-private` | 200 | text/html | `noindex, nofollow` |
| `/does-not-exist-<rand>` | 404 | text/plain | `noindex, nofollow` |

Homepage raw HTML (pre-JS) contains: unique `<title>`, `<meta name="robots" content="index, follow">`, `<link rel="canonical" href="https://tripto.to/">`, Open Graph tags, and `application/ld+json`. Soft-404 (SEO-001) and homepage canonical (SEO-002) are now confirmed **live**.

### Limits (this pass)

- No headless/real-browser engine in this sandbox: interaction, focus-trap, responsive-matrix and visual checks rely on the 2026-09-09 CDP evidence, not a fresh re-run.
- Apex `tripto.to` unreachable from sandbox; edge domain used as an equivalent origin (same Worker + assets).
- `npm audit --omit=dev` still BLOCKED (registry 401) — unchanged from prior pass.
