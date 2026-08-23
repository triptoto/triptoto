# tripto.to Technical Blueprint v1.0

## Smart Import and verified identity extension

The mobile client has a provider-oriented, local document-recognition pipeline: detect, extract embedded text/OCR/barcode, classify, extract fields, score confidence, review, then confirm. Original bytes and extraction evidence remain device-local. D1 stores only reviewed structured candidates and confirmed entities. Google Identity Services uses a nonce challenge and the existing provider-subject identity/account migration boundary. Both additions preserve the Worker + D1 architecture; see `SMART_IMPORT.md` and `GOOGLE_AUTH.md`.

## Scope
V1 supports guest-first onboarding, accounts later, trips, multi-city itineraries, travelers, timeline, flights/stays/activities/reservations, documents, forwarded-email/manual import contracts, offline-first use, Ready Offline, Show to Driver, Trip Brain, Impact Engine, Trip Checklist, sharing model, alerts, and privacy-first analytics.

Generative AI is architected behind an `AIProvider` boundary but disabled. Live-flight integration is architected behind `FlightProvider` but disabled. Current flight data is scheduled/confirmed data from user/imported booking information only.

## Capacity baseline
Expected first two months: ~1,200 users. Design headroom: 5,000–10,000 registered users without architectural redesign. Use hard quotas and abuse controls. Paid infrastructure should not be enabled until product metrics justify it.

## Trust model
Each important datum has provenance and confidence:
- CONFIRMED: booking/user-confirmed fact.
- LIVE: provider observation (future, currently disabled).
- ESTIMATED: deterministic calculation.
- UNAVAILABLE: explicitly missing.

Stale information always carries last-updated time. No generated guesses for gate, check-in opening time, duration, or status.

## Trip lifecycle
`draft | upcoming | active | completed | cancelled`; archival is separate (`archived_at`). Support multiple simultaneous trips and long-duration trips.

## Core architecture
Client local store <-> Cloudflare Workers API <-> D1 + private R2. Domain engines are pure deterministic modules so core behavior can run offline.

## Implementation order
1. Data model + versioned migrations.
2. Local offline model and sync protocol.
3. Trip Brain.
4. Impact Engine.
5. Provider abstractions (disabled flight/AI implementations).
6. Backend/API and authorization.
7. Email/import pipeline.
8. UI.
9. Automated scenario tests and beta instrumentation.
