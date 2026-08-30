# Live Flights: AeroDataBox / RapidAPI

Status: implemented behind a disabled kill switch for a controlled beta. This integration must remain disabled until the owner completes the account, terms, credential, and real-flight checks below.

## Provider and verified free-plan assumptions

Checked 2026-08-30 against the AeroDataBox and RapidAPI pricing/API pages:

- Provider: AeroDataBox through RapidAPI.
- RapidAPI Basic listing: `$0/month`, 600 API units/month, 2,400 requests/month, and 1 request/second.
- `GET /flights/number/{flightNumber}/{dateLocal}` is documented as Tier 2 and therefore costs 2 API units per request.
- The theoretical unit-limited ceiling is therefore 300 flight-status calls/month. tripto.to deliberately caps itself below that at 240 calls/month (480 units) and 8 calls/day by default.
- RapidAPI account/card requirements and the exact commercial/production and data-retention rights of the subscribed free plan are account terms, not established by repository code. The owner must confirm them before enabling any public or commercial beta. AeroDataBox's public comparison distinguishes commercial end use, sublicensing, and cache-retention rights by plan; the integration therefore remains disabled until the exact RapidAPI subscription terms are reviewed.
- Flight Alert uses a separate credit system. This branch does not assume that webhooks are included in the selected free plan and does not create a paid webhook dependency.

These numbers are configurable because provider plans can change. Never raise the caps from memory; re-check the current subscribed plan first.

## Architecture

`FlightProvider` is the provider-independent boundary in `packages/providers`. The application and D1 layers consume only normalized `FlightStatus`; they never receive the AeroDataBox response shape or credentials. `AeroDataBoxFlightProvider` is the first adapter. `DisabledFlightProvider` is the default zero-network implementation.

The lookup key combines the normalized marketing/operating flight number, event-local departure date, departure airport, and arrival airport. A result is accepted only when the deterministic score has a unique strong match. Ambiguous results remain unavailable and never overwrite booking facts. Codeshare results retain marketing identity and resolve the `IsOperator` record when present.

Provider facts are stored separately from user/imported facts. Scheduled booking times, manual terminal/gate, confirmation numbers, and documents are not overwritten. The UI may prefer a fresh actual/estimated time or live terminal/gate for presentation, but it labels the provenance.

## Data and migration

Migration `0021_live_flights.sql` adds:

- `flight_live_status`: normalized current provider state, freshness, backoff, match quality, and cancellation confirmation state.
- `flight_provider_cache`: provider/lookup-level normalized shared cache. No raw provider payload is retained.
- `flight_provider_usage`: request/outcome/unit ledger used by the hard guards.
- an `integration_health` row for `flight/aerodatabox`.

No destructive migration is used. Existing flight/manual data remains authoritative.

## Refresh policy

The Cron Trigger runs every 30 minutes in UTC, but a flight is only selected when its own `next_refresh_at` is due. Each run examines a bounded candidate set and calls the provider for at most 2 flights by default.

- More than 48 hours before departure: no polling; schedule first check at T-48h.
- T-48h to T-12h: approximately every 12 hours.
- T-12h to T-3h: approximately every 4 hours.
- Under 3 hours: approximately every 90 minutes.
- Active flight: every 1–2 hours, subject to the 60-minute minimum.
- First cancellation report: provisional; request independent confirmation.
- Confirmed cancellation: low-frequency watch for a provider correction.
- Landed or more than two hours after expected arrival: stop.

The client manual Refresh action uses the same minimum interval and returns HTTP 429 plus `Retry-After` when checked too recently. There is no retry loop.

## Quota protection and shared cache

Before any outbound request, D1 atomically inserts a reserved usage row only if both daily and monthly request counts are below their configured limits. If reservation fails, no provider call is made. A 429 or provider outage is recorded, a bounded backoff is applied, and the trip continues to work from scheduled/cached data.

Successful normalized results are cached by lookup. Multiple trips tracking the same flight can reuse one observation without another provider call. A cached observation does **not** count as independent cancellation evidence.

Default guards:

- daily: 8 requests;
- monthly: 240 requests (480 Tier-2 units);
- minimum refresh: 60 minutes;
- maximum provider calls per Cron run: 2.

Aggregate usage is visible in the protected ops summary. Ordinary travelers are not shown quota numbers.

## Freshness, offline, and cancellation safety

