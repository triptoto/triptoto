# tripto.to Beta Usability v7

Adds product-level trip management on top of Beta Hardening v6.

## Included
- Trip Settings screen
- title/date/lifecycle editing
- lifecycle states: draft, upcoming, active, completed, cancelled
- destructive delete confirmation with optimistic `version`
- guest beta warning so users know not to clear browser storage before real account auth is connected
- per-trip local cache clearing without deleting D1 data
- PWA manifest/install prompt support
- trip-card Settings shortcuts
- safer recovery copy for version conflicts and destructive actions

## Intentionally not added
- Real Apple/Google/email account sign-in
- Cross-device restore
- AI
- live-flight provider
- R2 documents

Those remain behind the existing architecture boundaries.

## Install

Apply Beta Hardening v6 first if you have not done so, then:

```bash
cp -R ~/Downloads/tripto-beta-usability-v7/. ~/triptoto/
cd ~/triptoto

npm run check:ui
npm run typecheck
npx wrangler deploy
```

No D1 migration is required.

Then:

```bash
git add .
git commit -m "Add trip settings lifecycle and beta safeguards v7"
git push origin main
```
