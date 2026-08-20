# Beta Launch Readiness — Milestone 4

Milestone 4 adds launch controls without adding a paid dependency.

## Privacy-safe activation metrics

`beta_events` stores only:
- internal user/device/trip IDs,
- a whitelisted coarse event name,
- UTC timestamp/day,
- release identifier.

It never stores itinerary text, confirmation numbers, addresses, location history, forwarded-email bodies, invite tokens, or document bytes.

Metrics cover the demand-validation signals selected for the beta: first trip, second booking, What's Next, Timeline, Ready Offline, trip completion, and second trip.

## Abuse controls

- Guest-session creation: 30/hour per salted network/browser fingerprint. Raw IP addresses are never stored.
- Authenticated/guest-device writes: 300/hour per actor.
- Forwarded booking previews: 20/trip/rolling 24h.
- JSON request bodies: 64 KiB default; forwarded-email preview: 128 KiB.
- Active trips: 10.
- Trip members: 10.
- Local beta documents: 20/trip/device, 10 MiB/file.

429 responses include `Retry-After` when the fixed window is exhausted.

## Ops summary

`/api/v1/internal/ops/summary` is hidden unless both `OPS_ENABLED=true` and a long `OPS_SECRET` are configured. Wrong/missing secrets deliberately return 404. The endpoint exposes aggregate counts only.

Keep `OPS_ENABLED=false` for normal public beta until an ops secret is deliberately configured.

## Data deletion

`GET /api/v1/account/deletion-preview` explains deletion impact.

`DELETE /api/v1/account` with `{ "confirm": "DELETE" }` permanently deletes server-side guest/account-owned trips, devices/sessions, identities and memberships according to account mode. Orphan location records are cleaned up. Only an anonymous aggregate deletion counter remains.

Local IndexedDB documents/cache/site data are separately cleared by the web client after the server confirms deletion.

## Runtime baseline

`.nvmrc` pins local development to Node 22 and GitHub validation runs on Node 22. Scenario scripts use the `tsx` ESM loader rather than the `tsx` CLI.