Freshness is persisted per normalized observation. The UI distinguishes:

- `Live update` with last-update age while evidence is fresh and online;
- `Saved update · may be out of date` when cached/offline/expired;
- `Scheduled data` when no current evidence exists.

The UI never invents “On time”; it uses that phrase only for fresh provider status explicitly normalized from `Expected`. Provider failure never becomes a full-screen trip failure.

Cancellation needs two independent provider observations at least 30 minutes apart. The first is `Cancellation reported`, not a destructive trip cancellation. Recovery also requires two independent non-cancelled observations. No booking, document, connection, or traveler assignment is automatically deleted.

## Impact Engine and change history

Normalized fingerprints suppress duplicate changes. Meaningful transitions (gate/terminal changes, delay, departure, landing, diversion, cancellation report/confirmation/recovery) create deterministic change events. Live delay/diversion/cancellation feeds deterministic Impact Engine assessments; notification delivery is intentionally out of scope.

## Configuration and owner setup

1. In RapidAPI, subscribe to the AeroDataBox **FREE** plan. Confirm its current limits, billing/card behavior, and commercial/beta terms.
2. Obtain the RapidAPI key. Do not paste it into source, documentation, a PR, or chat output.
3. From the correct Cloudflare account/worktree, set the secret:

   ```sh
   npx wrangler secret put AERODATABOX_RAPIDAPI_KEY
   ```

4. Leave `LIVE_FLIGHTS_ENABLED=false`.
5. Confirm `AERODATABOX_RAPIDAPI_HOST=aerodatabox.p.rapidapi.com` and keep the conservative request caps.
6. Add only internal user IDs to `LIVE_FLIGHT_BETA_USER_IDS`; keep `LIVE_FLIGHT_BETA_ONLY=true`.
7. Apply migration 0021 to a preview D1 database, deploy a preview Worker, and run the provider smoke checks.
8. Set `LIVE_FLIGHTS_ENABLED=true` only in that isolated preview/beta environment.
9. Test representative EL AL, Wizz Air, Ryanair, and Lufthansa flights where covered. Confirm match identity, scheduled time, terminal/gate availability, delay, freshness, request counters, and the kill switch.
10. Re-disable immediately if plan/terms, quota, match quality, or provenance is uncertain.

No production secret is created and no live integration is enabled by this branch.

## Validation

`npm run validate:live-flights` covers fixtures for scheduled/on-time, delayed/gate/baggage, boarding, departed, en-route, landed, diverted, codeshare/operator, cancelled, missing optional fields, date-line, DST, and ambiguous flights. It also covers 404/no flight, malformed JSON, 429/Retry-After, 500, timeout, strict matching, normalization, cache-safe cancellation, confirmation and recovery, impact severity, disabled provider, UI/privacy contracts, and 1/10/100/1,000-flight quota projections.

The local D1 integration verifies zero calls while disabled, explicit monitoring, provider caching, the independent cancellation rule, hard quota rejection before network, and usage counters.

## Current request estimate

The deterministic reference schedule produces about 8 uncached provider requests for one normally operating four-hour flight tracked from T-48h through landing:

| Monitored flights/month | Uncapped estimate | Calls allowed by default monthly guard |
| ---: | ---: | ---: |
| 1 | 8 | 8 |
| 10 | 80 | 80 |
| 100 | 800 | 240 |
| 1,000 | 8,000 | 240 |

Shared-cache hits reduce real usage when travelers track the same flight. Disruptions and cancellation verification may increase it. The 600-unit free plan is suitable only for a small, controlled beta under the 240-call guard—not 100+ independently monitored flights/month.

## Known limitations and future migration

- Provider coverage and terminal/gate/baggage completeness vary by airline/airport.
- No webhook or paid subscription is used.
- No push notification delivery is implemented.
- Free-plan commercial, cache-retention, and account/card requirements require owner verification. Long-term historical provider facts must remain disabled until those rights are confirmed for the exact subscribed plan.
- The default budget is global; a future provider/account model may add per-tenant allocation.
- A future provider can implement `FlightProvider` without changing UI/D1 normalized consumers. Switching providers requires a new adapter, provider-keyed cache/usage configuration, fixtures, and a controlled migration—not an application redesign.

Recommendation: **IMPLEMENTED BUT KEEP DISABLED** until owner account/terms and isolated beta smoke tests are complete.
