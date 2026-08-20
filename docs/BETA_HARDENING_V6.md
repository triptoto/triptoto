# tripto.to Beta Hardening v6

This patch hardens the beta around editing, travelers, connections, timezone correctness, and recovery UX.

## Backend
- PATCH/DELETE transport bookings with optimistic version checks and change history.
- PATCH/DELETE stays with optimistic version checks and change history.
- PATCH/DELETE connections, including protected vs self-transfer.
- Soft-delete/tombstone behavior for transport/stays.
- Active connection listing ignores deleted itinerary items.
- No new D1 migration is required.

## Frontend
- Traveler manager: add, edit, remove.
- Traveler assignment when creating flights, trains, and stays.
- Connection manager with Protected / Self-transfer / Planned / Unknown.
- Edit/delete Flight, Train/ground transport, and Stay bookings.
- Flight and train `datetime-local` values are converted using explicit event-local IANA timezones.
- Timeline and booking cards render event-local times instead of blindly using device timezone.
- DST-gap/ambiguous-time recovery message instead of silently inventing a timestamp.
- Recovery dialog for failed booking operations.
- Location reuse reduces duplicate airports/stations during manual entry.

## Still intentionally disabled
- Generative AI
- Live flight provider
- R2 document storage

## Install

```bash
cp -R ~/Downloads/tripto-beta-hardening-v6/. ~/triptoto/
cd ~/triptoto

npm run check:ui
npm run typecheck
npx wrangler deploy
```

After deploy:

```bash
bash scripts/smoke-api-v1.2.sh
```

Expected final line:

```text
Backend API v1.2 edit/delete smoke test completed.
```

Then commit:

```bash
git add .
git commit -m "Harden booking editing travelers and connections v6"
git push origin main
```
