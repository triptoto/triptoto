# tripto.to — Beta Milestone 4

This is a cumulative package through launch-readiness hardening.

## Major additions

- Privacy-safe beta activation metrics in D1.
- Beta Readiness UI based on concrete activation signals, not a fake score.
- 30 guest sessions/hour per salted network/browser fingerprint; raw IP is never stored.
- 300 authenticated/device writes/hour fixed-window guard.
- 64 KiB default JSON body limit; 128 KiB forwarded-email preview limit.
- Consistent 20 forwarded imports/day and 20 local documents/trip/device beta quotas.
- 429 responses include Retry-After.
- Hidden aggregate ops endpoint behind OPS_ENABLED + OPS_SECRET.
- Integration-health schema for future providers/quotas/kill-switch observability.
- Full guest/account deletion preview and server-side data deletion contracts.
- Browser local IndexedDB/cache/site-data cleanup after confirmed deletion.
- Node 22 development baseline and GitHub validation workflow.
- Release-health and ops scripts.
- Expanded launch, privacy, rate-limit, deletion and integration tests.

## New migration

`migrations/0013_beta_launch.sql`

## Install and validate

```bash
cp -R ~/Downloads/tripto-beta-milestone-4/. ~/triptoto/
cd ~/triptoto

npm install
npm run check:ui
npm run typecheck
npm run test:scenarios
npm run test:integration

npx wrangler d1 migrations apply tripto-db --remote
npx wrangler deploy

bash scripts/smoke-beta-milestone.sh
```

Expected final line:

```text
Beta Milestone 4 smoke test completed.
```

Then:

```bash
git add .
git commit -m "Add beta milestone 4 launch readiness and privacy hardening"
git push origin main
```

## Feature state

Keep these disabled:

```text
LIVE_FLIGHTS_ENABLED=false
AI_ENABLED=false
GMAIL_SYNC_ENABLED=false
R2_DOCUMENTS_ENABLED=false
ACCOUNT_AUTH_ENABLED=false
SHARING_ENABLED=false
DEMO_TOOLS_ENABLED=false
OPS_ENABLED=false
```

Keep `BETA_METRICS_ENABLED=true`; it is internal D1-only coarse telemetry with no itinerary text, location history, confirmation numbers, email body, invite tokens or document bytes.
