# Mobile UI legacy boundary

The default `/` interface contains normal traveler-facing functionality. `/legacy.html` remains available as an advanced beta fallback and is not part of primary navigation.

## Native mobile flows

- View/switch/create trips
- View/filter bookings
- View Flight, Hotel, Train, activity, and reservation details
- Add Flight, Hotel, Train, Activity, Reservation, Traveler, and local Document
- View and update existing checklist items
- View Documents, Ready Offline, Trip Health, Travelers, imports, and pending sync state
- Use verified local documents, directions, Show to Driver, and offline cached trip data

## Remaining legacy flows

- Add a new custom checklist item: no supported create-item API exists; the legacy checklist seeding/manual tooling preserves existing behavior.
- Resolve sync conflicts with keep-local/use-server: the current mobile-safe API reports conflicts but does not expose explicit resolution operations.
- Editing existing traveler and booking records remains in the legacy UI during this milestone. Native add flows are complete, but promoting edit requires locked-screen-safe entry points plus complete version-prefill/conflict recovery on every form.
- Advanced connection editing, sharing administration, deletion previews, support diagnostics, and internal beta tooling.

## Replacement requirements

- Add a versioned checklist create endpoint with category, priority, assignment, and idempotency support.
- Add conflict-resolution endpoints that require the current server version and explicit resolution intent.
- Add traveler-safe API wrappers for any advanced operation promoted into the primary app.

No backend behavior or schema was changed for this milestone.
