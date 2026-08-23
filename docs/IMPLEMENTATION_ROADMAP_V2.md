# tripto.to Product V2 Implementation Roadmap

Status: approved product model; implementation plan only. Production remains on V1 until explicitly promoted. Every phase is a reviewable PR and is disabled by default behind `V2_ENABLED=false` unless noted.

## Rollout contract

- Preserve the current Worker, D1 schema, deterministic Trip Brain and Impact Engine, offline/sync semantics, document integrity, and V1 routes.
- Additive migrations only. Preview D1 first, production only after backup/rollback verification.
- Keep AI, live flights, Gmail Sync, R2, public sharing, demo tools, and ops disabled.
- Rollback is configuration-first: set `V2_ENABLED=false`; schema additions remain inert.
- Each PR must pass `npm run check:ui`, `npm run validate:candidate`, its new focused tests, and deployed preview smoke tests.

## PR 1 — V2 shell and flag boundary

- **Dependencies:** none.
- **Frontend:** introduce isolated V2 route/shell, tokens, mobile viewport, error/loading/offline boundaries; no traveler flow yet.
- **Worker/API:** expose the existing release/flag state only; no data-contract change.
- **D1:** none.
- **Flags:** add `V2_ENABLED=false`; preview may enable it explicitly.
- **Compatibility:** Product V2 is now the sole traveler-facing shell; the obsolete V1 theme stack has been retired.
- **Tests:** flag routing, static assets, accessibility shell, service-worker cache separation.
- **Rollback:** disable flag and purge only the V2 shell cache.

## PR 2 — Welcome, Tour, and authentication transition

- **Dependencies:** PR 1; Google OAuth client for preview.
- **Frontend:** Welcome, four-step Tour, Google action, transient authenticating state; no separate sign-in decision screen.
- **Worker/API:** Google ID-token verification endpoint, nonce/state checks, account-session issuance.
- **D1:** reuse `users`, `auth_identities`, `devices`, and `identity_events`; add an index only if query evidence requires it.
- **Flags:** `V2_ENABLED`; add `GOOGLE_AUTH_ENABLED=false` until preview credentials exist.
- **Compatibility:** guest sessions and V1 account-disabled behavior remain valid.
- **Tests:** token validation, replay/nonce failure, cancel/retry, zero-trip and returning-user routing, no Gmail scopes.
- **Rollback:** disable Google auth/V2; existing sessions remain readable.

## PR 3 — Create Trip and single-range calendar

- **Dependencies:** PR 2.
- **Frontend:** destination, one start/end range calendar, optional name, keyboard-safe sticky save, discard warning.
- **Worker/API:** reuse trip creation; normalize validation errors without changing existing fields.
- **D1:** none expected.
- **Flags:** `V2_ENABLED`.
- **Compatibility:** preserve missing dates on legacy trips; new V2 trips require the approved fields.
- **Tests:** range selection, iOS/Chromium/Firefox behavior, failure value preservation, idempotent submit, offline rejection.
- **Rollback:** disable V2; created trips remain standard V1 trips.

## PR 4 — Timeline foundation and trip selector

- **Dependencies:** PR 3.
- **Frontend:** chronological Timeline, compact first-booking confirmation, active/upcoming selector, Create New Trip entry.
- **Worker/API:** reuse itinerary/trip reads; add no presentation-specific endpoint.
- **D1:** none.
- **Flags:** `V2_ENABLED`.
- **Compatibility:** incomplete legacy dates render truthfully; Account retains history rather than active switching.
- **Tests:** ordering, empty/one/many bookings, timezone boundaries, selector ownership, no duplicate trip manager.
- **Rollback:** V1 routes remain authoritative.

## PR 5 — Add Booking hub and manual categories

- **Dependencies:** PR 4.
- **Frontend:** Add Booking hub, category selector, type-specific manual forms, return directly to Timeline.
- **Worker/API:** reuse deterministic booking creation and optimistic locking; align field-level errors.
- **D1:** additive category/type support only if existing booking types cannot represent an approved category.
- **Flags:** `V2_ENABLED`; individual unfinished category flags default false.
- **Compatibility:** existing items and unknown fields remain untouched; never infer missing facts.
- **Tests:** all categories, validation, duplicates, offline queue, conflict visibility, first-booking return.
- **Rollback:** hide unfinished categories; existing rows remain readable.

## PR 6 — Upload/import review

- **Dependencies:** PR 5.
- **Frontend:** device file chooser, deterministic candidate review, low-confidence and unsupported states.
- **Worker/API:** reuse import parser; add structured candidate/error responses if needed.
- **D1:** none expected; additive import audit fields only if absent.
- **Flags:** `V2_ENABLED`; existing import feature flag remains authoritative.
- **Compatibility:** original files and existing import states are preserved; no AI.
- **Tests:** airline/hotel/train/activity fixtures, ambiguity, locale dates, duplicates, missing timezones, integrity.
- **Rollback:** disable V2 upload entry; retain imported records.

## PR 7 — Inbound booking email

- **Dependencies:** PRs 4–6; verified domain and Cloudflare Email Routing preview setup.
- **Frontend:** `bookings@tripto.to` instructions, verified sender management, ambiguous-trip choice and review.
- **Worker/API:** inbound email handler, sender challenge/verification, deterministic parsing, quarantine and trip matching.
- **D1:** additive `verified_senders`, `sender_challenges`, `inbound_messages`, and match/audit tables with retention indexes.
- **Flags:** `INBOUND_EMAIL_ENABLED=false`; `GMAIL_SYNC_ENABLED=false` remains unchanged.
- **Compatibility:** email is additive; manual/upload paths remain available.
- **Tests:** spoofing, replay, oversized/unsupported attachment, ambiguous match, retention, QA-metric exclusion.
- **Rollback:** disable route/flag; quarantine retained messages per retention policy.

