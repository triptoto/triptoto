# tripto.to Beta Milestone 1

This milestone consolidates the current beta architecture into a larger, testable release rather than a chain of tiny UI patches.

## What is included

### Account/auth foundation — disabled until a verified provider is connected

- `GET /api/v1/account` reports guest/account state without inventing authentication.
- The server-side `migrateGuestDeviceToUser()` contract migrates a verified guest device to a stable internal user ID.
- Guest migration transfers trip ownership, inserts owner memberships, updates imports/sync ownership, links the device, and records an identity event.
- There is deliberately **no public endpoint that can create/claim an account without verified Apple, Google, or email-code authentication**.
- `ACCOUNT_AUTH_ENABLED=false` remains the default.

### Shared trips / roles foundation — disabled by default

The existing owner/editor/viewer authorization model is now backed by invite/member APIs:

- sharing status
- member listing
- owner-only role changes and removal
- expiring invitation tokens stored only as SHA-256 hashes
- invitation acceptance for verified accounts
- pending invitation limits

`SHARING_ENABLED=false` remains the default. Guest sessions cannot manage sharing.

### JSON export / backup groundwork

`GET /api/v1/trips/:tripId/export/json` exports structured trip data including:

- trip metadata
- travelers
- locations
- timeline
- transport/flights
- stays
- activities/reservations
- connections
- checklist
- traveler checklist state
- document metadata

Document file bytes are not exported.

### Diagnostics

`GET /api/v1/diagnostics` exposes privacy-safe beta diagnostics:

- guest/account mode
- device/app/API versions
- trip count
- beta limits
- feature flag state
- server time

It does not expose secrets or booking contents.

### Internal demo/test-trip generator

A guarded internal generator can create:

- normal trip
- tight self-transfer
- overnight flight
- family trip
- missing-essentials trip

It is protected by both:

- `DEMO_TOOLS_ENABLED=true`
- a non-committed `DEMO_TOOLS_SECRET`

The production/default state is disabled.

### Timezone/DST contract tests

A new deterministic time package resolves event-local date/time values against an IANA timezone and detects:

- exact local time
- invalid DST spring-forward local time
- ambiguous DST fall-back local time

The extended scenario suite covers DST, UTC+14/date-line behavior, cancelled itinerary events, leave-now behavior, protected connections, self-transfers, baggage reclaim, airport changes, unknown buffers, overnight travel and long-duration trips.

### Frontend beta changes

Trip Settings now includes:

- explicit guest/account state
- guest → account migration readiness explanation
- shared-trip readiness/role status
- JSON export
- diagnostics
- explicit offline-write behavior
- safe-area/mobile/PWA polish
- invite-link handling that refuses to imply an invite can be accepted before verified account auth exists

## New migration

`0012_accounts_sharing.sql`

It adds:

- `identity_events`
- `trip_invites`

No provider credentials are required to apply this migration.

## Feature flags

Defaults remain conservative:

```text
LIVE_FLIGHTS_ENABLED=false
AI_ENABLED=false
GMAIL_SYNC_ENABLED=false
R2_DOCUMENTS_ENABLED=false
ACCOUNT_AUTH_ENABLED=false
SHARING_ENABLED=false
DEMO_TOOLS_ENABLED=false
```

## Deployment

```bash
cd ~/triptoto
npm run check:ui
npm run typecheck
node --experimental-strip-types tests/scenarios/core.scenarios.ts
node --experimental-strip-types tests/scenarios/beta.scenarios.ts
npx wrangler d1 migrations apply tripto-db --remote
npx wrangler deploy
bash scripts/smoke-beta-milestone.sh
```

Expected smoke-test completion:

```text
Beta milestone smoke test completed.
```

## Optional internal demo tools

Do **not** enable this for normal beta users.

If internal QA later needs server-generated scenarios:

1. Create a Cloudflare secret named `DEMO_TOOLS_SECRET`.
2. Set `DEMO_TOOLS_ENABLED=true` temporarily.
3. Set the same secret only in your local shell as `TRIPTO_DEMO_SECRET`.
4. Run:

```bash
bash scripts/create-demo-trip.sh https://tripto-api.travelinkme.workers.dev self_transfer
```

Disable `DEMO_TOOLS_ENABLED` again when finished.

## Deliberately still not connected

- Apple Sign in
- Google Sign in
- email-code delivery
- live flight provider
- generative AI
- Gmail Sync
- R2 document storage

The architecture now has a controlled connection point for these features without pretending they are live today.
