# Backend API v1.1

Adds the first travel-specific backend layer on top of Backend API v1:

- traveler CRUD with per-trip beta limits and versioning;
- trip-scoped locations, including local-language name/address, coordinates, timezone, IATA/ICAO/station codes;
- transport creation for flight/train/bus/ferry/car/transfer/other;
- flights remain scheduled/confirmed only: `live_data_enabled=0` and no live-flight provider calls;
- stays with traveler assignment;
- explicit connection modeling, including self-transfer and airport-change flags;
- deterministic connection Impact Engine;
- change-event history for newly added entities;
- migration `0011_trip_locations.sql` prevents global location enumeration and scopes locations to trips.

Before deploying this patch, apply the new D1 migration remotely:

```bash
npx wrangler d1 migrations apply tripto-db --remote
```

Then push/deploy and run:

```bash
bash scripts/smoke-api-v1.1.sh
```
