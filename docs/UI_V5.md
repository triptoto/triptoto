# tripto.to UI v5

Beta-ready first-run experience:
- polished onboarding
- first-trip creation
- setup progress
- Quick Add actions
- Preparing dashboard
- persistent selected view

No new backend migration is needed.

Install:

```bash
cp -R ~/Downloads/tripto-ui-v5/. ~/triptoto/
cd ~/triptoto
npm run check:ui
npm run typecheck
npx wrangler deploy
```

Then commit and push if successful.
