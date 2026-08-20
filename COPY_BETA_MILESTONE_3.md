# tripto.to — Beta Milestone 3

This is a cumulative milestone package through Milestone 3.

## Main additions

- Deterministic forwarded booking-email parser with Safe Mode confirmation.
- Flight and stay candidate extraction without generative AI.
- Ambiguous locale dates are not guessed.
- Airport timezones must be explicitly confirmed before imported flights are created.
- Duplicate/idempotent forwarded-email imports.
- Raw forwarded-email body is parsed in memory and is not persisted.
- Import history, recovery and pending-confirmation UI.
- Local-only offline document storage in IndexedDB while R2 remains disabled.
- Local boarding passes / tickets / confirmations are available offline on this device.
- Per-traveler local document assignment and Ready Offline coverage.
- 10 MB/file and 20 local documents/trip/device beta limits.
- Booking-import quota: 20 previews/trip/rolling 24h.
- Expanded parser, integration and smoke tests.

## Still intentionally OFF

LIVE_FLIGHTS_ENABLED=false
AI_ENABLED=false
GMAIL_SYNC_ENABLED=false
R2_DOCUMENTS_ENABLED=false
ACCOUNT_AUTH_ENABLED=false
SHARING_ENABLED=false
DEMO_TOOLS_ENABLED=false

No new D1 migration is required. 0012_accounts_sharing.sql remains the latest migration.

## Install

```bash
cp -R ~/Downloads/tripto-beta-milestone-3/. ~/triptoto/
cd ~/triptoto

npm install
npm run check:ui
npm run typecheck
npm run test:scenarios
npm run test:integration

npx wrangler deploy
bash scripts/smoke-beta-milestone.sh
```

Expected final line:

```text
Beta Milestone 3 smoke test completed.
```

Then:

```bash
git add .
git commit -m "Add beta milestone 3 deterministic import and offline documents"
git push origin main
```
