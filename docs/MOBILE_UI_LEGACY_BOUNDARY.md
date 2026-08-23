# Retired mobile UI boundary

Product V2 is the only traveler-facing presentation layer. The obsolete `/legacy.html` page, layered milestone themes, bridge script, and workspace overlay are no longer shipped or cached.

## Native mobile flows

- View/switch/create trips
- View/filter bookings
- View Flight, Hotel, Train, activity, and reservation details
- Add Flight, Hotel, Train, Activity, Reservation, Traveler, and local Document
- Create, view, and update checklist items
- View Documents, Ready Offline, Trip Health, Travelers, imports, and pending sync state
- Use verified local documents, directions, Show to Driver, and offline cached trip data

## Advanced boundaries

- Sync conflicts stay visible, but keep-local/use-server remains unavailable until explicit version-aware resolution APIs exist.
- Traveler editing is native and version-aware. Other edit actions appear only when Product V2 has a safe matching API flow.
- Provider, ops, demo, and sharing administration remain disabled and are not traveler-facing.

## Replacement requirements

- Add conflict-resolution endpoints that require the current server version and explicit resolution intent.
- Add traveler-safe API wrappers for any advanced operation promoted into the primary app.

No D1 schema change was required for presentation cleanup.
