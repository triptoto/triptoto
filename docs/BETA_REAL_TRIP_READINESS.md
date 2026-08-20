# Beta Real-Trip Readiness

This branch adds controlled real-trip QA support without enabling paid or deferred integrations.

## Validation

```bash
npm ci
npm run test:readiness
npm run validate:candidate
```

Read-only selected-trip diagnostic:

```bash
npm run diagnose:trip -- <trip-id> --local
npm run diagnose:trip -- <trip-id> --remote
```

## Migration

`0016_qa_isolation.sql` additively adds nullable `qa_marker` columns and partial indexes to devices, trips and beta events. It classifies only exact historical repository smoke app versions. It does not delete rows.

```bash
npx wrangler d1 migrations apply tripto-db --remote
```

## Deploy and smoke

```bash
npx wrangler deploy
bash scripts/smoke-beta-candidate.sh https://tripto-api.travelinkme.workers.dev
```

Every smoke-created guest device/trip receives a unique `qa:` marker. The script prints that marker and retains the data for inspection.

## QA cleanup

Preview exact-marker cleanup:

```bash
bash scripts/cleanup-qa-data.sh --remote --marker qa:<exact-marker>
```

Execute only after review:

```bash
bash scripts/cleanup-qa-data.sh --remote --marker qa:<exact-marker> --execute
```

The cleanup refuses non-`qa:` markers, defaults to dry-run, requires an exact marker, and deletes only guest devices plus trips/events carrying that same marker. Devices linked to a user are excluded.

## Rollback

Worker rollback does not require reversing the additive migration; older code ignores nullable marker columns. Roll back the Worker to tag `beta-candidate-1` or the prior deployment using the established Cloudflare rollback procedure. Do not drop marker columns or indexes during an incident.

## Disabled integrations

AI, live flights, Gmail Sync, R2 documents, public account auth, sharing, demo tools and ops retain their existing disabled production flags. No paid service or generative AI is introduced.
