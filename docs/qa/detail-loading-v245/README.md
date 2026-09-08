# Detail loading regression — v245

The user reported `Plan unavailable` under `Updating your trip…` when opening a Neighborhood. This was reproduced against the actual v244 shell, with a cached plan and delayed local API responses.

## Cause and correction

On reload, `selectedId` initially contained the readable URL slug. `loadApp()` hydrated the cached collection but rendered before resolving that slug to the collection ID. The detail renderer therefore treated a present plan as missing until the network requests completed.

The final build resolves cached route selection before its first paint. Incomplete caches show loading until the requested data arrives. All detail requests now expose a pending state, missing-detail renderers respect it, and route recovery waits for it. Earlier concurrent responses cannot overwrite newer results or dismiss their loading state. Clearing or switching an uncached trip also clears its old collection data.

## Verification

- The new executable contract failed on v244 with `actual: Plan unavailable`, `expected: plan`, before the fix.
- `node tests/detail-loading.contract.mjs` passes cached readable URLs for Neighborhood, collection editing and place editing; both collection IDs; partial/cold cache; background refresh; both request completion orders; failed refresh; no-trip cleanup; navigation during loading; and confirmed missing records.
- `npm run validate:v2` passes on the final release source, including the new regression contract. See `validation.log`.
- Wrangler production dry run passed using the verified `travelinkme@gmail.com` account.
- Browser fixture at 390×844: v244 reproduced the reported screen with the activity notice. The corrected shell displayed the existing Neighborhood during the same delayed responses. The DOM observer recorded zero unavailable-state observations in the corrected run.
- While background requests were pending, opening a place menu, opening Edit place, and returning to Neighborhood did not expose the unavailable state. The eight-second per-request fixture also exercised cached recovery from request timeouts.
- With the collections endpoint absent from cache and two-second response delays, the corrected app displayed loading and then the Neighborhood; zero unavailable-state observations. This was repeated on the final build after the route-recovery guard was added.

This is a local browser regression fixture with synthetic data, not production mutation evidence or a physical iPhone Safari test. An initial fixture token used seconds instead of the app's millisecond expiry format; it was corrected before the valid reproduction. The harness then used a single active fixture configuration because cookies were not propagated by this test browser. Run cases sequentially.

## Reproduce locally

```sh
npm run build:app-shell
node tests/detail-loading.contract.mjs
python3 scripts/design-audit/detail-loading-server.py
```

Open `http://127.0.0.1:4195/collections/old-town?build=before&cache=full&delay=8` for v244, or use `build=after` for the current shell. Use `cache=partial&delay=2` for missing cached collection data. The server binds only to loopback and never forwards API traffic to production.

Production verification is recorded separately in `release.json` after deployment.
