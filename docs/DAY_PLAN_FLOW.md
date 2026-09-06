# Add to Your Trip — Day Plan & Save for Later

This is the source of truth for the redesigned **Add to Your Trip** planning
flow. It is additive and reuses the existing trip-item / activity / location /
timeline model; there is **no** separate `day_plans` parent entity and **no**
separate Day Plan timeline. Grouped Neighborhoods are documented in
`docs/TRIP_PLANNING_COLLECTIONS.md`.

## Three intentions

`addToTripScreen()` (`/add`, screen `add-trip`) is exactly three tappable rows,
headed by the real trip name ("Add to Italy Grand Tour"):

1. **Add a booking** (`open-add-booking` → `addBookingScreen`) — the existing
   Upload / Forward / Add-manually booking flow, unchanged.
2. **Day Plan** (`open-day-plan` → `dayPlanScreen`) — plan what to see and do.
3. **Save for Later** (`open-save-later` → `saveLaterScreen`) — unscheduled ideas.

Create-trip and other global actions are intentionally **not** here. Stay is not
a top-level intention — it lives under Add a booking. The ubiquitous "+" opens
this hub (`open-add` → `route("add-trip")`), except on `/trips` where it creates
a trip.

## Day Plan — ten activity types

`DAY_PLAN_TYPES` (in `public/mobile-app.js`) — traveller-facing labels; the
internal enum name is stored in `activities.activity_type` (free text, ≤80, no
migration needed) and never shown:

| Enum (`activity_type`) | Label | Grouped |
| --- | --- | --- |
| `neighborhood` | Neighborhood | yes (collection) |
| `attraction` | Attraction | no |
| `museum_culture` | Museum & Culture | no |
| `food_drink` | Food & Drink | no |
| `shopping` | Shopping | no |
| `tour_experience` | Tour & Experience | no |
| `nature_outdoors` | Nature & Outdoors | no |
| `beach_relax` | Beach & Relax | no |
| `entertainment` | Entertainment | no |
| `viewpoint_scenic` | Viewpoint & Scenic | no |

- **Neighborhood** (`day-plan-type`, `type="neighborhood"`) routes to
  `/collections/new/neighborhood` — the only grouped type, the only creatable
  planning collection. See `TRIP_PLANNING_COLLECTIONS.md`.
- The other nine route to `/day-plan/new/<type>` and open `dayPlanFormScreen()`,
  the shared activity form.

## Shared activity form (`dayPlanFormScreen` / `saveDayPlanForm`)

- **Required:** Name or place. **Optional:** Day, Start time, End time, Address,
  Notes. Day and time live **inside** the form — there is never a separate
  choose-day screen.
- **Contextual day prefill (`activeTimelineDateISO`).** Opening Day Plan while a
  specific day is in view prefills that day (still changeable). No day in
  context → unselected. Opening from Save for Later never prefills a day.
- **Save behaviour.** A day is present → the activity is created with
  `status:"confirmed"`, `startsAtUtc` from `resolveEventLocalDateTime`
  (event-local timezone, DST-safe) and appears **directly** in the main Timeline
  for that day. No day → `status:"planned"`, `startsAtUtc:null`, kept as a
  Save-for-Later idea (never given an invented date). An optional address is
  persisted as a trip location via `createManualVenueLocation`.
- Editing an existing activity reuses the same form via `/day-plan/item/<id>`
  and PATCHes with the item `version` (optimistic concurrency).

## Save for Later (`saveLaterScreen`)

- Unscheduled ideas grouped into **Place**, **Food & Drink**, **Shopping**
  (`SAVE_LATER_TYPES`; bucket derived from `activity_type` via
  `saveLaterBucketForType`). Each item shows "Not scheduled".
- Nothing here appears on the main Timeline until scheduled:
  `isSaveForLaterItem` (an `activity`/`reservation` with `starts_at_utc == null`)
  is excluded by `isTimelineVisibleItem`; `saveForLaterItems()` surfaces them.
- **Scheduling** taps `schedule-save-later` → opens the item's edit form
  (`/day-plan/item/<id>`); adding a Day places it in the Timeline. Adding a new
  idea (`add-save-later`) opens the shared form with `dayPlanContext="save-later"`
  so no day is prefilled.

## Data model & safety

- No new parent entity, no migration. Single activities and Save-for-Later ideas
  are ordinary `activities` rows (`kind:"activity"`). Neighborhoods reuse
  `planning_collections` (neighborhood-only; see the collections doc).
- Reuses existing timeline ordering, event-local time, history, offline queue,
  collaboration (server-side `requireTripAccess`), and versioning.
- **Privacy.** The flow never requests GPS or uses `navigator.geolocation`; a
  saved place is only ever handed to an external map on explicit tap.

## Tests

- `tests/mobile-ui.contract.mjs` — routes (`add-trip`, `day-plan`,
  `day-plan-form`, `save-later`), the three-intention hub, the ten Day Plan
  types, the shared activity form (name required; day/time inside; contextual
  prefill), Save-for-Later grouping and the timeline-visibility filter.
- `tests/collections.contract.mjs` + `tests/integration/major.integration.mjs`
  — neighborhood-only creation (`COLLECTION_TYPE_UNSUPPORTED` for others).
