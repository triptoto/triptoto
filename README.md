# tripto.to

tripto.to is an offline-first travel companion for organizing trips, bookings, travelers, timelines, travel essentials and what comes next.

## Mobile App UI v1

The approved mobile-first interface is the default `/` experience. The previous advanced beta interface remains available at `/legacy.html`.

See `INSTALL_MOBILE_APP_UI_V1.md` and `docs/MOBILE_APP_UI_V1.md`.

## Current beta candidate

The `beta-candidate-1` branch contains Beta Candidate 1 (`0.9.0-beta.1`), built as a focused hardening layer on the cumulative Major Beta Milestone 5–8. See `docs/BETA_CANDIDATE_1.md`.

## Major beta foundation

The repository includes the cumulative Major Beta Milestone 5–8:

- Cloudflare Worker + D1 backend;
- deterministic Trip Brain and Expanded Trip Health;
- flights, trains, cars/transfers, stays, activities and reservations;
- journey groups for multi-city/open-jaw/mixed travel;
- traveler-specific seat, baggage and ticket details;
- travel contacts and explicit deadline/time-marker semantics;
- forwarded-email import confirmation without generative AI;
- local offline documents while cloud storage is disabled;
- offline sync cursors, change feed, idempotency and conflict visibility;
- privacy-safe beta metrics, quotas and deletion controls;
- PWA/static-assets interface and Major Trip workspace.

## Validation

```bash
npm install
npm run validate:candidate
```

## Remote D1 and deployment

```bash
npx wrangler d1 migrations apply tripto-db --remote
npx wrangler deploy
bash scripts/smoke-major-milestone.sh
```

## Disabled integrations

Generative AI, live-flight provider, Gmail Sync, R2 Documents, public account authentication, public sharing, demo tools and ops are disabled by default.

See `COPY_MAJOR_BETA_MILESTONE_5_8.md` and `docs/MAJOR_MILESTONE_5_8.md`.
