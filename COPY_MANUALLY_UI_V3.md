# tripto.to UI v3 patch

This patch upgrades the working frontend foundation with:
- Flight cards using scheduled/confirmed data only
- Stay/Hotel cards
- Preparing Mode / Travel Mode banner
- Ready Offline status based on actual cached datasets
- Show to Driver full-screen cached-address mode
- richer Timeline rendering
- hotel/stay manual add flow

No AI, live-flight provider, or R2 integration is enabled.

Copy over the repo and run:

```bash
cp -R ~/Downloads/tripto-ui-v3/. ~/triptoto/
cd ~/triptoto
npm run check:ui
npm run typecheck
npx wrangler deploy
```

Then commit/push if successful.
