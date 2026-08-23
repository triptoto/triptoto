# Remaining traveler-facing Mobile UI v1

The remaining screens extend the locked premium mobile system without changing the approved Home, Flight Detail, Timeline, Hotel Detail, driver view, navigation, typography, or palette.

## Shared rules

- 390×844 is the primary viewport; 360, 375, 393, and 430 px widths use the same centered mobile shell.
- Touch controls are at least 44×44 px and fixed navigation is protected by safe-area-aware page padding.
- Normal confirmed bookings omit repetitive status labels. Exceptions remain visible.
- Scheduled travel data is neutral provenance and is never presented as live.
- Only checksum-verified local files are considered ready offline.
- Event date/time fields use event-local IANA timezones and reject DST gaps/overlaps.
- Conflicts and unsynced changes remain visible and are never silently overwritten or discarded.
- Empty, loading, offline, and recovery states use concise traveler-facing language.

## Service worker

The Product V2 shell has one cache key. API responses are never cached by the service worker, and the current premium hotel fallback is precached.

## Feature boundaries

AI, live flights, Gmail Sync, R2 documents, public authentication, public sharing, demo tools, and ops remain disabled. No paid dependency or D1 migration was added.