## PR 8 — Booking detail and deterministic editing

- **Dependencies:** PR 5.
- **Frontend:** type-specific detail, provenance labels, edit/recovery/conflict states.
- **Worker/API:** reuse versioned updates; expose only existing facts and conflict metadata.
- **D1:** none.
- **Flags:** `V2_ENABLED`.
- **Compatibility:** scheduled data never implies live status; legacy nulls show unavailable.
- **Tests:** every booking type, stale/estimated labels, destructive confirmations, v1/v2 concurrency.
- **Rollback:** V1 detail remains accessible.

## PR 9 — Tickets and Documents

- **Dependencies:** PRs 4, 6, and 8.
- **Frontend:** contextual booking documents, trip-level grouped list, traveler coverage, link/unlink and device/offline states.
- **Worker/API:** reuse document metadata/integrity endpoints; add association endpoints only if absent.
- **D1:** additive association/audit indexes if necessary; no R2 dependency.
- **Flags:** `V2_ENABLED`; `R2_DOCUMENTS_ENABLED=false`.
- **Compatibility:** device-local bytes remain device-local; booking deletion never silently deletes documents.
- **Tests:** verified/unverified, traveler-specific requirements, unlink/relink, offline open, unsynced removal safeguards.
- **Rollback:** disable V2 document UI; associations remain compatible.

## PR 10 — Timeline contextual priority

- **Dependencies:** PRs 4, 8, and 9.
- **Frontend:** exactly one contextual surface plus focused resolution detail.
- **Worker/API:** share deterministic priority output across Timeline, Trip Brain, and Impact Engine consumers.
- **D1:** none unless assessment-version metadata is missing; any change additive.
- **Flags:** `V2_TIMELINE_PRIORITY_ENABLED=false`, nested under `V2_ENABLED`.
- **Compatibility:** strict order is urgent/critical, NEXT/current, time-sensitive prep, general prep, informational.
- **Tests:** individual and combined signals, ties, stale assessments, no contradictory cards, deterministic snapshots.
- **Rollback:** disable priority flag and fall back to current V1 health ordering.

## PR 11 — Account and trip history

- **Dependencies:** PRs 2 and 4.
- **Frontend:** profile, Past, Cancelled, booking email, Help/Tour, privacy, sign-out and deletion safeguards.
- **Worker/API:** account/history reads; guarded sign-out/delete paths.
- **D1:** none expected; additive cancellation metadata only if current lifecycle cannot express it.
- **Flags:** `V2_ENABLED`; destructive account actions separately disabled until audited.
- **Compatibility:** active/upcoming trips remain solely in selector; unsynced changes block destructive local removal.
- **Tests:** past/cancelled filtering, session expiry, sign-out conflicts, deletion confirmation and audit.
- **Rollback:** V1 Account remains reachable.

## PR 12 — Offline, sync, PWA, and accessibility hardening

- **Dependencies:** all traveler flows above.
- **Frontend:** offline labels, cached state, conflict recovery, focus/keyboard/screen-reader/mobile viewport audit.
- **Worker/API:** no new product capability; validate sync and cache contracts.
- **D1:** none.
- **Flags:** no new capability flag; V2 remains preview-only.
- **Compatibility:** preserve offline-first queue and document-integrity semantics exactly.
- **Tests:** online→offline→edit→reconnect, unresolved conflicts, stale data, local removal guard, reduced motion, 360/390/430 widths.
- **Rollback:** disable V2; service-worker cache version can be reverted independently.

## PR 13 — Controlled rollout and V1 fallback

- **Dependencies:** PRs 1–12 and product acceptance.
- **Frontend:** release instrumentation and explicit V1 fallback only; no redesign.
- **Worker/API:** preview smoke and readiness release identifiers; QA/test-data exclusion.
- **D1:** apply all approved additive migrations to preview, then production after backup verification; no data copy from production to preview.
- **Flags:** internal QA → allowlisted beta → measured percentage → default-on; emergency `V2_ENABLED=false` at every stage.
- **Compatibility:** rollback uses Git/Worker deployment history rather than a second live theme stack.
- **Tests:** full candidate validation, 10 production scenarios, deployed smoke, cross-version data reads/writes, rollback rehearsal.
- **Rollback:** disable V2, restore prior Worker deployment if needed, leave additive schema intact, verify health and core V1 smoke.

## External configuration required later

### Cloudflare

- Separate preview Worker and D1 database; never bind preview to production D1.
- Email Routing Worker route and DNS only for PR 7.
- Environment-specific secrets, release tag, CSP/connect-src updates, and service-worker cache versioning.

### Google

- OAuth web client for each approved origin, exact redirect/origin allowlists, consent branding, nonce/state verification, and no Gmail/Drive/Calendar scopes.

### Data migrations

- Likely only inbound-email tables in PR 7 and narrowly justified indexes/metadata elsewhere.
- All migrations are additive, versioned, preview-tested, and readable by the prior Worker before production application.

## Principal risks

1. Authentication guest adoption can orphan or duplicate ownership if not transactional and idempotent.
2. Inbound email increases abuse, spoofing, retention, and privacy surface.
3. V1/V2 concurrent writes can expose optimistic-lock and schema-compatibility defects.
4. Timeline priority can drift between deterministic consumers without a shared contract.
5. Service-worker caches can strand users on mixed V1/V2 assets.
6. Device-local documents cannot be verified server-side and must never be overstated as cloud-ready.
