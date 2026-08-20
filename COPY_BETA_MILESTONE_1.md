# tripto.to — Beta Milestone 1 (cumulative)

This is a cumulative source package. You do **not** need to install the earlier v6/v7 ZIPs first.

## Included in this milestone

- booking edit/delete hardening
- traveler management and assignments
- protected/self-transfer connection management
- event-local timezone + DST recovery
- Trip Settings and lifecycle controls
- safe trip deletion
- PWA/mobile/guest safeguards
- account status API
- secure internal guest → verified-account migration contract
- owner/editor/viewer sharing foundation
- hashed, expiring trip invite contracts
- JSON trip export
- privacy-safe diagnostics
- guarded internal demo/test-trip generator
- extended timezone/date-line/connection scenario suite
- local in-memory D1 integration suite
- one new migration: `0012_accounts_sharing.sql`

All external integrations remain disabled by default.

## Install

```bash
cp -R ~/Downloads/tripto-beta-milestone-1/. ~/triptoto/
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

Expected final smoke line:

```text
Beta milestone smoke test completed.
```

## Commit after successful deployment

```bash
git add .
git commit -m "Add consolidated beta account sharing and test foundation"
git push origin main
```

## Do not enable yet

Keep these false:

```text
LIVE_FLIGHTS_ENABLED=false
AI_ENABLED=false
GMAIL_SYNC_ENABLED=false
R2_DOCUMENTS_ENABLED=false
ACCOUNT_AUTH_ENABLED=false
SHARING_ENABLED=false
DEMO_TOOLS_ENABLED=false
```

Do not create fake account sign-in just to turn on sharing. The guest → account migration function must only be called after a real Apple/Google/email-code adapter verifies the identity.
