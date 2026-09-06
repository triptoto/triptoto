# Trip Planning Collections (Neighborhood Plans + Secondary Mini Timeline)

Planning collections let a traveller group several ordered places inside one
container (a Neighborhood, a Day Trip, a Walking Route) or keep a flat wishlist
(Places to Visit, Food & Drink, Shopping). A scheduled collection appears **once**
on the main Timeline; opening it reveals a **secondary mini timeline** that shows
only *time · dot · place name* — no category icons, no cards, no shadows, no
colour coding. This document is the source of truth for the feature.

This is a real, implemented feature (backend + D1 migration + SPA screens +
offline queue + tests), not a mockup. It is additive: it does not redesign the
existing tripto.to app, navigation, Timeline, or Add Booking flow.

## Concepts

| Type | `collection_type` | Timeline-capable | Child noun |
| --- | --- | --- | --- |
| Neighborhood | `neighborhood` | yes | places |
| Day Trip | `day_trip` | yes | stops |
| Walking Route | `walking_route` | yes | stops |
| Places to Visit | `places_to_visit` | no (wishlist) | places |
| Food & Drink | `food_and_drink` | no (wishlist) | places |
| Shopping | `shopping` | no (wishlist) | places |

- **Timeline-capable** types render on the main Timeline **only when scheduled**
  (`starts_at_utc` is set). Unscheduled ones live in the Planning area.
- **Wishlist** types never appear on the main Timeline regardless of schedule;
  they are organised lists reached from the Planning overview.
- A collection's main-Timeline summary is **computed from its children**, e.g.
  `5 places · 10:00–16:00`. Children never appear as separate top-level rows.

## Data model

Migration `migrations/0025_trip_planning_collections.sql` (next sequential,
additive — no destructive changes).

### `planning_collections` — 1:1 subtype of `trip_items`
A collection reuses a `trip_items` row (`type='custom'`) as its parent so it
inherits Timeline placement, versioning, the sync quartet
(`created_at/updated_at/deleted_at/version`), collaboration and offline caching
for free. The subtype row adds planning metadata.

```
trip_item_id       TEXT PRIMARY KEY REFERENCES trip_items(id) ON DELETE CASCADE
collection_type    TEXT NOT NULL CHECK(... 6 types ...)   -- immutable after creation
city               TEXT
central_location_id TEXT REFERENCES trip_locations(location_id) ON DELETE SET NULL
notes              TEXT
created_by_user_id TEXT
```

### `planning_stops` — child places (never `trip_items`)
Stops live in their own table, so they can never surface as top-level Timeline
rows. The no-duplicate rule is therefore *structural*, not enforced by filtering.

```
id                 TEXT PRIMARY KEY
collection_item_id TEXT NOT NULL REFERENCES planning_collections(trip_item_id) ON DELETE CASCADE
title              TEXT NOT NULL
scheduled_time     TEXT           -- event-local "HH:MM", no date, no GPS
timezone           TEXT
position           INTEGER NOT NULL DEFAULT 0   -- manual order
location_id        TEXT REFERENCES trip_locations(location_id) ON DELETE SET NULL
address_snapshot   TEXT
place_type         TEXT CHECK(... 12 types ...)
notes              TEXT
linked_trip_item_id TEXT REFERENCES trip_items(id) ON DELETE SET NULL  -- link, no copy
status             TEXT CHECK(status IN ('planned','visited','skipped'))
created_by_user_id TEXT
created_at/updated_at/deleted_at/version   -- sync quartet
```

Indexes: `idx_planning_collections_trip`,
`idx_planning_stops_collection ON planning_stops(collection_item_id, position, deleted_at)`,
plus supporting indexes on `location_id` and `linked_trip_item_id`. Queries are
always trip-scoped through the parent `trip_items.trip_id`.

## API — `apps/worker/src/routes/planning-collections.ts`

All routes are under `/api/v1/trips/:tripId/collections`. Route order in
`index.ts` is deliberate: `stops/order` before `stops`, and the stop-by-id
route before the collection-by-id route, so specific paths never get shadowed.

| Method | Path | Handler | Access |
| --- | --- | --- | --- |
| GET | `/collections` | `listCollections` | read (owner/editor/viewer) |
| POST | `/collections` | `createCollection` | write |
| PATCH | `/collections/:id` | `updateCollection` | write |
| DELETE | `/collections/:id` | `deleteCollection` | write |
| POST | `/collections/:id/stops` | `addStop` | write |
| PUT | `/collections/:id/stops/order` | `reorderStops` | write |
| PATCH | `/collections/:id/stops/:stopId` | `updateStop` | write |
| DELETE | `/collections/:id/stops/:stopId` | `deleteStop` | write |

- **Authorization is server-side.** Every handler calls
  `requireTripAccess(env,auth,tripId,write)` — reads require membership, all
  mutations require write (owner/editor). Viewers are rejected server-side even
  if the client is tampered with.
- **Optimistic concurrency.** Every update/delete requires the caller's
  `version`: missing → `400 VERSION_REQUIRED`; mismatch → `409 VERSION_CONFLICT`;
  the guarded `UPDATE ... WHERE version=?` bumps `version+1` and re-asserts.
