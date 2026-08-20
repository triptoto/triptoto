# Beta quotas and observability

## Capacity baseline
Expected: 1,200 users in two months. Design headroom: 5k–10k registered users.

## Initial server-configurable beta caps
- Active trips/account: 10
- Documents/trip: 30
- Single document: 10 MiB
- Trip members: 10
- Forwarded imports/day/account: 30
- Anonymous users get tighter limits.

These are protection defaults, not product promises; adjust via server configuration.

## Observability
Structured logs with request/error IDs, endpoint latency, import outcome, sync conflicts, storage counters, abuse counters, provider health, and feature flags. Never log sensitive booking/document payloads.

## Product metrics
Track: trip_created, >=2 bookings, Ready Offline completion, checklist usage, What's Next, navigation click, document access, during-trip activity, trip completion, second-trip creation. No sensitive itinerary data in analytics.
