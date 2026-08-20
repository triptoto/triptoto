# Data Model v1

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
