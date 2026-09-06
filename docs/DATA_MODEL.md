# Data Model v1

## Migration 0016

`0016_google_auth_smart_import.sql` adds optional `users.avatar_url` and the short-lived `auth_challenges` table used for device-bound Google nonces. Smart Import reuses the existing `imports`, `import_messages` and `import_candidates` tables with `source_type='upload'`; raw files and extracted text are not stored in D1.

## Identity
`users`, `auth_identities`, `devices`.
Internal user IDs never depend on email. Guest-created entities use client-generated UUIDs and can later be claimed by a cloud user.

## Travel model
`trips`, `trip_members`, `travelers`, `locations`, `trip_items`, `trip_item_travelers`.
A trip has no required single destination. `trip_items` provide a universal timeline container; subtype tables hold transport/stay/activity-specific fields.

## Transport and connections
`transport_segments`, `flights`, `connections`.
Connections distinguish protected, self-transfer, planned-transfer, logical, and unknown. Explicit flags represent baggage reclaim, immigration, security, terminal change, and airport change.

## Documents
Private R2 object keys only. `documents` are linked many-to-many to trip items and travelers. Device-side `local_asset_registry` verifies actual offline availability using checksum, not a cloud flag.

## Checklist
Travel-specific `checklist_templates`, `checklist_items`, `trip_checklist_items`, `traveler_checklist_items`. Categories: Documents, Before You Leave, Packing, Custom. Priority: critical/high/medium/low. Some items auto-complete from trip/offline state.

## Imports
`imports`, `import_messages`, `import_candidates`. Deterministic parser only. Ambiguous/unsupported data becomes `needs_confirmation` or a manual-entry recovery path.

## Explainability
`change_events`, `impact_assessments`, `alerts`, optional `field_observations` for volatile fields. High-impact changes are not silently destructive.

## Sync
Entity rows use client-generated IDs, `version`, `updated_at`, `deleted_at`. Mutations are expressed as idempotent sync operations with base version. Conflicts are explicit; tombstones prevent resurrection of deleted entities.

## Planning collections (migration 0025)

`0025_trip_planning_collections.sql` adds `planning_collections` — a 1:1 subtype
of `trip_items` (`type='custom'`, `trip_item_id` PK, immutable `collection_type`
across six kinds) — and `planning_stops`, ordered child places keyed by
`collection_item_id` with their own `position` and sync quartet. Stops are never
`trip_items`, so collection children cannot surface as top-level Timeline rows.
`planning_stops.linked_trip_item_id` links an existing booking without copying
it. See TRIP_PLANNING_COLLECTIONS.md.
