# Backend API v1

## Smart Import and Google identity additions

- `POST /api/v1/trips/:tripId/imports/upload/preview` accepts checksum plus structured local-recognition fields; it never accepts file bytes or OCR text.
- `POST /api/v1/trips/:tripId/imports/:importId/resolve` confirms or rejects a reviewed candidate.
- `POST /api/v1/auth/google/challenge` creates a short-lived device-bound nonce.
- `POST /api/v1/auth/google` verifies a GIS credential and migrates or attaches the current device.
- `POST /api/v1/auth/signout` rotates the device back to a guest session without deleting local documents.

## Security model

V1 uses signed 30-day guest sessions so write endpoints are not publicly writable. The signing secret is a Cloudflare Worker secret and MUST NOT be committed.

Set it once after deployment configuration:

```bash
openssl rand -base64 48
npx wrangler secret put SESSION_SECRET
```

Paste the generated value at the prompt.

## Public endpoints

- `GET /health` — D1 connectivity and feature flags.
- `GET /api/v1` — API metadata.
- `POST /api/v1/session/guest` — create a device-backed guest session.

All remaining endpoints require `Authorization: Bearer <token>`.

## Trips

- `GET /api/v1/trips`
- `POST /api/v1/trips`
- `GET /api/v1/trips/:tripId`
- `PATCH /api/v1/trips/:tripId`
- `DELETE /api/v1/trips/:tripId`

Updates/deletes require the current `version`, providing optimistic concurrency protection.

## Timeline

- `GET /api/v1/trips/:tripId/timeline`
- `POST /api/v1/trips/:tripId/timeline`
- `PATCH /api/v1/trips/:tripId/timeline/:itemId`
- `DELETE /api/v1/trips/:tripId/timeline/:itemId`

## Checklist

- `GET /api/v1/trips/:tripId/checklist`
- `POST /api/v1/trips/:tripId/checklist`
- `POST /api/v1/trips/:tripId/checklist/seed`
- `PATCH /api/v1/trips/:tripId/checklist/:itemId`

Checklist seeding is deterministic and remains generative-AI free.

## Trip Brain

- `GET /api/v1/trips/:tripId/brain`

Returns deterministic next-item evaluation plus top open Smart Essentials and active alerts. Travel-time recommendations remain unavailable until a trustworthy travel-duration source exists; the API does not invent them.
