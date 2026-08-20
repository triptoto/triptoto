# tripto.to Beta Milestone 3

Milestone 3 focuses on real-trip activation without introducing paid dependencies.

## Added

- deterministic forwarded booking-email parser;
- import preview / confirmation / rejection workflow;
- duplicate-safe idempotent imports;
- no raw forwarded-email body persistence;
- ambiguity-safe date handling;
- import history and recovery UI;
- local-only IndexedDB document storage while R2 is disabled;
- per-traveler local document assignment;
- Ready Offline verification based on actual local files;
- import quotas and file-size/count quotas;
- support-bundle import counts;
- expanded parser and D1 integration tests;
- Milestone 3 deployment smoke test.

## Still disabled

- generative AI;
- live-flight provider;
- Gmail Sync;
- R2 cloud documents;
- public verified account auth;
- public trip sharing;
- demo tools.

The product continues to treat unavailable data as unavailable and requires explicit confirmation before uncertain parsed booking data can change a trip.
