# tripto.to — Beta Milestone 2

This is a cumulative milestone package. It includes the prior beta foundation plus the Milestone 2 account/sync/sharing/backup hardening.

## Major additions

- Verified-auth adapter boundary; no fake or browser-claimed login.
- Guest → verified-account migration preview and migration contracts.
- Stable account/session refresh with 90-day sessions.
- Session-recovery behavior that does not silently orphan guest trips.
- Shared-trip owner/editor/viewer permissions and hardened invite flows.
- Invite preview without leaking restricted email addresses.
- JSON export schema v2 and Calendar ICS export.
- Privacy-safe support bundle and stronger diagnostics/request IDs.
- Offline checklist mutation queue with conflict review.
- Account, sharing, backup and invite UI.
- Ready Offline cache age and pending-sync visibility.
- Expanded internal QA demo scenarios.
- Additional DST, date-line, cancellation, provider-outage and airport-change tests.
- Mobile/PWA service-worker improvements.

## Still intentionally disabled

- Generative AI
- Live-flight provider
- Gmail Sync
- R2 Documents
- Public account authentication
- Public sharing
- Internal demo tools

No new D1 migration is required for this milestone. `0012_accounts_sharing.sql` remains the latest migration.

## Install and validate

```bash
cp -R ~/Downloads/tripto-beta-milestone-2/. ~/triptoto/
cd ~/triptoto

npm install
npm run check:ui
npm run typecheck
npm run test:scenarios
npm run test:integration

npx wrangler deploy
bash scripts/smoke-beta-milestone.sh
```

Expected final smoke-test line:

```text
Beta Milestone 2 smoke test completed.
```

Then:

```bash
git add .
git commit -m "Add beta milestone 2 account sync sharing and backup hardening"
git push origin main
```
