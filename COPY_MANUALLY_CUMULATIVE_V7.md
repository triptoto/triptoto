# tripto.to Cumulative Beta Patch v7

This single patch includes both:

1. Beta Hardening v6
   - edit/delete transport and stays
   - traveler management
   - protected/self-transfer connections
   - event-local timezone conversion and DST recovery
   - recovery UX and optimistic version handling

2. Beta Usability v7
   - Trip Settings
   - lifecycle controls
   - safe trip deletion
   - guest-session safeguards
   - per-trip cache clearing
   - PWA manifest/install support

## Apply

```bash
cp -R ~/Downloads/tripto-beta-cumulative-v7/. ~/triptoto/
cd ~/triptoto

npm run check:ui
npm run typecheck
npx wrangler deploy
```

No D1 migration is required.

After deployment, run the backend edit/delete smoke test:

```bash
bash scripts/smoke-api-v1.2.sh
```

Expected:

```text
Backend API v1.2 edit/delete smoke test completed.
```

Then commit:

```bash
git add .
git commit -m "Add beta hardening settings and lifecycle v7"
git push origin main
```
