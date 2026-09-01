# tripto.to — Historical full product QA record

This file records the QA state before the single production design was consolidated. It is retained as an engineering audit, not as a visual or navigation specification. The current source of truth is `PRODUCTION_DESIGN.md`, including the `Trip | Alerts | + | To-do | Account` menu.

Status: complete. Branch `qa-full-product-code-design`. All validation suites green
(`validate:beta`, `validate:v2`, `validate:major`, `validate:manual-booking`, `validate:places`).

## 1. Scope

Deep review of the shipped Product V2 surface with a fix pass, not a redesign. Preserved
the product architecture (Welcome, Sign In, Create Trip, Add Booking, Timeline-first,
Trip Timeline, Manual Add, Tickets & Documents, contextual Trip Map, Weather, and multiple
trips). Improvements were limited to defects QA found:
correctness, data integrity, offline resilience, and accessibility.

Areas covered: worker routes and data integrity (D1, batching, dedup, idempotency), inbound
email pipeline, service worker / offline model, client rendering and action dispatch,
accessibility (labels, form errors, contrast, touch targets), security/privacy posture, and
the mobile design system.

### Environment limitation
Live browser and screenshot QA of authenticated screens was **not possible from the review
sandbox**: network egress is blocked (curl to the live origin and a local static server both
return HTTP 000) and authenticated screens require real Google OAuth. Authenticated visual
verification therefore relied on static analysis plus the contract, integration, and scenario
suites, which exercise the backend and DOM/CSS contracts directly. Design items that need a
live render to judge safely are documented rather than changed blind.

## 2. Architecture (as reviewed)

- **Frontend**: single-file PWA shell (`public/mobile-app.js` + `mobile-app.css`), delegated
  action dispatch, `localStorage`/IndexedDB offline caches, service worker (`public/sw.js`).
- **Freshness model**: assets are cache-busted by `?v=...` query strings in `index.html`;
  the SW `CACHE` constant is a **stable namespace** (`tripto-shell-product-v2-manual-booking-v2`),
  frozen by contract tests — it must not be bumped per deploy.
- **Backend**: Cloudflare Worker `tripto-api` over D1 (`tripto-db`). `env.DB.batch([...])` is
  atomic per batch. `result.meta.changes` is used for claim-gate concurrency patterns.
- **Imports**: `imports` has a global `UNIQUE(source_type, source_fingerprint)`. Forwarded
  email fingerprints are trip-scoped by construction; upload fingerprints now are too (QA-002).
- **Design language at audit time**: a monochrome grayscale predecessor. It has since been
  replaced by the single coral production palette documented in `PRODUCTION_DESIGN.md`.

## 3. Findings

Severity: P0 blocker, P1 must-fix before release, P2 high-value, P3 polish/backlog.

| ID | Area | Severity | Status | Summary |
|----|------|----------|--------|---------|
| QA-001 | Offline/SW | P1 | Fixed | Deploy ritual had rewritten the frozen SW `CACHE` constant; reverted to the stable namespace so `validate:v2` and the freshness model hold. |
| QA-002 | Data integrity | P1 | Fixed | Upload dedup was not trip-scoped: bare-`checksum` fingerprint + global `UNIQUE` + untrip-scoped `SELECT` could read another owner's import and block/collide across tenants. Fingerprint now namespaced by trip; `SELECT` scoped by `trip_id`. |
| QA-003 | Data integrity | P2 | Fixed | Import candidate resolve was not idempotent — a double-confirm could materialize two bookings. Reordered so the `pending→confirmed` flip is the atomic claim gate (checks `meta.changes`), with revert-to-`pending` on materialize failure. |
| QA-004 | Data integrity | P2 | Fixed | Inbound-email auto-created draft trip ran its own `env.DB.batch`, separate from the import batch — a partial failure could orphan a draft that reprocessing duplicates. Draft inserts now fold into the single import batch (atomic). |
| QA-005 | Consistency | P3 | Fixed | Inbound-email hardcoded the active-trip cap `10`; now uses `PRODUCT_LIMITS.activeTripsPerAccount`. |
| QA-006 | Accessibility | P2 | Fixed | `showFieldError()` injected a `role="alert"` `.field-error` span and `aria-invalid`, but neither was styled — validation errors were visually invisible. Added `.field-error` and `[aria-invalid="true"]` rules. |
| QA-007 | Offline/SW | P2 | Fixed | SW `install` used atomic `cache.addAll` over 21 assets; one renamed/404 asset during a deploy failed the whole install and silently dropped the offline shell. Switched to best-effort `Promise.allSettled(cache.add)`. |
| QA-008 | Accessibility | P2 | Fixed | Documents trip-menu entry lacked an accessible name; added `aria-label="Tickets and documents"`. |
| QA-009 | Data integrity | P2 | Documented | Trip/traveler/checklist create POSTs lack server-side idempotency (only manual-booking creates honor `idempotency-key`). A client header would be a no-op; a correct fix needs claim logic on three core create paths — deferred as higher-risk than the low-frequency trigger (client abort after server success). |
| QA-010 | Offline/SW | P3 | Documented | SW shell precache uses bare paths while the page requests versioned `?v=` URLs and the shell lookup has no `ignoreSearch`, so precache entries are not matched (runtime cache still covers the first online load). Not fixed with `ignoreSearch` — that would break the query-string freshness contract; recommend precaching exact versioned URLs from the build. |
| QA-011 | Navigation | P3 | Documented | Bottom sheets and the document-viewer overlay don't push history; browser/OS Back closes the sheet *and* navigates the underlying screen, and the viewer overlay can persist over a navigated screen. Recommend `pushState` sheet markers + `closeDocumentViewer()` on `popstate`. |
| QA-012 | Rendering | P3 | Documented | Timeline day-grouping compares only against the last group and trusts server sort order; an out-of-order payload would duplicate day headers. Recommend a client sort by `starts_at_utc` before grouping. |
| QA-013 | Dead code | P3 | Documented | Action handlers `share-flight`, `export-trip`, `apply-date-suggestion`, `download-missing`, `remove-local-data` are never rendered. Recommend removal. |
| QA-014 | Accessibility | P2 | Documented | `--muted-soft` (`#9aa1a8`) is ~2.6:1 on the paper background — below WCAG AA for the small informational captions that use it. It is the softest tier of the monochrome palette; raising it to AA collapses it into `--muted` (4.9:1). Recommend a dedicated accessible caption token or repointing captions to `--muted`; not changed blind. |
| QA-015 | Accessibility | P3 | Documented | Some interactive controls sit below the app's own 44px target (trip-map day 36px, account sign-out 38px, active sign-out 40px, attachment-type select 32px). All pass WCAG 2.5.8 AA (24px) but under the 44px AAA aim; layout-sensitive, deferred pending visual verification. |

