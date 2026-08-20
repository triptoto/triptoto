# Beta Candidate 1

Beta Candidate 1 hardens the existing Major Beta Milestone 5–8 for real-world testing. It does not replace the Worker + D1 architecture or enable external providers.

## Material fixes

- What’s Next no longer returns the last past item after a trip has ended.
- Cached route durations older than six hours are unavailable and produce an explicit stale-data issue.
- Future cancelled bookings remain visible to Trip Health.
- Cancelled segments invalidate connection assessments instead of producing reassuring outcomes.
- Connections without a reliable configured buffer remain unavailable; zero is never assumed.
- Completed trips no longer receive preparation warnings.
- Cancelled/skipped stays and transport no longer satisfy Trip Health readiness counts.
- Local documents receive a SHA-256 checksum. Ready Offline and traveler coverage count only checksum-verified files; older unverified files must be saved again.
- Offline operation IDs use `crypto.randomUUID()`.
- Connectivity status and toast messages are exposed to assistive technology; unlabeled icon controls received accessible names.
- Service-worker cache writes are awaited, failed responses are not cached, and the candidate uses a new cache namespace.

## Tested scenarios

The automated candidate matrix covers 30 cases: normal vacation, multi-city, open-jaw, family trip, overnight flight, date-line crossing, cancelled flight, missing delay facts, protected connection, self-transfer, airport change, road trip, mixed flight/train/ferry, offline creation, connectivity restoration, stale shared-trip conflict, changed-hotel overlap, missing document, missing traveler document, low-confidence import, duplicate import, expired guest session contract, DST spring gap, DST autumn overlap, device timezone change after landing, provider outage, stale route data, trip completion, cancelled connection, and unknown connection buffer.

## Feature boundaries

The following remain disabled: generative AI, live flights, Gmail Sync, R2 documents, public account authentication, public sharing, demo tools and ops. Scheduled or confirmed booking data is never presented as live. No paid service was added.

## Migrations

No Beta Candidate 1 migration is required. The schema remains at additive migration `0015_sync_intelligence.sql`.

## Validation

```bash
npm run validate:candidate
```

The deployed validation is `scripts/smoke-beta-candidate.sh`.

## Known limitations

- Generic offline mutations remain queued in Safe Mode and are not automatically merged.
- Public auth and sharing remain unavailable; sharing APIs are only dormant foundations.
- Documents remain device-local while R2 is disabled. Existing pre-candidate local documents lack checksums and must be saved again before Ready Offline treats them as verified.
- No live delay, gate, route-duration or flight-status provider is connected.
- Ambiguous DST overlap times require manual clarification; nonexistent DST-gap times are rejected.
- Automated browser checks cover the candidate contracts, but deployed smoke and hands-on device testing remain release gates.
