# Offline / Sync v1

## Offline cache
Automatically cache the active/upcoming window: timeline, travelers, locations, hotel contacts, scheduled flight information, last-known status metadata, selected documents, QR/boarding passes, checklists, alerts, and Trip Brain state.

## Ready Offline
The UI must verify physical local files and checksum. Per-traveler document coverage is shown where relevant.

## Sync
Each operation has an immutable operation UUID, entity ID, base version, payload, and status. Server applies only once (idempotent). If the server version differs, create a conflict. Field-disjoint changes may merge; same-field critical conflicts require user resolution.

## Return online
Fetch cloud deltas -> compare versions -> apply safe operations -> resolve conflicts -> refresh network-dependent data -> rerun Trip Brain -> rerun Impact Engine.

## Data-loss protection
Show pending-sync state; warn before logout/local-data removal when unsynced edits exist.