- **`collection_type` is immutable** after creation → `400 TYPE_IMMUTABLE`.
- **Reorder** validates every id belongs to the collection
  (`400 STOP_NOT_IN_COLLECTION`) and bounds the batch (≤200).
- **Delete soft-deletes the parent only**, cascades a soft-delete to its stops,
  and emits a `trip_item` **tombstone** for sync. Linked bookings
  (`linked_trip_item_id`) are never touched — the relationship simply stops
  rendering.
- Every mutation records a change event via `recordChangeEvent(..., auth)` with
  actor attribution for collaboration history.

## Client — `public/mobile-app.js`

- **Add to your trip** gains a *Plan your days* section with six plan cards
  (`data-action="add-collection"`) alongside the existing Stay and Plans actions.
- **Planning overview** (`planningScreen`) groups collections into *On your
  timeline*, *Planning*, and *Start a plan*. This is one overview screen — it is
  **not** six new bottom-nav tabs.
- **Collection screen** (`collectionScreen`) renders the secondary mini timeline
  as `<ol class="mini-timeline">` of `mini-stop` rows: `mini-stop__time`,
  `mini-stop__rail` (dot + connecting line), `mini-stop__name`. Dots only — there
  is deliberately no `mini-stop__icon`.
- **Dot states** communicate progress by *shape/tone*, never colour alone:
  - `next` — solid dot (the first non-visited, non-skipped stop; exactly one)
  - `future` — outlined dot
  - `past` — muted dot (visited)
  - `skipped` — muted outline **plus strikethrough** on the name
  Each state carries an accessible label (`Next`, `Upcoming`, `Visited`,
  `Skipped`). Derivation is the pure function `collectionStopStates()`.
- **Timeline integration.** `isTimelineVisibleItem()` hides wishlists and
  unscheduled collections from the main Timeline; `timelineGlyph` /
  `timelineSecondary` short-circuit for collections to show the type icon and the
  computed `collectionSummary()`; tapping the row routes to the collection.
- **Ordering** is drag-free reorder via `moveStop` (optimistic + `PUT .../stops/order`),
  persisted by `position` and stable across reloads.
- **No GPS.** The client never requests geolocation; times are event-local
  strings and addresses are optional text snapshots.

### Offline & collaboration
- Trip detail hydration fetches `/collections` as one of the parallel detail
  endpoints; results cache in localStorage and rehydrate offline.
- Mutations made offline are queued with `queuePendingMutation({kind:"collection", ...})`
  and replayed by `flushCollectionsQueue()` on reconnect (create / add-stop /
  reorder / status), then a fresh `loadApp()`.
- Client edit gating (`canEditCurrentTrip`, `VIEWER_BLOCKED_ACTIONS`) hides
  mutating actions for viewers, but the server remains the authority.

## Design contract (enforced by tests)

- No category icons in the mini timeline (`mini-stop__icon` absent).
- No card class, no `box-shadow` on any `mini-*` element (flat).
- Dot size 14–18px; time · rail · content grid layout.
- Dot states styled per state; skipped is struck through, not merely recoloured.
- Neutral CSS tokens only (`--paper/--surface/--ink/--muted`); no
  gradients, no `backdrop-filter`, no raw hex category colours, no purple/blue.
- No emoji anywhere in the feature.

## Tests

- **Contract** — `tests/collections.contract.mjs` (wired into
  `scripts/validate-v2.sh` and `npm run validate:collections`): static
  assertions on route wiring/order, migration model, server-side auth,
  version/immutability/soft-delete/tombstone, position ordering, six frontend
  types, timeline-visibility filter, dots-only mini timeline, CSS design
  contract, viewer-blocked actions, client routes, render switch, offline
  flusher, plus a VM functional test of `collectionStopStates`.
- **Integration** — `tests/integration/major.integration.mjs` drives the real
  route handlers against an in-memory D1: create a scheduled Neighborhood
  (exactly one Timeline row) and an unscheduled wishlist, reject a
  `collection_type` change, add/reorder/update/delete stops (asserting stops are
  never `trip_items`, order persists by position, stale version → 409, a stop
  can link an existing booking without duplicating it), then delete the
  collection and assert the parent + stops soft-delete, the linked booking is
  untouched, and a `trip_item` tombstone is emitted.
- **Mobile UI** — `tests/mobile-ui.contract.mjs` covers the new routes
  (planning / collection / collection-form / stop-form).

### Screenshots
Visual verification at 390×844 (iPhone viewport) could **not** be captured in
this environment: the sandbox has no browser/renderer, so no screenshots were
produced. The design contract is instead enforced by the CSS/markup assertions
listed above. Capture screenshots on a device or in CI with a headless browser
before sign-off.

## Related docs
- `docs/DATA_MODEL.md` — entity catalogue (collections + stops entries).
- `docs/SCREEN_MAP_V2.md` — planning / collection / form screens and routes.
- `docs/PRODUCT_FLOW_V2.md` — Add-to-trip → plan → mini-timeline flow.
- `docs/COLLABORATION_V1.md` — server-side authz + change events for collections.
- `docs/OFFLINE_SYNC.md` — collection outbox and replay.
