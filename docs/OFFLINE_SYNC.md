# Offline / Sync v1

## Smart Import

The selected original remains in the existing IndexedDB document store and is checksum-verified. Text, EML, ICS, DOCX and PKPASS recognition can run offline after the mobile shell is cached. PDF/OCR support files are cached on first use; a device that has never loaded them cannot perform that fallback while fully offline. A recognized structured preview created offline is placed in the existing pending-mutation store and submitted after reconnect. Submission creates only a pending import review—never a confirmed booking—so sync cannot bypass explicit user confirmation.

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
