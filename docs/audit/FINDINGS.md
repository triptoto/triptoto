# Production-readiness findings

Audit date: 2026-09-09. Status describes the prepared checkout, which has **not** been deployed by this audit.

| ID | Priority | Screen/file | Reproduction and actual result | Expected result | Root cause | Fix | Retest | Status |
|---|---|---|---|---|---|---|---|---|
| SEO-001 | P1 | Worker asset routing | Request an unknown path such as `/does-not-exist`; current production returns `200` with the SPA shell. | Unknown URLs return `404`; known private deep links remain usable. | `single-page-application` asset fallback handled every unknown path. | Added an `ASSETS` binding and Worker-first frontend router. It serves public pages/assets, serves known private routes with `X-Robots-Tag: noindex, nofollow`, and returns a non-cacheable `404` for unknown paths. | `frontend-routing.scenarios.ts`; Wrangler dry-run | FIXED, pending deploy |
| SEO-002 | P2 | `index.html` | View source before JS; the homepage had no static canonical link. | The indexable homepage exposes a canonical before hydration. | Canonical was created only by client JS. | Added `https://tripto.to/` canonical to source HTML. | `seo-release.contract.mjs` | FIXED, pending deploy |
| UI-001 | P2 | Initial shell/PWA | On a cold Night-theme launch, critical CSS and manifest declared the old light background. | First paint, install splash, and app UI use one Night canvas. | Old light tokens remained in critical HTML and manifest. | Updated critical paint and PWA colors to `#0f1f29`. | Browser capture and SEO release contract | FIXED, pending deploy |
| UI-002 | P2 | Homepage and legal pages | The design specifies Noto Sans, but its stylesheet was missing and the CSP blocked Google Fonts. | Noto Sans loads consistently, with a system fallback when offline. | Font tokens named Noto Sans without loading its font files. | Restored the Noto Sans stylesheet on app and legal pages and allowed its stylesheet/font origins in CSP. | Static contract and browser capture | FIXED, pending deploy |
| UI-003 | P2 | Privacy and Terms | Legal pages rendered in the retired light theme. | The product’s single Night theme applies consistently. | Legal pages had independent light-only tokens. | Converted legal-page metadata and tokens to Night. | 390px full-scroll browser captures | FIXED, pending deploy |
| QA-001 | P2 | Design audit harness | Popup automation clicked the retired `stop-menu`/`manage-booking` buttons and could not test the current long-press interaction. | QA performs the real touch gesture and follows current navigation. | Audit fixtures lagged behind the interaction contract. | Added CDP touch long-press and updated collection, booking, notification and delete flows. | Popup run: focus trap and Escape passed | FIXED |
| SEC-001 | P3 | Dependency audit | `npm audit --omit=dev` returns 401 from the configured Apple Artifactory. | Dependency advisory scan completes against an authenticated registry. | Local npm registry token is expired. | No credential was changed. Owner must refresh registry authentication or run the scan in CI. | Not available | BLOCKED |
| QA-002 | P3 | Production mutations | Destructive account deletion, real invitation/email delivery, and live notification delivery were not executed. | Validate externally in an isolated staging account before release. | Audit rules prohibit real data deletion and external messages. | Exact owner actions are in `RELEASE_CHECKLIST.md`. | Not available | BLOCKED |

## Findings by priority

| Priority | Found | Fixed | Blocked | Open product defects |
|---|---:|---:|---:|---:|
| P0 | 0 | 0 | 0 | 0 |
| P1 | 1 | 1 | 0 | 0 |
| P2 | 5 | 5 | 0 | 0 |
| P3 | 2 | 0 | 2 | 0 |

No error suppression, fake success state, paid service, analytics, production migration, or feature-flag activation was introduced.

---

## Update — audit pass 2026-09-10

This pass re-verified the prepared build against the **live edge** (`tripto-api.travelinkme.workers.dev`; the apex `tripto.to` is unreachable from the audit sandbox) and reviewed the current dirty worktree, which now contains in-flight work from **multiple concurrent sessions**.

| ID | Priority | Screen/file | Reproduction and actual result | Expected result | Root cause | Fix | Retest | Status |
|---|---|---|---|---|---|---|---|---|
| SEO-003 | P1 | `/privacy`, `/terms` (Cloudflare Assets) | Live `GET /privacy` and `/terms` returned an endless `307` loop (`Location: /privacy`), so both indexable legal pages never rendered. | Legal pages return `200 text/html`. | Worker rewrites `/privacy`→`/privacy.html`; Cloudflare Assets default `html_handling: auto-trailing-slash` then 307-redirected `/privacy.html` back to the pretty `/privacy`, fighting the rewrite forever. | Set `"html_handling": "none"` on the `assets` binding in `wrangler.jsonc`. | Live: `/privacy`, `/terms` → `200 text/html` (`<title>Privacy Policy · tripto.to</title>`). New guard in `seo-release.contract.mjs`. | FIXED, deployed |
| I18N-001 | P3 | Currency converter (`mobile-app.js` `currencyScreen`/input handler) | Amounts rendered locale-dependently (`US$125.00` instead of `$125.00`) because `Intl.NumberFormat(undefined,…)` follows the browser/runtime locale. | Deterministic English formatting (`$125.00`) matching the English-only UI. | Currency formatter passed `undefined` locale instead of the codebase's `en-US` convention. | Pinned `"en-US"` in both currency `Intl.NumberFormat` calls. | `currency.contract.mjs` → PASS. | FIXED, pending deploy |
| REL-001 | P1 | Release hygiene (worktree) | The checkout is dirty with several sessions' unfinished changes; a production release cut from it would ship half-built features. Two repo contracts are RED from other sessions' WIP (see REL-002, REL-003). | Release is cut from a reviewed, green commit. | Shared worktree used by concurrent sessions. | Not fixed here — cannot safely commit/revert other sessions' work. Owner must review the full diff and cut a clean release commit. | N/A | OPEN (owner) |
| REL-002 | P1 | `public/_headers` CSP + `trip-map.contract.mjs` | `trip-map.contract.mjs` fails: "CSP must not be loosened for external map hosts." CSP now allows `scripts.stay22.com`, `widgets.stay22.com`, `id.h2.stay22.com`, `www.stay22.com` (stay22 map/booking widget). | CSP stays closed to external map hosts; matches the "no map" product constraint. | Another session added a stay22 map widget and loosened CSP. | Not touched (other session's in-flight feature). Owner/that session must resolve the contract vs. the map-widget decision before release. | N/A | OPEN (other session) |
| REL-003 | P2 | Detail recovery nav + `detail-loading.contract.mjs` | `detail-loading.contract.mjs` fails: a confirmed-missing plan now recovers to `timeline`, the contract expects `planning`. | Behaviour and its contract agree. | Another session is consolidating detail-recovery routing (`planning`/`bookings` → `timeline`) but has not updated the contract. | Not touched (other session's in-flight refactor). Owner/that session must reconcile the contract. | N/A | OPEN (other session) |

### Contract suite snapshot (this pass)

`*.contract.mjs`: **24 PASS / 2 FAIL**. The 2 failures are REL-002 (`trip-map`) and REL-003 (`detail-loading`) — both caused by other sessions' uncommitted work, not by this audit's changes. `typecheck`, `seo-release.contract.mjs`, and `frontend-routing.scenarios.ts` all PASS.

No error suppression, weakened assertion, deleted test, fake data, paid service, analytics, or production migration was introduced in this pass.
