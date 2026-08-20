# tripto.to UI v4

First full Add Booking flow:
- Flight
- Hotel / Stay
- Train
- Car / Transfer
- Activity / Reservation

Also:
- Flight details
- Stay details
- stronger Preparing Mode

Flight information remains scheduled/confirmed only. Live flight data is disabled.
AI and R2 remain disabled.

Install:

```bash
cp -R ~/Downloads/tripto-ui-v4/. ~/triptoto/
cd ~/triptoto
npm run check:ui
npm run typecheck
npx wrangler deploy
```

Then commit and push if successful.