## 4. Fixes applied

- **QA-002** `apps/worker/src/routes/imports.ts` — `previewUploadedDocument`: `scopedChecksum =
  \`${tripId}:${checksum}\``; the duplicate `SELECT` adds `AND trip_id=?` and binds trip-scoped
  patterns; `add_anyway` fingerprints keep the trip prefix. Mirrors the email path; no schema
  change (old bare-checksum rows simply miss dedup once, harmless).
- **QA-003** `apps/worker/src/routes/imports.ts` — `resolveImportCandidate`: the status flip is
  now the atomic claim (`UPDATE ... WHERE id=? AND validation_status='pending'`, guarded by
  `meta.changes===1` → 409 `IMPORT_ALREADY_RESOLVED`); materialize runs inside `try`, and a
  failure reverts the candidate to `pending` so it stays retryable.
- **QA-004 / QA-005** `apps/worker/src/inbound-email.ts` — `createDraftTrip` became the pure
  `buildDraftTrip` returning `{id, statements}`; those statements are spread into the single
  import batch. Trip cap uses `PRODUCT_LIMITS.activeTripsPerAccount`.
- **QA-006** `public/mobile-app.css` — added `.field-error` and `[aria-invalid="true"]` rules.
- **QA-007** `public/sw.js` — `install` uses `Promise.allSettled(ASSETS.map(a => cache.add(a)))`.
- **QA-001 / QA-008** — SW cache constant reverted to the frozen namespace; Documents menu entry
  given an accessible name (both verified by contract tests).

## 5. Tests added / status

- `tests/integration/local-d1.integration.mjs` — behavioral regressions:
  - QA-002: the same checksum uploaded to a second trip is **not** a cross-trip duplicate, and
    each import's stored `source_fingerprint` is namespaced by its own trip.
  - QA-003: re-confirming a resolved candidate is rejected with 409 and creates no second
    booking.
- `tests/product-v2.contract.mjs` — QA-004: asserts the draft trip is written in the single
  import batch (spread `...draftStatements`, exactly one `env.DB.batch(`).
- Existing contract suites (button-size, mobile-ui, smart-import-auth, trip-map, manual-booking)
  were **not weakened**; the frozen SW cache namespace and the "Tickets and documents" concept
  remain locked.

All suites pass: `validate:beta`, `validate:v2`, `validate:major`, `validate:manual-booking`,
`validate:places`.

## 6. Security & privacy posture

Reviewed as strong and unchanged by this pass:
- Session auth, verified-sender mapping, and Google credential verification (RS256, issuer,
  audience, expiry, nonce, verified email, feature gate) all enforced.
- `public/_headers` CSP is strict: `default-src 'self'`, `object-src 'none'`,
  `frame-ancestors 'none'`, no `unsafe-inline` for scripts, `Permissions-Policy geolocation=()`,
  `X-Frame-Options DENY`.
- Output is escaped; uploads receive checksum + structured fields only (no raw bytes / OCR text
  server-side); the no-GPS invariant holds (no `navigator.geolocation`, no "near you" copy, no
  paid maps SDK, no CSP loosening for map hosts).

Documented security limitations (not changed here): the session token lives in `localStorage`
(P2, inherent to the PWA model); inbound DKIM/SPF verification relies on Cloudflare Email Routing
upstream (P2). A CSP `<meta>` fallback (P3) is optional — `_headers` already enforces CSP at the
edge.

## 7. Release recommendation

**Ship-ready on this branch.** All P0/P1 defects are fixed and covered by regression tests, the
high-value P2 correctness/offline/accessibility items are fixed, and the remaining P2/P3 items
are documented with concrete recommendations. No production data was reset or used as fixtures;
all fixes are backward-compatible with existing rows and require no migration.
